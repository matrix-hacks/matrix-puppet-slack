const debug = require('debug')('matrix-puppet:slack:client');
const RtmClient = require('@slack/client').RtmClient;
const CLIENT_EVENTS = require('@slack/client').CLIENT_EVENTS;
const EventEmitter = require('events').EventEmitter;

class Client extends EventEmitter {
  constructor(token) {
    super();
    this.token = token;
    this.rtm = null;
    this.data = null;
  }
  connect() {
    this.rtm = new RtmClient(this.token);
    this.rtm.on(CLIENT_EVENTS.RTM.AUTHENTICATED, (rtmStartData) => {
      console.log(`Logged in as ${rtmStartData.self.name} of team ${rtmStartData.team.name}`);
      this.data = rtmStartData;
    });

    // you need to wait for the client to fully connect before you can send messages
    this.rtm.on(CLIENT_EVENTS.RTM.RTM_CONNECTION_OPENED, () => {
      // rtm.sendMessage("Hello!", channel);
      debug('fully connected');
    });

    this.rtm.on(CLIENT_EVENTS.RTM.RAW_MESSAGE, (payload) => {
      let data = JSON.parse(payload);
      if ( data.type === "message" ) {
        this._emitMessage(data);
      } else if (data.type === 'pong') {
        // very chatty... ignore
      } else {
        debug('raw message, type:', data.type);
      }
    });

    this.rtm.start();
  }
  _emitMessage(data) {
    debug('emitting message:', data);
    this.emit('message', data);
  }
  getSelfUserId() {
    return this.data.self.id;
  }
  getUserById(id) {
    return this.data.users.find(u => u.id === id);
  }
  getChannelById(id) {
    return this.data.channels.find(c => c.id === id);
  }
  sendMessage(text, channel) {
    return this.rtm.sendMessage(text, channel);
  }
}

module.exports = Client;
