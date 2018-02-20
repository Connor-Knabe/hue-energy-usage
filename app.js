const express = require('express');
const app = express();
//@ts-ignore
const http = require('http').Server(app);
//@ts-ignore
const log4js = require('log4js');
const options = require('./settings/options.js'),
    hue = require('node-hue-api');

const jsonfile = require('jsonfile')

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
    state = lightState.create();

var file = './data.json'
jsonfile.readFile(file, function (err, obj) {
    logger.debug(obj);

});

var lightsTracking = [];

api.lights()
    .then((lights) => {
        var lightString = JSON.stringify(lights, null, 2);
        var lightObj = JSON.parse(lightString);
        lightObj.forEach((light) => {
            logger.info(`App start time`)
            if (light.state.on) {
                lightsTracking.push({ "id": light.id, "lightsOnMins": 0, "lightTurnedOnTime": new Date(), "wasOn": true });
            } else {
                lightsTracking.push({ "id": light.id, "type": light.type, "lightsOnMins": 0, "lightTurnedOnTime": null, "wasOn": false });
            }
        });
    });


setInterval(() => {
    lightsTracking.forEach((lightId, index) => {
        isLightOn(lightId).then((lightOn) => {
            if (lightOn && !lightsTracking[index].wasOn) {
                lightsTracking[index].lightTurnedOnTime = new Date();
                lightsTracking[index].wasOn = true;
            } else if (!lightOn && lightsTracking[index].wasOn) {
                var lightsObj = lightsTracking[index];
                var curTime = new Date();
                //@ts-ignore
                var diffMs = curTime - lightsTracking[index].lightTurnedOnTime;
                var diffMins = Math.round(((diffMs % 86400000) % 3600000) / 60000);
                lightsObj.lightsOnMins += diffMins;
                lightsTracking[index].wasOn = false
            }
        });
    });
}, 5 * 60 * 1000);

function isLightOn(lightNumber) {
    return new Promise((resolve, reject) => {
        api.lightStatus(lightNumber)
            .then((status) => {
                logger.debug('light status', status);
                resolve(status.state.on);
            });
    });
}


