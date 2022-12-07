'use strict';

const SMA = require('./sma.js');
var EventEmitter = require('events');
var util = require('util');
var dgram = require("dgram");

//UDP datagram must be sent to the multicast address 239.12.255.254 via port 9522
const PORT = 9522;
const MULTICAST_ADDR = "239.12.255.254";
const datagram = Buffer.from('534d4100000402a0ffffffff0000002000000000', 'hex');

function Discovery(options) {
    var self = this;
    EventEmitter.call(self);
    self.deviceList = [];
    self.inverterPort = options.port;
    self.on('deviceInfo',(info)=>{
        console.log('deviceInfo', info)
    })
    self.on('deviceReadings',(info)=>{
        console.log('deviceReadings', info)
    })
    
}
util.inherits(Discovery, EventEmitter);

Discovery.prototype.discover = function () {
    var self = this;
    let socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    
    socket.on("listening", function() {
        socket.addMembership(MULTICAST_ADDR);
        socket.send(datagram, 0, datagram.length, PORT, MULTICAST_ADDR, function() {
            console.info(`Sending discovery datagram`);
        });
    });
    
    socket.on("message", function(message, rinfo) {
        let response = Buffer.from(message).toString('hex');
        console.info(`Message from: ${rinfo.address}:${rinfo.port} - ${response}`);
        if (response.startsWith('534d4100000402a000000001000200000001')) {
            self.deviceList.push(rinfo.address);
            console.log(`Found SMA device at: ${rinfo.address}`);
        }
    });
    
    socket.bind(PORT);
    //Wait 1.5 seconds before we collect the inverters found
    sleep(1500).then(() => {
        console.log(`Collecting device info, found ${self.deviceList.length} devices.`);
        if (self.deviceList) {
            lookupInverters(self, self.deviceList)
            .then((result) => {
                //console.log('Get result', result);

            });
        } else {
            self.emit('deviceInfo', []);
        }
    });
}

const lookupInverter = async (self, ipAddress) => {
    let smaSession = new SMA({
        host: ipAddress,
        port: self.inverterPort,
        autoClose: true
    });
    
    smaSession.on('properties', result => {
        result.port = self.inverterPort;
        result.address = ipAddress;
        self.emit('deviceInfo', result);
        smaSession.refreshReadings();
    });

    smaSession.on('readings', result => {
        self.emit('deviceReadings', result);
    });

    smaSession.on('error', error => {
        let msg = `Inverter found on IP '${ipAddress}', but port '${self.inverterPort}' is wrong!`;
        self.emit('error', new Error(msg));
    });
}
  
const lookupInverters = async (self, ipAddresses) => {
    const requests = ipAddresses.map((ipAddress) => {
        return lookupInverter(self, ipAddress)
            .then((inverterInfo) => {
                return inverterInfo;
            });
    });
    return Promise.all(requests);
}

// sleep time expects milliseconds
function sleep (time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}


exports = module.exports = Discovery;
