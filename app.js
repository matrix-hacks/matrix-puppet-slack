const debug = require('debug')('matrix-puppet:slack:app');
const { MatrixPuppetBridgeBase } = require("matrix-puppet-bridge");
const config = require('./config.json');
const SlackClient = require('./client');
const slackdown = require('./slackdown');
const mxtoslack = require('./mxtoslack');
const showdown  = require('showdown');
const emojione = require('emojione')
const converter = new showdown.Converter({
  literalMidWordUnderscores : true,
  simpleLineBreaks: true
});

class App extends MatrixPuppetBridgeBase {
  setSlackTeam(teamName, userAccessToken, notify) {
    this.teamName = teamName;
    this.userAccessToken = userAccessToken;
    this.slackPrefix = 'slack';
    this.servicePrefix = `${this.slackPrefix}_${this.teamName}`;
    this.notifyToSlack = notify;
    this.matrixRoomStatus = {};
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
      console.log(data);
      // edit message
      if (data.subtype === "message_changed") {
        if (data.message.text === data.previous_message.text) {
          // do nothing
          debug('ignoring duplicate edit', data);
          return;
        }
        this.createAndSendPayload({
          channel: data.channel,
          text: `Edit: ${data.message.text}`,
          user: data.message.user
        });
        return;
      }
      if (data.files) {
        const promises = [];
        if (data.text) {
          promises.push(this.createAndSendPayload({
            channel: data.channel,
            text: data.text,
            attachments: data.attachments,
            bot_id: data.bot_id,
            user: data.user,
            user_profile: data.user_profile,
          }));
        }
        data.files.forEach((file) => {
          const d = {
            channel: data.channel,
            text: data.text,
            attachments: data.attachments,
            bot_id: data.bot_id,
            user: data.user,
            user_profile: data.user_profile,
            file: file,
          };
          promises.push(this.sendFile(d).then(() => {
            if (d.file.initial_comment) {
              return this.createAndSendPayload({
                channel: d.channel,
                text: d.file.initial_comment.comment,
                attachments: d.attachments,
                bot_id: d.bot_id,
                user: d.user,
                user_profile: d.user_profile,
              });
            }
          }));
        });
        Promise.all(promises).catch(err=>{
          console.error(err);
          this.sendStatusMsg({
            fixedWidthOutput: true,
            roomAliasLocalPart: `${this.slackPrefix}_${this.getStatusRoomPostfix()}`
          }, err.stack).catch((err)=>{
            console.error(err);
          });
        });
        return;
      }
      // normal message
      this.createAndSendPayload({
        channel: data.channel,
        text: data.text,
        attachments: data.attachments,
        bot_id: data.bot_id,
        user: data.user,
        user_profile: data.user_profile,
      });
    });
    this.client.on('typing', (data)=>{
      console.log(data);
      this.createAndSendTypingEvent({
        channel: data.channel,
        user: data.user,
      });
    });
    this.client.on('rename', (data)=>{
      console.log(data);
      // rename channel
      this.renameChannelEvent({
        channel: data.channel,
      });
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
        const u = this.client.getUserById(user);
        payload.senderName = u.name;
        payload.senderId = user;
        payload.avatarUrl = u.profile.image_72;
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
    payload.path = ''; // to prevent errors
    return this.client.downloadImage(data.file.url_private).then(({ buffer, type }) => {
      payload.buffer = buffer;
      payload.mimetype = type;
      return this.handleThirdPartyRoomMessageWithAttachment(payload);
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
    if (attachments) {
      /* FIXME: Right now, doing this properly would cause too much churn.
       * The attachments are also in Slack's markdown-like
       * formatting, not real markdown, but they require features
       * (e.g. links with custom text) that Slack formatting doesn't support.
       * Because we need to process the "slackdown", but also implement those
       * features, we mix in some real markdown that makes it past our
       * slackdown-to-markdown converter. We also need <font> tags for our
       * colorization, but the converter can't handle the raw HTML (which
       * slackdown doesn't allow), and we don't want to turn HTML in Slack
       * messages into real HTML (it should show as plaintext just like it
       * does in Slack, lest we try to turn "</sarcasm>" into real end tags),
       * so we hack around it by implementing our own silly font color hack.
       * A good fix would be to parse individual messages' slackdown
       * to markdown, and add the additional markdown
       * (including raw HTML tags) afterward, instead of forming a big array
       * of slackdown messages, then converting them all into markdown at once.
       */
      attachments.forEach(att=> {
        let attMessages = [];
        if (att.pretext) {
          messages.push(att.pretext);
        }
        if (att.author_name) {
          if (att.author_link) {
            attMessages.push(`[${att.author_name}](${att.author_link})`);
          } else {
            attMessages.push(`${att.author_name}`);
          }
        }
        if (att.title) {
          if (att.title_link) {
            attMessages.push(`*[${att.title}](${att.title_link})*`);
          } else {
            attMessages.push(`*${att.title}*`);
          }
        }
        if (att.text) {
          attMessages.push(`${att.text}`);
        }
        if (att.fields) {
          att.fields.forEach(field => {
            if (field.title) {
              attMessages.push(`*${field.title}*`);
            }
            if (field.value) {
              attMessages.push(`${field.value}`);
            }
          })
        }
        if ((att.actions instanceof Array) && att.actions.length > 0) {
          attMessages.push(`Actions (Unsupported): ${att.actions.map(o => `[${o.text}]`).join(" ")}`);
        }
        if (att.footer) {
          attMessages.push(`_${att.footer}_`);
        }
        let attachmentBullet = att.color ? `;BEGIN_FONT_COLOR_HACK_${att.color};●;END_FONT_COLOR_HACK;` : "●";
        attMessages.forEach(attMessage => {
          messages.push(`${attachmentBullet} ${attMessage}`);
        });
      });
    }

    let rawMessage =
      messages
        .filter(m => m && (typeof m === "string"))
        .map(m => m.trim())
        .join('\n')
        .trim();
    let payload = this.getPayload(data);

    try {
      const replacements = [
        [':+1:', ':thumbsup:'],
        [':-1:', ':thumbsdown:'],
        [':facepunch:', ':punch:'],
        [':hankey:', ':poop:'],
        [':slightly_smiling_face:', ':slight_smile:'],
        [':upside_down_face:', ':upside_down:'],
        [':skin-tone-2:', '🏻'],
        [':skin-tone-3:', '🏼'],
        [':skin-tone-4:', '🏽'],
        [':skin-tone-5:', '🏾'],
        [':skin-tone-6:', '🏿'],
        ['<!channel>', '@room'],
        ['<!here>', '@room'],
          // NOTE: <!channel> and `<!here> converted to @room here,
          // and not in slacktomd, because we're translating Slack parlance
          // to Matrix parlance, not parsing "Slackdown" to turn into Markdown.
      ];
      for (let i = 0; i < replacements.length; i++) {
        rawMessage = rawMessage.replace(replacements[i][0], replacements[i][1]);
      }
      rawMessage = emojione.shortnameToUnicode(rawMessage);
      console.log("rawMessage");
      console.log(rawMessage);
      payload.text = slackdown(this, rawMessage);
      let markdown = payload.text;
      markdown = markdown.replace(/;BEGIN_FONT_COLOR_HACK_(.*?);/g, '<font color="$1">');
      markdown = markdown.replace(/;END_FONT_COLOR_HACK;/g, '</font>');
      payload.text = payload.text.replace(/;BEGIN_FONT_COLOR_HACK_(.*?);/g, '');
      payload.text = payload.text.replace(/;END_FONT_COLOR_HACK;/g, '');

      // Replace a slack user mention.
      // In the body it should be replaced with the nick and in the html a href.

      let result = [];
      while ((result = /USER_MENTION_HACK(.*?)END_USER_MENTION_HACK/g.exec(payload.text)) !== null) {
        console.log(result);
        const u = result[1];
        const isme = u === this.client.getSelfUserId();
        const user = this.client.getUserById(u);
        if (user) {
            const id = isme ? config.puppet.id : this.getGhostUserFromThirdPartySenderId(u);
            // todo: update user profile
            const name = isme ? config.puppet.localpart : user.name;
            const mentionmd = `[${name}](https://matrix.to/#/${id})`;
            payload.text = payload.text.replace(result[0], name);
            markdown = markdown.replace(result[0], mentionmd);
        } else {
            payload.text = payload.text.replace(result[0], u);
            markdown = markdown.replace(result[0], u);

        }
      }
      console.log("payload.text");
      console.log(payload.text);
      payload.html = converter.makeHtml(markdown);
      console.log("payload.html");
      console.log(payload.html);
    } catch (e) {
      console.log(e);
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
  createAndSendTypingEvent(data) {
    const payload = this.getPayload(data);
    return this.getIntentFromThirdPartySenderId(payload.senderId).then(ghostIntent => {
      return this.getOrCreateMatrixRoomFromThirdPartyRoomId(payload.roomId).then(matrixRoomId => {
        // HACK: copy from matrix-appservice-bridge/lib/components/indent.js
        // client can get timeout value, but intent does not support this yet.
        //return ghostIntent.sendTyping(matrixRoomId, true);
        return ghostIntent._ensureJoined(matrixRoomId).then(function() {
          return ghostIntent._ensureHasPowerLevelFor(matrixRoomId, "m.typing");
        }).then(function() {
          return ghostIntent.client.sendTyping(matrixRoomId, true, 3000);
        });
      });
    }).catch(err=>{
      console.error(err);
      this.sendStatusMsg({
        fixedWidthOutput: true,
        roomAliasLocalPart: `${this.slackPrefix}_${this.getStatusRoomPostfix()}`
      }, err.stack).catch((err)=>{
        console.error(err);
      });
    });
  }

  async _renameChannelEvent(matrixRoomId, name) {
    const botIntent = this.getIntentFromApplicationServerBot();
    const ret = await botIntent.setRoomName(matrixRoomId, name);
    this.updateRoomStatesCache(matrixRoomId, 'name', name);
    return ret;
  }

  async renameChannelEvent(data) {
    const payload = this.getPayload(data);
    const roomAlias = this.getRoomAliasFromThirdPartyRoomId(payload.roomId);
    try {
      const room = await this.puppet.getClient().getRoomIdForAlias(roomAlias);
      return this._renameChannelEvent(room.room_id, data.name);
    } catch (err) {
      console.error(err);
      this.sendStatusMsg({
        fixedWidthOutput: true,
        roomAliasLocalPart: `${this.slackPrefix}_${this.getStatusRoomPostfix()}`
      }, err.stack).catch((err)=>{
        console.error(err);
      });
    }
  }
  getThirdPartyRoomDataById(id) {
    const directName = (user) => this.client.getUserById(user).name;
    const directTopic = () => `Slack Direct Message (Team: ${this.teamName})`
    const room = this.client.getRoomById(id);
    var purpose = "";
    if ((room.purpose) && room.purpose.value) {
      purpose = room.purpose.value;
    }
    return {
      name: room.isDirect ? directName(room.user) : room.name,
      topic: room.isDirect ? directTopic() : purpose
    }
  }
  sendReadReceiptAsPuppetToThirdPartyRoomWithId() {
    // not available for now
  }
  sendMessageAsPuppetToThirdPartyRoomWithId(id, text, data) {
    debug('sending message as puppet to third party room with id', id);
    // text lost html informations, just use raw message instead that.
    let message;
    if (data.content.format === 'org.matrix.custom.html') {
      const rawMessage = data.content.formatted_body;

      console.log("rawMessage");
      console.log(rawMessage);

      message = mxtoslack(this, rawMessage);
    } else {
      message = data.content.body;
    }

    const replacements = [
      ['@room', this.notifyToSlack !== 'only_active' ? '<!channel>' : '<!here>'],
    ]
    for (let i = 0; i < replacements.length; i++) {
      message = message.replace(replacements[i][0], replacements[i][1]);
    }
    // deduplicate
    message = this.tagMatrixMessage(message);

    return this.client.sendMessage(message, id);
  }
  sendImageMessageAsPuppetToThirdPartyRoomWithId(id, data, raw) {
    return this.client.sendImageMessage(data.url, data.text, id);
  }
  sendFileMessageAsPuppetToThirdPartyRoomWithId(id, data) {
    // deduplicate
    const filename = this.tagMatrixMessage(data.filename);
    return this.client.sendFileMessage(data.url, data.text, filename, id);
  }

  async getRoomState(matrixRoomId, type) {
    // prevent refetch from matrix server after first fetching
    const cache = this.matrixRoomStatus[matrixRoomId] || {};
    if (cache[type]) {
      return cache[type];
    }
    const puppetClient = this.puppet.getClient();
    switch(type) {
      case 'name':
        const roomName = await puppetClient.getStateEvent(matrixRoomId, 'm.room.name');
        if (roomName && roomName.name) {
          this.updateRoomStatesCache(matrixRoomId, 'name', roomName.name);
        }
        return roomName.name;
      // TODO
    }
  }

  updateRoomStatesCache(matrixRoomId, type, data) {
    const roomStatus = this.matrixRoomStatus[matrixRoomId] = this.matrixRoomStatus[matrixRoomId] || {};
    roomStatus[type] = data;
  }

  // HACK: recheck the old name when after getOrCreateMatrixRoomFromThirdPartyRoomId
  // if room has old name, forcefully update new name after bind
  async getOrCreateMatrixRoomFromThirdPartyRoomId(thirdPartyRoomId) {
    const matrixRoomId = await super.getOrCreateMatrixRoomFromThirdPartyRoomId(thirdPartyRoomId);
    const name = await this.getRoomState(matrixRoomId, 'name');
    const chan = this.client.getChannelById(thirdPartyRoomId) || {};
    if (!chan.name) {
      return matrixRoomId;
    }
    if (name !== chan.name) {
      await this._renameChannelEvent(matrixRoomId, chan.name);
    }
    return matrixRoomId;
  }
}

module.exports = App;
