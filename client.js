const RtmClient = require('@slack/client').RtmClient;
const CLIENT_EVENTS = require('@slack/client').CLIENT_EVENTS;
const { token } = require('./config.json');
const rtm = new RtmClient(token);

class Client () {
  constructor() {
  }

}

rtm.on(CLIENT_EVENTS.RTM.AUTHENTICATED, function (rtmStartData) {
  console.log(`Logged in as ${rtmStartData.self.name} of team ${rtmStartData.team.name}`);
});

// you need to wait for the client to fully connect before you can send messages
rtm.on(CLIENT_EVENTS.RTM.RTM_CONNECTION_OPENED, function () {
  // rtm.sendMessage("Hello!", channel);
});


rtm.on(CLIENT_EVENTS.RTM.RAW_MESSAGE, function (payload) {
  let data = JSON.parse(payload);
  if ( data.type === "message" ) {
    console.log(data);
  }
});

rtm.start();
