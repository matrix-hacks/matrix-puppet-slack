const debug = require('debug')('matrix-puppet:slack:client');
const RtmClient = require('@slack/client').RtmClient;
const CLIENT_EVENTS = require('@slack/client').CLIENT_EVENTS;
const EventEmitter = require('events').EventEmitter;
const Promise = require('bluebird');

class Client extends EventEmitter {
  constructor(token) {
    super();
    this.token = token;
    this.rtm = null;
    this.data = {
      self: {},
      channels: [],
      users: [],
      ims: []
    }
  }
  connect() {
    return new Promise((resolve, reject) => {
      this.rtm = new RtmClient(this.token);
      this.rtm.on(CLIENT_EVENTS.RTM.AUTHENTICATED, (rtmStartData) => {
        console.log(`Logged in as ${rtmStartData.self.name} of team ${rtmStartData.team.name}`);
        //require('fs').writeFileSync(`data-${rtmStartData.team.name}.json`, JSON.stringify(rtmStartData, null, 2));
        this.data = rtmStartData;
      });

      // you need to wait for the client to fully connect before you can send messages
      this.rtm.on(CLIENT_EVENTS.RTM.RTM_CONNECTION_OPENED, () => {
        // rtm.sendMessage("Hello!", channel);
        debug('fully connected');
        resolve();
      });

      this.rtm.on(CLIENT_EVENTS.RTM.RAW_MESSAGE, (payload) => {
        let data = JSON.parse(payload);
        if ( data.type === "message" ) {
          debug('emitting message:', data);
          this.emit('message', data);
        } else if (data.type === 'channel_joined') {
          this.data.channels.push(data.channel);
        } else if (data.type === 'reconnect_url') {
          // ignore
        } else if (data.type === 'pong') {
          // ignore
        } else {
          debug('raw message, type:', data.type);
        }
      });

      this.rtm.start();
    });
  }
  getSelfUserId() {
    return this.data.self.id;
  }
  getUserById(id) {
    return this.data.users.find(u => u.id === id) || { name: "unknown" };
  }
  getChannelById(id) {
    return this.data.channels.find(c => c.id === id);
  }
  getImById(id) {
    return this.data.ims.find(c => c.id === id);
  }
  // get "room" by id will check for channel or IM and hide the details of that difference
  // but pass that detail along in case the callee cares.
  getRoomById(id) {
    let channel = this.getChannelById(id);
    if ( channel ) {
      channel.isDirect = false;
      return channel;
    }
    let im = this.getImById(id);
    if ( im ) {
      im.isDirect = true;
      return im;
    }
    return null;
  }
  sendMessage(text, channel) {
    return this.rtm.sendMessage(text, channel);
  }
  getUsers() {
    return this.data.users;
  }
  getChannels() {
    return this.data.channels;
  }
}

module.exports = Client;
