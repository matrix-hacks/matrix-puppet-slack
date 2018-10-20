"use strict";
const mdtoslack = require('./mdtoslack');
const TurndownService = require('turndown');
const parser = new mdtoslack();

const turndown = TurndownService({
  codeBlockStyle: 'fenced',
});

const mxtoslack = function(app, msg) {
  return parser.parse(app, turndown.turndown(msg));
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
  const app = {
    client: {
      getChannelById: () => {},
      getUserById: (id) => USERS[id],
      getSelfUserId: (id) => {},
    },
    getThirdPartyUserIdFromMatrixGhostId: (id) => MX_TP[id],
  }
  console.log(mxtoslack(app, '@room'));
  console.log(mxtoslack(app, '<a href="https://matrix.to/#/@slack_FOO_USLACKBOT:matrix">slackbot</a>:'));
  console.log(mxtoslack(app, '<a href="https://matrix.to/#/@slack_FOO_USLACKBOT:matrix">slackbot</a>: <a href="https://matrix.to/#/@slack_FOO_USLACKBOT:matrix">slackbot</a>'));
  console.log(mxtoslack(app, '<pre><code>test\n</code></pre>\n'));
} else {
  module.exports = mxtoslack;
}
