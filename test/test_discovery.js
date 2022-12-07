'use strict';

const Discovery = require('../lib/deviceDiscovery.js');

let discoveryQuery = new Discovery({
    port: 502
  });

discoveryQuery.discover();

discoveryQuery.on('inverterInfo', result => {
    console.log('inverterInfo: ', result);
});

discoveryQuery.on('deviceInfo',(info)=>{
  console.log('deviceInfo', info)
})
discoveryQuery.on('deviceReadings',(info)=>{
  console.log('deviceReadings', info)
})