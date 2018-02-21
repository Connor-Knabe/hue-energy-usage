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

const port = 1234;

http.listen(port, function () {
    logger.info('listening on *:', port);
});

const costPerKWH = .10;

var HueApi = hue.HueApi,
    lightState = hue.lightState,
    host = options.hueBridgeIp,
    username = options.hueUser,
    api = new HueApi(host, username),
    state = lightState.create();

var file = './data.json'
var lightsTracking = [];

try {
    lightsTracking = jsonfile.readFileSync(file);
} catch (err) {
    if (err && err.toString().includes("no such file or directory")) {
        logger.info(`No ${file} file found creating new file`);
        jsonfile.writeFileSync(file, lightsTracking);
    } else {
        logger.error(`Error reading file ${err}`);
    }
}

api.lights()
    .then((lights) => {
        var lightString = JSON.stringify(lights, null, 2);
        var lightObj = JSON.parse(lightString);
        logger.info(`App start time`)
        var startTime = new Date();
        lightObj.lights.forEach((light) => {
            if (light.state.on) {
                lightsTracking.push({
                    "id": light.id, "type": light.type, "name": light.name, "lightsOnMins": 0,
                    "lightTurnedOnTime": new Date(), "wasOn": true
                });
            } else {
                lightsTracking.push({
                    "id": light.id, "type": light.type, "name": light.name, "lightsOnMins": 0,
                    "lightTurnedOnTime": null, "wasOn": false
                });
            }
        });
    });


setInterval(() => {
    lightsTracking.forEach((light, index) => {
        isLightOn(light.id).then((lightOn) => {
            if (lightOn && !lightsTracking[index].wasOn) {
                logger.debug(`light on but was off id:${light.id}`);
                lightsTracking[index].lightTurnedOnTime = new Date();
                lightsTracking[index].wasOn = true;
            } else if (!lightOn && lightsTracking[index].wasOn) {
                var lightsObj = lightsTracking[index];
                var curTime = new Date();
                //@ts-ignore
                var diff = Math.abs(curTime - new Date(lightsTracking[index].lightTurnedOnTime));
                var minutes = Math.floor((diff / 1000) / 60);
                logger.debug(`light not on but was on for mins ${minutes} id:${light.id}`);
                lightsObj.lightsOnMins += minutes;
                lightsTracking[index].wasOn = false
            }
        });
    });
}, 1 * 60 * 1000);

setInterval(() => {
    logger.debug('lights tracking', lightsTracking);

    try {
        jsonfile.writeFileSync(file, lightsTracking);
    } catch (error) {
        logger.error(`Error writing file`, error);
    }


    lightsTracking.forEach((light, index) => {
        var hoursOn = null;
        if (light.lightsOnMins > 60) {
            hoursOn = light.lightsOnMins / 60;
            //add wattage calculation based on type of bulb
            //add at current rate of usage what is cost per month/year
            //curTime - startTime get mins. Divide total cost by mins. Multiply by mins in month/year
            var wattMultiplier = 8;
            logger.debug(`\nLight name: ${light.name}\n Mins on: ${light.lightsOnMins}\n
                Hours on: ${hoursOn}\n Cost: ${hoursOn * wattMultiplier / 1000 * costPerKWH}`);
        } else {
            logger.debug(`\nLight name: ${light.name}\n Mins on: ${light.lightsOnMins} `);
        }

    });
}, 5 * 60 * 1000);

function isLightOn(lightNumber) {
    return new Promise((resolve, reject) => {
        api.lightStatus(lightNumber)
            .then((status) => {
                resolve(status.state.on);
            });
    });
}


