# matrix-appservice-slack

This is an unofficial matrix slack bridge that works by means of [user puppetting](https://github.com/AndrewJDR/matrix-puppet-bridge).

It can start a built-in server to do oauth for you (by requesting the `client` scope) and then stores that access token.

Once the token is acquired, you do not need to expose the bridge to the open internet anymore. This is only necessary for the oauth dance.

The client then uses that access token to connect as a client using the slack RTM API.

This technique does not require admin on the slack team; instead, the bridge is simply a custom slack client.

**DO NOT USE THIS YET, WORK IN PROGRESS**

## Alternatives

Here's the official slack bridge, which works completely differently, requiring admin privileges in order to setup various webhooks:

* https://github.com/matrix-org/matrix-appservice-slack
