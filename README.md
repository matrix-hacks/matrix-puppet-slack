# matrix-appservice-slack

This is an unofficial matrix slack bridge that works by means of [user puppetting](https://github.com/AndrewJDR/matrix-puppet-bridge).

Get your `user_access_token` from here:

https://api.slack.com/docs/oauth-test-tokens

The bridge uses that access token to connect as a client using the slack RTM API.

This technique does not require admin on the slack team; instead, the bridge is simply a custom slack client.

## installation

clone this repo

cd into the directory

run `npm install`

## configure

Copy `config.sample.json` to `config.json` and update it to match your setup

## register the app service

Generate an `slack-<team>-registration.yaml` file with `node index.js -r -u "http://your-bridge-server:8090"`

Note: The 'registration' setting in the config.json needs to set to the path of this file. By default, it already is.

Copy this `slack-<team>-registration.yaml` file to your home server. Make sure that from the perspective of the homeserver, the url is correctly pointing to your bridge server. e.g. `url: 'http://your-bridge-server.example.org:8090'` and is reachable.

Edit your homeserver.yaml file and update the `app_service_config_files` with the path to the `slack-<team>-registration.yaml` file.

Launch the bridge with ```node index.js```.

Restart your HS.

## Alternatives

Here's the official slack bridge, which works completely differently, requiring admin privileges in order to setup various webhooks:

* https://github.com/matrix-org/matrix-appservice-slack

