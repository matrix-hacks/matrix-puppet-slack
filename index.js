const { fork } = require('child_process');
const config = require('./config.json');

const {
  MatrixAppServiceBridge: {
    Cli, AppServiceRegistration
  },
  Puppet,
  MatrixPuppetBridgeBase
} = require("matrix-puppet-bridge");
const FacebookClient = require('./client');
const config = require('./config.json');
const path = require('path');
const puppet = new Puppet(path.join(__dirname, './config.json' ));
const debug = require('debug')('matrix-puppet:facebook');

class App extends MatrixPuppetBridgeBase {
  getServicePrefix() {
    return "slack";
  }
  initThirdPartyClient() {
    this.thirdPartyClient = new FacebookClient(this.config.facebook);
    this.thirdPartyClient.on('message', (data)=>{
      const { senderID, body, threadID, isGroup } = data;
      const isMe = senderID === this.thirdPartyClient.userId;
      console.log("ISME?", isMe);
      this.threadInfo[threadID] = { isGroup };
      const payload = {
        roomId: threadID,
        // senderName: senderID,
        senderId: isMe ? undefined : senderID,
        text: body
      };
      debug(payload);
      return this.handleThirdPartyRoomMessage(payload);
    });
    return this.thirdPartyClient.login();
  }
  getThirdPartyRoomDataById(threadId) {
    debug('getting third party room data by thread id', threadId);
  }
  sendMessageAsPuppetToThirdPartyRoomWithId(id, text) {
    return this.rtm.sendMessage("text", channel);
  }
}

new Cli({
  port: config.port,
  registrationPath: config.registrationPath,
  generateRegistration: function(reg, callback) {
    puppet.associate().then(()=>{
      reg.setId(AppServiceRegistration.generateToken());
      reg.setHomeserverToken(AppServiceRegistration.generateToken());
      reg.setAppServiceToken(AppServiceRegistration.generateToken());
      reg.setSenderLocalpart("facebookbot");
      reg.addRegexPattern("users", "@facebook_.*", true);
      callback(reg);
    }).catch(err=>{
      console.error(err.message);
      process.exit(-1);
    });
  },
  run: function(port) {
    if (config.slack.user_access_token) {
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
    } else if (config.slack.app_client_id && config.slack.app_secret) {
      console.log('no user token set, starting oauth server to get you one');
      fork('oauth-server');
    } else {
      console.error('no user token or oauth app details found!');
      process.exit(1);
    }
  }
}).run();
