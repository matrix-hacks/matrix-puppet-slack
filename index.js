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

    // KINDA BAD because you might have 2 accounts that are in the same room
    // although that would be silly, right?
    const getAndCacheAppFromMatrixRoomId = (room_id) => {
      return new Promise((resolve, reject) => {
        let app = matrixRoomAppMap[room_id];
        if (app) {
          return resolve(app);
        } else {
          let ret = teamAppList.reduce((acc, app)=>{
            if ( acc ) return acc;
            let slackRoomId = app.getThirdPartyRoomIdFromMatrixRoomId(room_id);
            let slackRoom = app.client.getRoomById(slackRoomId);
            if (slackRoom) {
              matrixRoomAppMap[room_id] = app;
              return app;
            }
          }, null);
          return ret ? resolve(ret) : reject(new Error('could not find slack team app for matrix room id', matrixRoomId));
        }
      });
    }

    const bridge = new Bridge(Object.assign({}, config.bridge, {
      controller: {
        onUserQuery: function(queriedUser) {
          console.log('got user query', queriedUser);
          return {}; // auto provision users w no additional data
        },
        onEvent: function(req, ctx) {
          const { room_id } = req.getData();
          debug('event in room id', room_id);
          if (room_id) {
            getAndCacheAppFromMatrixRoomId(room_id).then( app => {
              debug('got app from matrix room id');
              return app.handleMatrixEvent(req, ctx);
            }).catch(err=>{
              debug('could not get app for matrix room id');
              console.error(err);
            });
          }
        },
        onAliasQuery: function() {
          console.log('on alias query');
        },
        thirdPartyLookup: {
          protocols: config.slack.map(i=>`slack_${i.team_name}`),
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
