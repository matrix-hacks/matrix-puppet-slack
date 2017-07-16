const debug = require('debug')('matrix-puppet:slack:app');
const { MatrixPuppetBridgeBase } = require("matrix-puppet-bridge");
const SlackClient = require('./client');
const slackdown = require('./slackdown');
const showdown  = require('showdown');
const converter = new showdown.Converter({
  literalMidWordUnderscores : true
});

class App extends MatrixPuppetBridgeBase {
  setSlackTeam(teamName, userAccessToken) {
    this.teamName = teamName;
    this.userAccessToken = userAccessToken;
    this.slackPrefix = 'slack';
    this.servicePrefix = `${this.slackPrefix}_${this.teamName}`;
  }
  getServiceName() {
    return "Slack";
  }
  getServicePrefix() {
    return this.servicePrefix;
  }
  sendStatus(_msg) {
    let msg = `${this.teamName}: ${_msg}`
    this.sendStatusMsg({
      fixedWidthOutput: false,
      roomAliasLocalPart: `${this.slackPrefix}_${this.getStatusRoomPostfix()}`
    }, msg).catch((err)=>{
      console.log(err);
    });
  }
  initThirdPartyClient() {
    this.client = new SlackClient(this.userAccessToken);
    this.client.on('unable-to-start', (err)=>{
      this.sendStatus(`unable to start: ${err.message}`);
    });
    this.client.on('disconnected', ()=>{
      this.sendStatus('disconnected. will try to reconnect in a minute...');
      setTimeout(()=> {
        this.initThirdPartyClient().catch((err)=>{
          debug('reconnect failed with error', err.message);
          this.sendStatus('reconnnect failed with error', err.message);
        })
      }, 60 * 1000);
    });
    this.client.on('connected', (err)=>{
      this.sendStatus(`connected`);
    });
    return this.client.connect().then(()=>{
      debug('waiting a little bit for initial self-messages to fire before listening for messages');
      setTimeout(()=>this.registerMessageListener(), 5000);
    })
  }
  registerMessageListener() {
    this.client.on('message', (data)=>{
      if (data.subtype === "message_changed") {
        this.createAndSendPayload({
          channel: data.channel,
          text: `Edit: ${data.message.text}`,
          user: data.message.user
        });
      } else {
        if (data.file) {
          this.sendFile(data).then(() => {
            if (data.file.initial_comment) {
              this.createAndSendPayload({
                channel: data.channel,
                text: data.file.initial_comment.comment,
                attachments: data.attachments,
                bot_id: data.bot_id,
                user: data.user,
                user_profile: data.user_profile,
              });
            }
          });
        } else {
          this.createAndSendPayload({
            channel: data.channel,
            text: data.text,
            attachments: data.attachments,
            bot_id: data.bot_id,
            user: data.user,
            user_profile: data.user_profile,
          });
        }
      }
    });
    debug('registered message listener');
  }
  getPayload(data) {
    const {
      channel,
      text,
      attachments,
      bot_id,
      user,
      user_profile,
      file,
    } = data;
    let payload = { roomId: channel };
    
    if (user) {
      if ( user === "USLACKBOT" ) {
        payload.senderName = user_profile.name;
        payload.senderId = user;
        payload.avatarUrl = user_profile.image_72;
      } else {
        const isMe = user === this.client.getSelfUserId();
        let uu = this.client.getUserById(user);
        payload.senderId = isMe ? undefined : user;
        if (uu) {
          payload.senderName = uu.name;
          payload.avatarUrl = uu.profile.image_512;
        } else {
          payload.senderName = "unknown";
        }
      }
    } else if (bot_id) {
      const bot = this.client.getBotById(bot_id);
      payload.senderName = bot.name;
      payload.senderId = bot_id;
      payload.avatarUrl = bot.icons.image_72
    }
    return payload;
  }
  sendFile(data) {
    let payload = this.getPayload(data);
    payload.text = data.file.name;
    payload.url = ''; // to prevent errors
    return this.client.downloadImage(data.file.url_private).then(({ buffer, type }) => {
      console.log(buffer);
      console.log(buffer.toString('utf-8'));
      payload.buffer = buffer;
      payload.mimetype = type;
      return this.handleThirdPartyRoomImageMessage(payload);
    }).catch((err) => {
      console.log(err);
      payload.text = '[Image] ('+data.name+') '+data.url;
      return this.handleThirdPartyRoomMessage(payload);
    });
  }
  createAndSendPayload(data) {
    const {
      channel,
      text,
      attachments,
      bot_id,
      user,
      user_profile,
      file,
    } = data;
    // any direct text
    let messages = [text];
    // any attachments, stuff it into the text as new lines
    if (attachments) attachments.forEach(att=> messages.push(att.text))

    const rawMessage = messages.join('\n').trim();
    let payload = this.getPayload(data);

    try {
      payload.text = slackdown(rawMessage, this.client.getUsers(), this.client.getChannels());
      payload.html = converter.makeHtml(payload.text);
    } catch (e) {
      debug("could not normalize message", e);
      payload.text = rawMessage;
    }

    

    return this.handleThirdPartyRoomMessage(payload).catch(err=>{
      console.error(err);
      this.sendStatusMsg({
        fixedWidthOutput: true,
        roomAliasLocalPart: `${this.slackPrefix}_${this.getStatusRoomPostfix()}`
      }, err.stack).catch((err)=>{
        console.error(err);
      });
    });
  }
  getThirdPartyRoomDataById(id) {
    const directName = (user) => this.client.getUserById(user).name;
    const directTopic = () => `Slack Direct Message (Team: ${this.teamName})`
    const room = this.client.getRoomById(id);
    return {
      name: room.isDirect ? directName(room.user) : room.name,
      topic: room.isDirect ? directTopic() : room.purpose.value
    }
  }
  sendReadReceiptAsPuppetToThirdPartyRoomWithId() {
    // not available for now
  }
  sendMessageAsPuppetToThirdPartyRoomWithId(id, text) {
    debug('sending message as puppet to third party room with id', id);
    return this.client.sendMessage(text, id);
  }
  sendImageMessageAsPuppetToThirdPartyRoomWithId(id, data) {
    console.log(data);
    return this.client.sendImageMessage(data.url, data.text, id);
  }
}

module.exports = App;
