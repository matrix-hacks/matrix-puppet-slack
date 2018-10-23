"use strict";
const config = require('./config.json');

class mdtoslack {
  constructor() {
  }

  _getUser(u) {
    const isMe = u === config.puppet.id;
    const userid = isMe ? this.app.client.getSelfUserId() : this.app.getThirdPartyUserIdFromMatrixGhostId(u);
    if (!this.app.client.getUserById(userid)) {
      return u;
    }
    return `<@${userid}>`;
  }

  _getChannel(c) {
    let chanid;
    try {
      chanid = this.app.getThirdPartyRoomIdFromMatrixRoomId(c);
    } catch (e) {
      // fallback copy & modify from getThirdPartyUserIdFromMatrixGhostId of matrix-puppet-bridge
      const svcPrefix = this.app.getServicePrefix();
      const domain = this.app.domain;
      const patt = new RegExp(`^#${svcPrefix}_(.+)$`);
      const localpart = c.replace(':'+domain, '');
      const matches = localpart.match(patt);
      if (!matches || !matches[1]) {
        return c;
      }
      chanid = matches[1];
    }
    const chan = this.app.client.getChannelById(chanid);
    if (!chan) {
      return c;
    }
    return `<#${chan.id}|${chan.name}>`;
  }

  _matchMention(match) {
    const name = match[1];
    const mxid = match[2];

    var action = match[2].substr(0,1), p;

    //console.log(action);
    //console.log(name, mxid, match[0], match[1], action, p);
    switch(action) {
      case "!":
        //return this._payloads(match[1]);
        return match[1];
      case "#":
        return this._getChannel(match[2]);
      case "@":
        return this._getUser(match[2]);
      default:
        return match[1];
    }
  }

  _publicParse(text) {
    if (typeof text !== 'string') {
      return text;
    }
    const patterns = [
      {p: /\[([^\]]+)\]\(https:\/\/matrix.to\/\#\/([^)]+)\)/g, cb: 'mention'},
    ];
    for (let p = 0; p < patterns.length; p++) {
      let pattern = patterns[p],
          original = text,
          result, replace;

      while ((result = pattern.p.exec(original)) !== null) {
        switch(pattern.cb) {
          case "mention":
            replace = this._matchMention(result);
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

  parse(app, text) {
    this.app = app;
    return this._publicParse(text);
  }
}

if (!module.parent) {
  const MX_TP = {
    '@slack_FOO_USLACKBOT:matrix': 'USLACKBOT',
  };
  const USERS = {
    'USLACKBOT': {
      id: 'USLACKBOT',
      name: 'slackbot',
    },
  };
  const CHANS = {
    'test': {
      id: 'CTEST0000',
      name: 'test',
    },
  }
  const app = {
    client: {
      getChannelById: (id) => CHANS[id],
      getUserById: (id) => USERS[id],
      getSelfUserId: (id) => {},
    },
    domain: 'matrix',
    getServicePrefix: () => 'slack_FOO',
    getThirdPartyUserIdFromMatrixGhostId: (id) => MX_TP[id],
  }
  const parser = new mdtoslack();
  console.log(parser.parse(app, '[slackbot](https://matrix.to/#/@slack_FOO_USLACKBOT:matrix)'));
  console.log(parser.parse(app, '[slackbot](https://matrix.to/#/@slack_FOO_USLACKBOT:matrix): [slackbot](https://matrix.to/#/@slack_FOO_USLACKBOT:matrix)'));
  console.log(parser.parse(app, '[#test](https://matrix.to/#/#slack_FOO_test:matrix)'));
} else {
  module.exports = mdtoslack;
}
