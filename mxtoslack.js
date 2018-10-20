"use strict";
const mdtoslack = require('./mdtoslack');
const TurndownService = require('turndown');
const parser = new mdtoslack();

const turndown = TurndownService({
  codeBlockStyle: 'fenced_mod',
});

// copy from https://github.com/domchristie/turndown/pull/228
turndown.addRule('removeTrailingFencedCodeBlock', {
  filter: function (node, options) {
    return (
      options.codeBlockStyle === 'fenced_mod' &&
      node.nodeName === 'PRE' &&
      node.firstChild &&
      node.firstChild.nodeName === 'CODE'
    )
  },

  replacement: function (content, node, options) {
    var className = node.firstChild.className || ''
    var language = (className.match(/language-(\S+)/) || [null, ''])[1]

    return (
      '\n\n' + options.fence + language + '\n' +
      node.firstChild.textContent.replace(/^\s+|\s+$/g, '') +
      '\n' + options.fence + '\n\n'
    )
  }
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
