const debug = require('debug')('matrix-puppet:slack:client');
const EventEmitter = require('events').EventEmitter;
const promisify = require('util').promisify;
const { WebClient, RTMClient, CLIENT_EVENTS } = require('@slack/client');
const { download, sleep } = require('./utils');

class Client extends EventEmitter {
  constructor(token) {
    super();
    this.token = token;
    this.rtm = null;
    this.web = null;
    this.data = {
      channels: [],
      users: [],
      bots: [],
    }
  }
  connect() {
    return new Promise((resolve, reject) => {
      this.rtm = new RTMClient(this.token);

      // reject on any unrecoverable error
      this.rtm.once('unable_to_rtm_start', (err) => {
        this.emit('unable-to-start', err);
        reject(err);
      });

      // disconnect is called only when there is on chance of reconnection,
      // either due to unrecoverable errors or the disabling of reconnect
      // so it's the best way to know to act towards reconnecting
      // the issue here is that at this point we dont know if
      // its an "unrecoverable error" or not, so if we were to implement
      // reconnect ourself in respones to this event, we may start looping
      this.rtm.on('disconnected', () => {
        this.emit('disconnected'); // can use this to announce status and issue a reconnect
      });

      this.rtm.on('authenticated', (rtmStartData) => {
        this.web = new WebClient(this.token);
        debug(`Logged in as ${rtmStartData.self.name} of team ${rtmStartData.team.name}`);
        if (process.env.DEBUG) {
          const f = `data-${rtmStartData.team.name}.json`;
          debug(`DEBUG environment variable is on. writing data dump file for your perusal: ${f}`);
          require('fs').writeFileSync(f, JSON.stringify(rtmStartData, null, 2));
        }
        this.data.self = rtmStartData.self;
        //this.data = rtmStartData;
        //this.data.channels = this.data.channels
        //  .concat(this.data.groups) // we want the hidden channels, "groups", too!
        //  .concat(this.data.ims); // also we want the im channels, "ims"
      });

      // you need to wait for the client to fully connect before you can send messages
      this.rtm.on('ready', () => {
        this.emit('connected'); // can use this to announce status
        resolve();
      });

      this.rtm.on('message', (data) => {
        //debug('emitting message:', data);
        this.emit('message', data);
      });

      for (const ev of ['channel_joined', 'group_joined', 'mpim_joined', 'im_created']) {
        this.rtm.on(ev, (data) => {
          const chan = this.getChannelById(data.channel.id);
          if (!chan) {
            this.data.channels.push(data.channel);
          }
        });
      }

      for (const ev of ['channel_rename', 'group_rename']) {
        this.rtm.on(ev, (data) => { this.updateChannel(data.channel); });
      }

      this.rtm.on('team_join', (data) => {
        this.data.users.push(data.user);
      });

      this.rtm.on('user_change', (data) => { this.updateUser(data.user); });

      this.rtm.on('user_typing', (data) => {
        debug('emitting typing message:', data);
        this.emit('typing', data);
      });

      for (const ev of ['bot_added', 'bot_changed']) {
        this.rtm.on('ev', (data) => {
          let found = false;
          for (let i = 0; i < this.data.bots.length; i++) {
            if (this.data.bots[i].id == data.bot.id) {
              this.data.bots[i] = data.bot;
              found = true;
              break;
            }
          }
          if (!found) {
            this.data.bots.push(data.bot);
          }
        });
      }
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
    return this.data.bots.find(u => (u.id === id || u.name === id)) || { name: "unknown" };
  }
  async getUserById(id) {
    let user = this.data.users.find(u => (u.id === id || u.name === id));
    if (user) {
      return user;
    }
    try {
      // TODO: prevent multiple request
      const ret = await this.web.users.info({ user: id });
      this.updateUser(user);
      return ret.user;
    } catch (err) {
      console.log(err);
    }
    return null;
  }
  async getChannelById(id) {
    const chan = await this.getRoomById(id);
    if (!chan || chan.isDirect) {
      return null;
    }
    return chan;
  }
  // get "room" by id will check for channel or IM and hide the details of that difference
  // but pass that detail along in case the callee cares.
  async getRoomById(id) {
    let chan = this.data.channels.find(c => (c.id === id || c.name === id));
    if (!chan) {
      if (!chan) {
        try {
          // TODO: prevent multiple request
          const ret = await this.web.conversations.info({ channel: id });
          if (!ret.channel) {
            return null;
          }
          this.updateChannel(ret.channel);
          chan = ret.channel;
        } catch (err) {
          console.log(err);
          return null;
        }
      }
    }
    if (chan.isDirect === undefined) {
      chan.isDirect = !!chan.is_im;
    }
    return chan;
  }
  updateUser(user) {
    let found = false;
    for (let i = 0; i < this.data.users.length; i++) {
      if (this.data.users[i].id == user.id) {
        this.data.users[i] = user;
        found = true;
        break;
      }
    }
    if (!found) {
      this.data.users.push(user);
    }
  }
  updateChannel(channel) {
    let chan;
    for (let i = 0; i < this.data.channels.length; i++) {
      if (this.data.channels[i].id == channel.id) {
        chan = this.data.channels[i];
        break;
      }
    }
    if (!chan) {
      this.data.channels.push(channel);
      chan = channel;
    }
    if (chan.name !== channel.name) {
      chan.name = channel.name;
      this.emit('rename', {
        channel: chan.id,
        name: chan.name,
      });
    }
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
  async sendImageMessage(imageUrl, title, channel) {
    return await this.sendFileMessage(imageUrl, title, title, channel);
  }
  async sendFileMessage(fileUrl, title, filename, channel) {
    const { buffer } = await download.getBufferAndType(fileUrl);
    const opts = {
      filename: filename,
      file: buffer,
      title: title,
      filetype: 'auto',
      channels: channel,
    };

    return await this.web.files.upload(opts);
  }
  async downloadImage(url) {
    return await download.getBufferAndType(url, {
      headers: { Authorization: 'Bearer ' +  this.token}
    });
  }
}

module.exports = Client;
