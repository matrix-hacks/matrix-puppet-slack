// https://github.com/canozokur/slacktomd
const slacktomd = require('./slacktomd');
const parser = new slacktomd();

const slackdown = async function(app, msg) {
  return await parser.parse(app, msg);
}

if (!module.parent) {
  var app = {
    client: {
      getUserById: () => {},
      getChannelById: () => {},
    }
  };
  slackdown(app, 'Card moved: "<https://trello.com/c/z1m8Yndl|ignore this card! testing slack&lt;-&gt;matrix bridge with respect to trello>" from list "Doing" to list "ToDo"').then((md) => {
    var showdown  = require('showdown');
    var converter = new showdown.Converter();
    var html      = converter.makeHtml(md);
    console.log(html);
  });
} else {
  module.exports = slackdown;
}
