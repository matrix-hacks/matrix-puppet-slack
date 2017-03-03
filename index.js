const path = require('path');
const config = require('./config.json');
const {
  MatrixAppServiceBridge: {
    Bridge, Cli, AppServiceRegistration
  },
  Puppet,
} = require("matrix-puppet-bridge");
const puppet = new Puppet('./config.json');
const debug = require('debug')('matrix-puppet:slack');
const Promise = require('bluebird');
const slackdown = require('./slackdown');
const showdown  = require('showdown');
const converter = new showdown.Converter();
const App = require('./app');

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
              debug('getting app from slack room', slackRoom);
              matrixRoomAppMap[room_id] = app;
              return app;
            }
          }, null);
          return ret ? resolve(ret) : reject(new Error('could not find slack team app for matrix room id', room_id));
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

    return bridge.run(port, config).then(()=>{
      return puppet.startClient();
    }).then(()=>{
      return Promise.mapSeries(config.slack, (team) => {
        const app = new App(config, puppet, bridge);
        app.setSlackTeam(team.team_name, team.user_access_token);
        debug('initing teams');
        return app.initThirdPartyClient().then(() => {
          debug('team success');
          return app
        }).catch(err=> {
          debug('team failure', err.message);
          return app;
        });
      })
    }).then((apps)=> {
      apps.map(a=>{
        debug('!!!! apps....', a.teamName);
      });
      teamAppList = apps;
    }).then(()=>{
      console.log('Matrix-side listening on port %s', port);
    }).catch(err=>{
      console.error(err.stack);
      process.exit(-1);
    });
  }
}).run();
