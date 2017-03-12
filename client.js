const debug = require('debug')('matrix-puppet:slack:client');
const Promise = require('bluebird');
const EventEmitter = require('events').EventEmitter;
const { WebClient, RtmClient, CLIENT_EVENTS } = require('@slack/client');

class Client extends EventEmitter {
  constructor(token) {
    super();
    this.token = token;
    this.rtm = null;
    this.web = null;
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

      // reject on any unrecoverable error
      this.rtm.on(CLIENT_EVENTS.RTM.UNABLE_TO_RTM_START, (err) => {
        this.emit('unable-to-start', err);
        reject(err);
      });

      // disconnect is called only when there is on chance of reconnection,
      // either due to unrecoverable errors or the disabling of reconnect
      // so it's the best way to know to act towards reconnecting
      // the issue here is that at this point we dont know if
      // its an "unrecoverable error" or not, so if we were to implement
      // reconnect ourself in respones to this event, we may start looping
      this.rtm.on(CLIENT_EVENTS.RTM.DISCONNECT, () => {
        this.emit('disconnected'); // can use this to announce status and issue a reconnect
      });

      this.rtm.on(CLIENT_EVENTS.RTM.AUTHENTICATED, (rtmStartData) => {
        this.web = new WebClient(this.token);
        debug(`Logged in as ${rtmStartData.self.name} of team ${rtmStartData.team.name}`);
        if (process.env.DEBUG) {
          const f = `data-${rtmStartData.team.name}.json`;
          debug(`DEBUG environment variable is on. writing data dump file for your perusal: ${f}`);
          require('fs').writeFileSync(f, JSON.stringify(rtmStartData, null, 2));
        }
        this.data = rtmStartData;
      });

      // you need to wait for the client to fully connect before you can send messages
      this.rtm.on(CLIENT_EVENTS.RTM.RTM_CONNECTION_OPENED, () => {
        this.emit('connected'); // can use this to announce status
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
  /**
   * Finds a bot by ID
   *
   * @returns {object} a bot:
   * {
   *   "id": "B03RKF7LP",
   *   "deleted": false,
   *   "name": "gdrive",
   *   "app_id": "A0F7YS32P",
   *   "icons": {
   *     "image_36": "https://a.slack-edge.com/12b5a/plugins/gdrive/assets/service_36.png",
   *     "image_48": "https://a.slack-edge.com/12b5a/plugins/gdrive/assets/service_48.png",
   *     "image_72": "https://a.slack-edge.com/12b5a/plugins/gdrive/assets/service_72.png"
   *   }
   * }
   **/
  getBotById(id) {
    return this.data.bots.find(u => u.id === id) || { name: "unknown" };
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
  /**
   * Posts an image to the slack channel.
   * You cannot do this with the RTM api, so we
   * use the slack web api for this.
   *
   * Attachments are pretty cool, check it here:
   * https://api.slack.com/docs/messages/builder
   */
  sendPictureMessage(imageUrl, channel) {
    return new Promise((resolve, reject) => {
      this.web.chat.postMessage(channel, null, {
        as_user: true,
        attachments:[
          {
            fallback: imageUrl,
            image_url: imageUrl
          }
        ]
      }, (err, res) => {
        err ? reject(err) : resolve(res);
      });
    });
  }
}

module.exports = Client;
