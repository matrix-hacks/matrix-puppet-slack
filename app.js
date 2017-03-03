const debug = require('debug')('matrix-puppet:slack:app');
const { MatrixPuppetBridgeBase } = require("matrix-puppet-bridge");
const SlackClient = require('./client');


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
      const { channel, user, text, attachments } = data;

      // any direct text
      let messages = [text];

      // any attachments, stuff it into the text as new lines
      if (attachments) {
        attachments.forEach(att=>{
          debug('adding attachment', att);
          messages.push(att.text);
        });
      }

      const isMe = user === this.client.getSelfUserId();

      const rawMessage = messages.join('\n').trim();
      let normalizedMessage = "";
      let html = null;
      try {
        normalizedMessage = slackdown(rawMessage, this.client.getUsers(), this.client.getChannels());
        html = converter.makeHtml(normalizedMessage);
      } catch (e) {
        debug("could not normalize message", e);
        normalizedMessage = rawMessage;
      }

      const payload = {
        roomId: channel,
        senderName: this.client.getUserById(user).name,
        senderId: isMe ? undefined : user,
        text: normalizedMessage,
        html: html
      };
      return this.handleThirdPartyRoomMessage(payload).catch(err=>{
        console.error(err);
      });
    });
    debug('registered message listener');
  }
  getThirdPartyRoomDataById(id) {
    const directTopic = () => `Slack Direct Message (Team: ${this.teamName})`
    const room = this.client.getRoomById(id);
    return {
      name: room.name,
      topic: room.isDirect ? directTopic() : room.purpose.value
    }
  }
  sendMessageAsPuppetToThirdPartyRoomWithId(id, text) {
    debug('sending message as puppet to third party room with id', id);
    return this.client.sendMessage(text, id);
  }
}

module.exports = App;
