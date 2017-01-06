const config = require('./config.json');
const PORT = 4000;
const SlackStrategy = require('passport-slack').Strategy;
const passport = require('passport');
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const app = express();

// setup the strategy using defaults 
passport.use(new SlackStrategy({
  clientID: config.slack.app_client_id,
  clientSecret: config.slack.app_secret,
  scope: ['client']
}, (accessToken, _refreshToken, _profile, done) => {
  fs.writeFile(__dirname+'/config.json', JSON.stringify(Object.assign({}, config, {
    slack: {
      user_access_token: accessToken,
      app_client_id: config.slack.app_client_id,
      app_secret: config.slack.app_secret
    }
  }), null, 2), done);
}));

app.use(passport.initialize());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// path to start the OAuth flow
app.get('/auth/slack', passport.authorize('slack'));

// OAuth callback url
// this must be configured in the oauth section of your slack app settings
app.get('/auth/slack/callback',
  passport.authorize('slack', {failureRedirect: '/' }),
  (req, res) => res.redirect('/')
);

app.get('/', (req, res)=> {
  var html = [];
  if ( config.slack.user_access_token ) {
    html.push('<p>you have an access token set currently</p>');
    html.push('<a href="/auth/slack">renew access token</a>');
    html.push('<a href="/_close">close the server</a>');
  } else {
    html.push('<p>you do not currently have an access token set</p>');
    html.push('<a href="/auth/slack">request access token</a>');
  }
  res.send(html.join('\n'));
});

app.get('/_close', (req, res) => {
  res.send('OK');
  process.nextTick(()=>process.exit(1));
});

app.listen(PORT, ()=> {
  console.log("listening on port", PORT);
});
