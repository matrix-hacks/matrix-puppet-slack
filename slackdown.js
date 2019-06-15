// https://github.com/canozokur/slacktomd
const slacktomd = require('./slacktomd');
const parser = new slacktomd();

const slackdown = async function(app, msg) {
  return await parser.parse(app, msg);
}

if (!module.parent) {
  const app = {
    client: {
      getUserById: () => {},
      getChannelById: () => {},
    }
  };
  slackdown(app, 'Card moved: "<https://trello.com/c/z1m8Yndl|ignore this card! testing slack&lt;-&gt;matrix bridge with respect to trello>" from list "Doing" to list "ToDo"').then((md) => {
    const showdown  = require('showdown');
    const converter = new showdown.Converter();
    const html      = converter.makeHtml(md);
    console.log(html);
  });
} else {
  module.exports = slackdown;
}
