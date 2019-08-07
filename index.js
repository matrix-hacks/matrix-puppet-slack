const migrations = require('./config_migrations');
migrations.run();

const config = require('./config.json');
const {
  MatrixAppServiceBridge: {
    Bridge, Cli, AppServiceRegistration
  },
  Puppet,
} = require("matrix-puppet-bridge");
const puppet = new Puppet('./config.json');
const debug = require('debug')('matrix-puppet:slack');
const App = require('./app');

new Cli({
  port: config.port,
  registrationPath: config.registrationPath,
  generateRegistration: async function(reg, callback) {
    try {
      await puppet.associate();
      reg.setId(AppServiceRegistration.generateToken());
      reg.setHomeserverToken(AppServiceRegistration.generateToken());
      reg.setAppServiceToken(AppServiceRegistration.generateToken());
      reg.setSenderLocalpart(`${config.prefix}_bot`);
      reg.addRegexPattern("users", `@${config.prefix}_.*`, true);
      reg.addRegexPattern("aliases", `#${config.prefix}_.*`, false);
      callback(reg);
    } catch (err) {
      debug(err.message);
      process.exit(-1);
    }
  },
  run: async(port) => {
    let teamAppList = [];

    let matrixRoomAppMap = {};

    // KINDA BAD because you might have 2 accounts that are in the same room
    // although that would be silly, right?
    const getAndCacheAppFromMatrixRoomId = async(room_id) => {
      let app = matrixRoomAppMap[room_id];
      if (app) {
        return app;
      }
      for (const teamApp of teamAppList) {
        let slackRoomId = teamApp.getThirdPartyRoomIdFromMatrixRoomId(room_id);
        let slackRoom = await teamApp.client.getRoomById(slackRoomId);
        if (!slackRoom) {
          continue;
        }
        debug('getting app from slack room', slackRoom);
        matrixRoomAppMap[room_id] = teamApp;
        return teamApp;
      }
      throw new Error('could not find slack team app for matrix room id', room_id);
    };

    const bridge = new Bridge(Object.assign({}, config.bridge, {
      controller: {
        onUserQuery: function(queriedUser) {
          debug('got user query', queriedUser);
          return {}; // auto provision users w no additional data
        },
        onEvent: async function(req, ctx) {
          const { room_id } = req.getData();
          debug('event in room id', room_id);
          if (room_id) {
            try {
              const app = await getAndCacheAppFromMatrixRoomId(room_id);
              debug('got app from matrix room id');
              return app.handleMatrixEvent(req, ctx);
            } catch (err) {
              debug('could not get app for matrix room id');
              debug(err);
            }
          }
        },
        onAliasQuery: function() {
          debug('on alias query');
        },
        thirdPartyLookup: {
          protocols: config.slack.map(i=>`${config.prefix}_${i.team_name}`),
          getProtocol: function() {
            debug('get proto');
          },
          getLocation: function() {
            debug('get loc');
          },
          getUser: function() {
            debug('get user');
          }
        }
      }
    }));

    try {
      await bridge.run(port, config);
      await puppet.startClient();
      const apps = [];
      for (const team of config.slack) {
        const app = new App(config, puppet, bridge);
        app.setSlackTeam(team.team_name, team.user_access_token, team.notify);
        debug('initing teams');
        try {
          await app.initThirdPartyClient();
          debug('team success');
        } catch (err) {
          debug('team failure', err.message);
        }
        apps.push(app);
      }
      apps.map(a=>{
        debug('!!!! apps....', a.teamName);
      });
      teamAppList = apps;
      debug('Matrix-side listening on port %s', port);
    } catch (err) {
      debug(err.stack);
      process.exit(-1);
    }
  }
}).run();
