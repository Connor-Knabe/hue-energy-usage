const express = require('express');
const app = express();
const http = require('http').Server(app);
const log4js = require('log4js');
const login = require('./settings/login.js'),
    hue = require('node-hue-api');


var logger = log4js.getLogger();
logger.level = 'debug';

var port = 80;

http.listen(port, function () {
    logger.info('listening on *:', port);
});
var HueApi = hue.HueApi,
    lightState = hue.lightState,
    host = options.hueBridgeIp,
    username = options.hueUser,
    api = new HueApi(host, username),
    state = lightState.create(),
    lightsOffTimeout = null,
    lightsOffTimedTimeout = null;

