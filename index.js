const {
  MatrixAppServiceBridge: {
    Bridge, Cli, AppServiceRegistration
  },
  Puppet,
  MatrixPuppetBridgeBase
} = require("matrix-puppet-bridge");
const SlackClient = require('./client');
const path = require('path');
const config = require('./config.json');
const puppet = new Puppet('./config.json');
const debug = require('debug')('matrix-puppet:slack');
const Promise = require('bluebird');

class App extends MatrixPuppetBridgeBase {
  setSlackTeam(teamName, userAccessToken) {
    this.teamName = teamName;
    this.userAccessToken = userAccessToken;
    this.servicePrefix = `slack_${this.teamName}`;
  }
  getServicePrefix() {
    return this.servicePrefix;
  }
  initThirdPartyClient() {
    this.client = new SlackClient(this.userAccessToken);
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
        console.error(err);
      });
    });
    return this.client.connect();
  }
  getThirdPartyRoomDataById(id) {
    const channel = this.client.getChannelById(id);
    if ( channel ) {
      return {
        name: channel.name,
        topic: channel.purpose.value // there is also channel.topic but it seems less used
      }
    } else {
      const im = this.client.getImById(id);
      return {
        name: this.client.getUserById(im.user).name,
        topic: `Slack Direct Message (Team: ${this.teamName})`
      }
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
    puppet.associate().then(()=>{
      reg.setId(AppServiceRegistration.generateToken());
      reg.setHomeserverToken(AppServiceRegistration.generateToken());
      reg.setAppServiceToken(AppServiceRegistration.generateToken());
      reg.setSenderLocalpart(`slack_bot`);
      reg.addRegexPattern("users", `@slack_.*`, true);
      callback(reg);
    }).catch(err=>{
      console.error(err.message);
      process.exit(-1);
    });
  },
  run: function(port) {
    let teamAppList = [];
    let matrixRoomAppMap = {};
    let protocols = config.slack.map(i=>`slack_${i.team_name}`);

    const bridge = new Bridge(Object.assign({}, config.bridge, {
      controller: {
        onUserQuery: function(queriedUser) {
          console.log('got user query', queriedUser);
          return {}; // auto provision users w no additional data
        },
        onEvent: function(req, ctx) {
          const { room_id } = req.getData();
          if (!room_id) return;

          let app = matrixRoomAppMap[room_id];
          if (app) {
            debug('using cached mapping of matrix room id to slack team app instance');
            return app.handleMatrixEvent(req, ctx);
          } else {
            return teamAppList.forEach(app=>{
              let channel = app.getThirdPartyRoomIdFromMatrixRoomId(room_id);
              if (channel && app.client.getChannelById(channel)) {
                debug('caching mapping of matrix room id to slack team app instance');
                matrixRoomAppMap[room_id] = app;
                return app.handleMatrixEvent(req, ctx);
              }
            });
          }
        },
        onAliasQuery: function() {
          console.log('on alias query');
        },
        thirdPartyLookup: {
          protocols,
          getProtocol: function() {
            console.log('get proto');
          },
          getLocation: function() {
            console.log('get loc');
          },
          getUser: function() {
            console.log('get user');
          }
        }
      }
    }));

    return puppet.startClient().then(()=>{
      return Promise.map(config.slack, (team) => {
        const app = new App(config, puppet, bridge);
        app.setSlackTeam(team.team_name, team.user_access_token);
        app.initThirdPartyClient().then(() => app);
        return app;
      })
    }).then((apps)=> {
      teamAppList = apps;
      return bridge.run(port, config);
    }).then(()=>{
      console.log('Matrix-side listening on port %s', port);
    }).catch(err=>{
      console.error(err.stack);
      process.exit(-1);
    });
  }
}).run();
