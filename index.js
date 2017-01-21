const {
  MatrixAppServiceBridge: {
    Cli, AppServiceRegistration
  },
  Puppet,
  MatrixPuppetBridgeBase
} = require("matrix-puppet-bridge");
const SlackClient = require('./client');
const path = require('path');
const config = require('./config.json');
const puppet = new Puppet('./config.json');
const debug = require('debug')('matrix-puppet:slack');

class App extends MatrixPuppetBridgeBase {
  getServicePrefix() {
    return `slack_${config.slack.team_name}`;
  }
  initThirdPartyClient() {
    this.client = new SlackClient(this.config.slack.user_access_token);
    this.client.on('message', (data)=>{
      const { channel, user, text } = data;
      const isMe = user === this.client.getSelfUserId();
      const payload = {
        roomId: channel,
        senderName: this.client.getUserById(user).name,
        senderId: isMe ? undefined : user,
        text
      };
      return this.handleThirdPartyRoomMessage(payload).catch(err=>{
        console.error(err.stack);
      });
    });
    this.client.connect();
  }
  getThirdPartyRoomDataById(id) {
    const channel = this.client.getChannelById(id);
    return {
      name: channel.name,
      topic: channel.purpose.value // there is also channel.topic but it seems less used
    }
  }
  sendMessageAsPuppetToThirdPartyRoomWithId(id, text) {
    return this.client.sendMessage(text, id);
  }
}

new Cli({
  port: config.port,
  registrationPath: config.registrationPath,
  generateRegistration: function(reg, callback) {
    const prefix = `slack_${config.slack.team_name}`;
    puppet.associate().then(()=>{
      reg.setId(AppServiceRegistration.generateToken());
      reg.setHomeserverToken(AppServiceRegistration.generateToken());
      reg.setAppServiceToken(AppServiceRegistration.generateToken());
      reg.setSenderLocalpart(`${prefix}_bot`);
      reg.addRegexPattern("users", `@${prefix}.*`, true);
      callback(reg);
    }).catch(err=>{
      console.error(err.message);
      process.exit(-1);
    });
  },
  run: function(port) {
      const app = new App(config, puppet);
      return puppet.startClient().then(()=>{
        return app.initThirdPartyClient();
      }).then(() => {
        return app.bridge.run(port, config);
      }).then(()=>{
        console.log('Matrix-side listening on port %s', port);
      }).catch(err=>{
        console.error(err.message);
        process.exit(-1);
      });
  }
}).run();
