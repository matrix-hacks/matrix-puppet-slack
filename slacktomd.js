"use strict";

class slacktomd {
  constructor() {
  }

  _payloads(tag, start) {
    if(!start) {
      start = 0;
    }
    let length = tag.length;
    return this._pipeSplit(tag.substr(start, length - start));
  }

  _pipeSplit(payload) {
    return payload.split('|');
  }

  _tag(tag, attributes, payload) {
    if(!payload) {
      payload = attributes;
      attributes = {};
    }

    let html = "<".concat(tag);
    for (let attribute in attributes) {
      if (attributes.hasOwnProperty(attribute)) {
          html = html.concat(' ', attribute, '="', attributes[attribute], '"');
      }
    }
    return html.concat('>', payload, '</', tag, '>');
  }

  _getUser(u) {
    // Here we want to prevent slackdown from processing the mention,
    // but we delay the processing of the user id until app.js so that we can
    // seperate the handling of the plain text and formatted bodies.
    return `USER_MENTION_HACK${u}END_USER_MENTION_HACK`;
  }

  async _getChannel(c) {
    const chan = await this.app.client.getChannelById(c);
    if (chan) {
      const id = this.app.getRoomAliasFromThirdPartyRoomId(c);
      // update room profile
      return `[${chan.name}](https://matrix.to/#/${id})`;
    }
    return c;
  }

  async _matchTag(match) {
    const action = match[1].substr(0,1);
    let p;

    switch(action) {
      case "!":
        return this._payloads(match[1]);
      case "#":
        p = this._payloads(match[1], 1);
        {
          const c = p.length == 1 ? p[0] : p[1];
          return await this._getChannel(c);
        }
      case "@":
        p = this._payloads(match[1], 1);
        {
          const u = p.length == 1 ? p[0] : p[1];
          return this._getUser(u);
        }
      default:
        p = this._payloads(match[1]);
        return this._markdownTag("href", p[0], (p.length == 1 ? p[0] : p[1]));
    }
  }

  _markdownTag(tag, payload, linkText) {
    payload = payload.toString();

    if(!linkText) {
      linkText = payload;
    }

    switch(tag) {
      case "italic":
        return "_" + payload + "_";
      case "bold":
        return "**" + payload + "**";
      case "fixed":
        return "`" + payload + "`";
      case "blockFixed":
        return "```\n" + payload.trim() + "\n```";
      case "strike":
        return "~~" + payload + "~~";
      case "href":
        return "[" + linkText + "](" + payload + ")";
      default:
        return payload;
    }
  }

  _matchBold(match) {
    return this._safeMatch(match, this._markdownTag("bold", this._payloads(match[1])));
  }

  _matchItalic(match) {
    return this._safeMatch(match, this._markdownTag("italic", this._payloads(match[1])));
  }

  _matchFixed(match) {
    return this._safeMatch(match, this._markdownTag("fixed", this._payloads(match[1])));
  }

  _matchBlockFixed(match) {
    return this._safeMatch(match, this._markdownTag("blockFixed", this._payloads(match[1])));
  }

  _matchStrikeThrough(match) {
    return this._safeMatch(match, this._markdownTag("strike", this._payloads(match[1])));
  }

  _isWhiteSpace(input) {
    return /^\s?$/.test(input);
  }

  _safeMatch(match, tag) {
    let prefix_ok = match.index == 0;
    let postfix_ok = match.index == match.input.length - match[0].length;

    if(!prefix_ok) {
      const charAtLeft = match.input.substr(match.index - 1, 1);
      prefix_ok = this._isWhiteSpace(charAtLeft);
    }

    if(!postfix_ok) {
      const charAtRight = match.input.substr(match.index + match[0].length, 1);
      postfix_ok = this._isWhiteSpace(charAtRight);
    }

    if(prefix_ok && postfix_ok) {
      return tag;
    }
    return false;
  }

  async _publicParse(text) {
    if (typeof text !== 'string') {
      return text;
    }
    const patterns = [
      {p: /<(.*?)>/g, cb: "tag"},
      {p: /\*([^\*]*?)\*/g, cb: "bold"},
      {p: /_([^_]*?)_/g, cb: "italic"},
      {p: /`([^`]*?)`/g, cb: "fixed"},
      {p: /```([^`]*?)```/g, cb: "blockFixed"},
      {p: /~([^~]*?)~/g, cb: "strikeThrough"}
    ];

    for (let p = 0; p < patterns.length; p++) {
      let pattern = patterns[p],
          original = text,
          result, replace;

      while ((result = pattern.p.exec(original)) !== null) {
        switch(pattern.cb) {
          case "tag":
            replace = await this._matchTag(result);
            break;
          case "bold":
            replace = this._matchBold(result);
            break;
          case "italic":
            replace = this._matchItalic(result);
            break;
          case "fixed":
            replace = this._matchFixed(result);
            break;
          case "blockFixed":
            replace = this._matchBlockFixed(result);
            break;
          case "strikeThrough":
            replace = this._matchStrikeThrough(result);
            break;
          default:
            return text;
        }

        if (replace) {
          text = text.replace(result[0], replace);
        }
      }
    }
    return text;
  }

  async parse(app, text) {
    this.app = app;
    return await this._publicParse(text);
  }
}

module.exports = slacktomd;
