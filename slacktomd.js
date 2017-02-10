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
    var retVal = null;
    this.users.filter(username => {
      if (username.id === 'U' + u) {
        retVal = username.name;
      }
    })[0];
    if (retVal) {
      return '@' + retVal;
    }
    return u;
  }

  _getChannel(c) {
    var retVal = null;
    this.channels.filter(chan => {
      if (chan.id === 'C' + c) {
        retVal = chan.name;
      }
    })[0];
    if (retVal) {
      return '#' + retVal;
    }
    return c;
  }

  _matchTag(match) {
    var action = match[1].substr(0,1), p;

    switch(action) {
      case "!":
        return this._payloads(match[1]);
      case "#":
        p = this._payloads(match[1], 2);
        let c = p.length == 1 ? p[0] : p[1];
        return this._getChannel(c);
      case "@":
        p = this._payloads(match[1], 2);
        let u = p.length == 1 ? p[0] : p[1];
        return this._getUser(u);
      default:
        p = this._payloads(match[1]);
        return this._markdownTag("href", p[0], (p.length == 1 ? p[0] : p[1]));
    }
  }

  _markdownTag(tag, payload, linkText) {
    if(!linkText) {
      linkText = payload;
    }

    switch(tag) {
      case "italic":
        return "_" + payload + "_";
        break;
      case "bold":
        return "**" + payload + "**";
        break;
      case "fixed":
        return "`" + payload + "`";
        break;
      case "blockFixed":
        return "```" + payload + "```";
        break;
      case "strike":
        return "~~" + payload + "~~";
        break;
      case "href":
        return "[" + linkText + "](" + payload + ")";
        break;
      default:
        return payload;
        break;
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
    var prefix_ok = match.index == 0;
    var postfix_ok = match.index == match.input.length - match[0].length;

    if(!prefix_ok) {
      let charAtLeft = match.input.substr(match.index - 1, 1);
      prefix_ok = this._isWhiteSpace(charAtLeft);
    }

    if(!postfix_ok) {
      let charAtRight = match.input.substr(match.index + match[0].length, 1);
      postfix_ok = this._isWhiteSpace(charAtRight);
    }

    if(prefix_ok && postfix_ok) {
      return tag;
    }
    return false;
  }

  _publicParse(text) {
    if (typeof text !== 'string') {
      return text;
    }
    var patterns = [
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
            replace = this._matchTag(result);
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
            break;
        }

        if (replace) {
          text = text.replace(result[0], replace);
        }
      }
    }
    return text;
  }

  parse(text, users, channels) {
    this.users = users;
    this.channels = channels;
    return this._publicParse(text);
  }
}

module.exports = slacktomd;
