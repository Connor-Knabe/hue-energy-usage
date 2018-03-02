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
var totalUsage = {};
var newFile = false;
try {
    lightsTracking = jsonfile.readFileSync(file);
} catch (err) {
    if (err && err.toString().includes("no such file or directory")) {
        logger.info(`No ${file} file found creating new file`);
        newFile = true;
        jsonfile.writeFileSync(file, lightsTracking);
    } else {
        logger.error(`Error reading file ${err}`);
    }
}

calculateUsageAndLog(false);
api.lights()
    .then((lights) => {
        var lightString = JSON.stringify(lights, null, 2);
        var lightObj = JSON.parse(lightString);
        logger.info(`App start time`)
        var startTime = new Date();
        lightObj.lights.forEach((light) => {
            if (newFile) {
                var bulbWattage = 10;


                //If you don't have smart bulbs in all of your rooms you can use this to calculate addional usage
                // if (light.name === "Garage 1") {
                //     //testing batch of lights for kitchen table with 1 smart bulb
                //     bulbWattage = 6 * 8;
                // } else if (light.name === "Garage 2") {
                //     //accounting for garage light
                //     bulbWattage = 20;
                // } else if (light.name === "Lamp 1") {
                //     //testing bathroom lights
                //     bulbWattage = 2 * 8;
                // } else if (light.name === "Lamp 2") {
                //     //accounting for missing lamp light
                //     bulbWattage = 20;
                // } else if (light.name === "LR 1") {
                //     //testing flood bulbs in kitchen
                //     bulbWattage = 7 * 10;
                // } else if (light.name === "LR 2") {
                //     //accounting for missing LR light
                //     bulbWattage = 24;
                // } else if (light.name === "BR 1") {
                //     //testing living room fan lights
                //     bulbWattage = 4 * 8;
                // } else if (light.name === "BR 2") {
                //     //accounting for missing BR light
                //     bulbWattage = 12;
                // }

                if (light.modelid === "LST002") {
                    bulbWattage = 20;
                } else if (light.modelid === "LTW012" || light.modelid === "LCT001") {
                    bulbWattage = 6;
                }

                if (light.state.on) {
                    lightsTracking.push({
                        "id": light.id, "type": light.type, "name": light.name,
                        "lightsOnMins": 0, "bulbWattage": bulbWattage, "cost": 0,
                        "lightTurnedOnTime": new Date(), "firstOnTime": new Date(),
                        "modelId": light.modelid, "wasOn": true
                    });
                } else {
                    lightsTracking.push({
                        "id": light.id, "type": light.type, "name": light.name,
                        "lightsOnMins": 0, "bulbWattage": bulbWattage, "cost": 0,
                        "lightTurnedOnTime": null, "firstOnTime": new Date(),
                        "modelId": light.modelid, "wasOn": false
                    });
                }
            } else {
                var wasOn = light.state.on;
                var lightTurnedOnTime = light.state.on ? new Date() : null;

                var lightsTrackingObj = lightsTracking.find(x => x.id === light.id);
                if (lightsTrackingObj) {
                    lightsTrackingObj.wasOn = wasOn;
                    lightsTrackingObj.lightTurnedOnTime = lightTurnedOnTime;
                }
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
    calculateUsageAndLog(true);
}, 15 * 60 * 1000);

function calculateUsageAndLog(shouldLog) {
    return new Promise((resolve, reject) => {
        if (shouldLog) {
            logger.debug('lights tracking', lightsTracking);
        }

        try {
            jsonfile.writeFileSync(file, lightsTracking);
        } catch (error) {
            logger.error(`Error writing file`, error);
        }
        var totalCost = 0;
        var totalHours = 0;
        var totalKwh = 0;
        lightsTracking.forEach((light, index) => {
            var hoursOn = null;
            if (light.lightsOnMins > 0) {
                hoursOn = light.lightsOnMins / 60;
                totalHours += hoursOn;
                //add at current rate of usage what is cost per month/year
                //curTime - startTime get mins. Divide total cost by mins. Multiply by mins in month/year

                var curTime = new Date();
                //@ts-ignore
                var diff = Math.abs(curTime - new Date(lightsTracking[index].firstOnTime));
                var hoursSinceFirstOn = Math.floor((diff / 1000) / 60);

                //TODO refactor costPerX calculation
                var kwh = getKWH(hoursOn, light.bulbWattage);
                var cost = kwh * costPerKWH;
                var costPerMin = cost / hoursSinceFirstOn;
                var costPerWeek = roundDecimals(costPerMin * 10080);
                var costPerMonth = roundDecimals(costPerMin * 43800);
                var costPerYear = roundDecimals(costPerMin * 525600);
                totalCost += cost;
                totalKwh += kwh;

                cost = Math.round(cost * 100) / 100;
                light.cost = cost;
                logger.debug(`\nLight name: ${light.name}\nKWH: ${kwh} \nMins on: ${light.lightsOnMins}\nHours on: ${roundDecimals(hoursOn)}\nCost so far: $${cost}\nCost per week: $${costPerWeek}\nCost per month: $${costPerMonth}\nCost per year: $${costPerYear}`);
            } else {
                logger.debug(`\nLight name: ${light.name}\nMins on: ${light.lightsOnMins} `);
            }

        });
        calculateTotalUsage(totalKwh, totalCost, totalHours, lightsTracking[0].firstOnTime, shouldLog);

        resolve();
    });

}

function roundDecimals(number) {
    return Math.round(number * 100) / 100;
}

function getKWH(hours, wattage) {
    return hours * wattage / 1000;
}

function calculateTotalUsage(kwh, cost, hoursOn, firstOnTime, shouldLog) {
    //TODO refactor costPerX calculation
    var curTime = new Date();

    //@ts-ignore
    var diff = Math.abs(curTime - new Date(firstOnTime));
    var hoursSinceFirstOn = Math.floor((diff / 1000) / 60);
    var costPerMin = cost / hoursSinceFirstOn;
    var costPerWeek = roundDecimals(costPerMin * 10080);
    var costPerMonth = roundDecimals(costPerMin * 43800);
    var costPerYear = roundDecimals(costPerMin * 525600);

    var kwhPerMin = kwh / hoursSinceFirstOn;
    var kwhPerWeek = roundDecimals(kwhPerMin * 10080);
    var kwhPerMonth = roundDecimals(kwhPerMin * 43800);
    var kwhPerYear = roundDecimals(kwhPerMin * 525600);
    //TODO call this on first app load
    totalUsage = {
        "totalHours": roundDecimals(hoursSinceFirstOn),
        "hoursOn": roundDecimals(hoursOn),
        "cost": roundDecimals(cost),
        "kwh": roundDecimals(kwh),
        "costPerWeek": costPerWeek,
        "costPerMonth": costPerMonth,
        "costPerYear": costPerYear,
        "kwhPerWeek": kwhPerWeek,
        "kwhPerMonth": kwhPerMonth,
        "kwhPerYear": kwhPerYear
    }
    if (shouldLog) {
        logger.debug(`\nTotal hours on: ${roundDecimals(hoursOn)}\nTotal cost: $${cost}\nCost per week: $${costPerWeek}\nCost per month: $${costPerMonth}\nCost per year: $${costPerYear}`);
        logger.debug(`\nTotal hours on: ${roundDecimals(hoursOn)}\nTotal KWH: ${roundDecimals(kwh)}\nKWH per week: ${roundDecimals(kwhPerWeek)}\nKWH per month: ${roundDecimals(kwhPerMonth)}\nKWH per year: ${roundDecimals(kwhPerYear)}`);
    }

}

function isLightOn(lightNumber) {
    return new Promise((resolve, reject) => {
        api.lightStatus(lightNumber)
            .then((status) => {
                logger.debug(`Light #${lightNumber} is responding. State is: ${status.state.on}`)
                resolve(status.state.on && status.state.reachable);
            }).catch((err) => {
                logger.error(`Issue checking if light #${lightNumber} is on. With error: ${err}`)
                resolve(false);
            });
    });
}


app.get('/', (req, res) => {
    calculateUsageAndLog(false).then(() => {
        logger.debug('usage');
        logger.debug(totalUsage);
        res.render('index.ejs', { totalUsage: totalUsage, lightsTracking: lightsTracking });
    });
});
