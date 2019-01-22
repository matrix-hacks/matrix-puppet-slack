# matrix-puppet-slack

This is an unofficial matrix slack bridge that works by means of [user puppetting](https://github.com/AndrewJDR/matrix-puppet-bridge).

Get your `user_access_token` from here:

https://api.slack.com/docs/oauth-test-tokens

The bridge uses that access token to connect as a client using the slack RTM API.

This technique does not require admin on the slack team; instead, the bridge is simply a custom slack client.

The bridge supports multiple teams at once, see the config.sample.json

## installation

clone this repo

cd into the directory

run `npm install`

## configure

Copy `config.sample.json` to `config.json` and update it to match your setup. Add as many teams as you like by adding them to the array.

## register the app service

Generate an `slack-registration.yaml` file with `node index.js -r -u "http://your-bridge-server:8090"`

Note: The 'registration' setting in the config.json needs to set to the path of this file. By default, it already is.

Copy this `slack-registration.yaml` file to your home server. Make sure that from the perspective of the homeserver, the url is correctly pointing to your bridge server. e.g. `url: 'http://your-bridge-server.example.org:8090'` and is reachable.

Edit your homeserver.yaml file and update the `app_service_config_files` with the path to the `slack-registration.yaml` file.

Launch the bridge with ```node index.js```.

Restart your HS.

## Discussion, Help and Support

Join us in [the Matrix Puppet Bridge room](https://riot.im/app/#/room/#matrix-puppet-bridge:matrix.org)

## Features and Roadmap

 - [x] Multi-team
 - [x] Channel messages
 - [x] Direct messages
  - [x] Recieving
  - [ ] Initiating (https://github.com/matrix-hacks/matrix-puppet-slack/issues/50)
 - Matrix -> Slack
   - [x] Text content
   - [x] Formatted Text content
   - [x] Image content (m.image msgtype events)
   - [x] Generic file uploads (m.file msgtype events)
   - [ ] Audio (m.audio msgtype events) (https://github.com/matrix-hacks/matrix-puppet-slack/issues/66)
   - [ ] Video content (m.video msgtype events) (https://github.com/matrix-hacks/matrix-puppet-slack/issues/67)
   - [ ] Typing notifications
   - [ ] Editing messages
   - [ ] Redacting/deleting messages (https://github.com/matrix-hacks/matrix-puppet-slack/issues/52)
   - [ ] User Profiles
   - [ ] /me emotes (https://github.com/matrix-hacks/matrix-puppet-slack/issues/17)
   - [x] @-mentions
   - [x] @room, as @channel
 - Slack -> Matrix
   - [x] Text content
   - [x] Formatted Text content
   - [x] Image/Audio/Video content as protected link to slack
   - [x] Image/Audio/Video content as upload & embed to matrix
   - [x] Image/Audio/Video content message text
   - [x] Typing notifications
   - [ ] Emoji reactions (https://github.com/matrix-hacks/matrix-puppet-slack/issues/60)
   - [x] Thread replies, as ordinary messages
   - [ ] Thread replies, as Matrix replies (https://github.com/matrix-hacks/matrix-puppet-slack/issues/58)
   - [x] Editing messages
   - [ ] Redacting/deleting messages
   - [ ] User Profiles
   - [ ] /me emotes (https://github.com/matrix-hacks/matrix-puppet-slack/issues/17)
   - [ ] Presence
   - [x] @-mentions
   - [ ] @channel/@here, as @room (Slack users' Matrix ghost users must have permission to @room notify in the Slack channel's Matrix ghost room; converting is not enough)
 - [x] Third Party Lookup
  - [x] Rooms
  - [x] Users
 - [x] Puppet a user's real Slack account.
 - [ ] Rooms react to Slack updates
