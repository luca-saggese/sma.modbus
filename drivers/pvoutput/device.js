'use strict';

const Homey = require('homey');
const PVOutputClient = require('../../lib/pvoutputClient.js');
const utility = require('../../lib/util.js');
const decodeData = require('../../lib/decodeData.js');
//Encryption settings
const crypto = require('crypto');
const crypto_algorithm = 'aes-256-ctr';

class PVOutputDevice extends Homey.Device {

  async onInit() {
    this.log(`[${this.getName()}] SMA PVOutput initiated`);

    this.pollIntervals = [];
    this.pvoutputSession = null;

    if (!this.homey.settings.get(`${this.getData().id}.apikey`)) {
      //This is a newly added device, lets copy api key to homey settings
      this.log(`[${this.getName()}] Storing api key`);
      this.storeAPIKeyEncrypted();
    }

    this.pvoutputSession = new PVOutputClient({
      apikey: this.getAPIKey(),
      systemId: this.getData().id
    });

    this._initilializeTimers();
  }

  _initilializeTimers() {
    this.log(`[${this.getName()}] Adding timers`);
    // Start a poller, to check the device status
    this.pollIntervals.push(setInterval(() => {
      this.addStatus();
    }, this.getSetting('interval') * 60 * 1000));
  }

  _deleteTimers() {
    //Kill interval object(s)
    this.log(`[${this.getName()}] Removing timers`);
    this.pollIntervals.forEach(timer => {
      clearInterval(timer);
    });
  }

  _reinitializeTimers() {
    this._deleteTimers();
    this._initilializeTimers();
  }

  addStatus() {
    //Timer runs on interval, but only between start and stop hours
    if (this.shouldAddStatus()) {
      //this.log('We are with start and stop reporting hours, lets update PVOutput');
      let power_pv = 0;
      let yield_pv = 0;
      let voltage_pv = 0;
      //Sum values across all registered inverters
      //Most people will only have one, but lets support several
      let numberOfInverters = 0;
      for (const inverter of this.homey.drivers.getDriver('inverter').getDevices()) {
        numberOfInverters++;
        power_pv = power_pv + inverter.getCapabilityValue('measure_power');
        yield_pv = yield_pv + decodeData.formatKWHasWH(inverter.getCapabilityValue('meter_power'));
        voltage_pv = voltage_pv + inverter.getCapabilityValue('measure_voltage');
      }
      //Lets get average voltage
      if (numberOfInverters > 1) {
        voltage_pv = Number(voltage_pv / numberOfInverters).toFixed(2);
      }

      this.log(`Summarized values, yield: ${yield_pv}, power: ${power_pv}, voltage: ${voltage_pv},`);

      let self = this;
      this.pvoutputSession.publishStatus(this.homey.clock.getTimezone(), {
        yield: yield_pv,
        power: power_pv,
        voltage: voltage_pv
      })
        .then(function (result) {
          if (result.statusCode === 200) {
            self._updateProperty('connected', true);

          } else {
            self._updateProperty('connected', false);

            let dateTime = new Date().toISOString();
            self.setSettings({ last_error: dateTime + '\n' + result.response })
              .catch(err => {
                self.error('Failed to update settings last_error', err);
              });
          }
        });
    }
  }

  shouldAddStatus() {
    let timestamp = new Date();
    let time = Number(`${timestamp.getHours()}${utility.pad(timestamp.getMinutes(), 2)}`);
    //this.log(`Current time '${time}', start reporting '${this.getSetting('start_reporting')}', stop reporting '${this.getSetting('stop_reporting')}'`);
    if (time > this.getSetting('start_reporting') && time < this.getSetting('stop_reporting')) {
      //this.log('Logging to pvoutput');
      return true;
    } else {
      //this.log('Outside defined time window, no pvoutput logging');
      return false;
    }
  }

  _updateProperty(key, value) {
    if (this.hasCapability(key)) {
      let oldValue = this.getCapabilityValue(key);
      if (oldValue !== null && oldValue != value) {
        this.setCapabilityValue(key, value);

      } else {
        this.setCapabilityValue(key, value);
      }
    }
  }

  onDeleted() {
    this.log(`Deleting SMA PVOutput '${this.getName()}' from Homey.`);
    this.homey.settings.unset(`${this.getData().id}.apikey`);
    this.pvoutput = null;
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    let change = false;
    if (changedKeys.indexOf("interval") > -1) {
      this.log('Interval value was change to:', newSettings.interval);
      change = true;
    }

    if (change) {
      this._reinitializeTimers();
    }
  }

  storeAPIKeyEncrypted() {
    this.log(`[${this.getName()}] Encrypting api key`);
    let plaintextApikey = this.getStoreValue('apikey');
    this.homey.settings.set(`${this.getData().id}.apikey`, this.encryptText(plaintextApikey));

    //Remove unencrypted apikey passed from driver
    this.unsetStoreValue('apikey');
  }

  getAPIKey() {
    return this.decryptText(this.homey.settings.get(`${this.getData().id}.apikey`));
  }

  encryptText(plainText) {
    let iv = crypto.randomBytes(16);
    let cipher = crypto.createCipheriv(crypto_algorithm, Buffer.from(Homey.env.ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(plainText);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return { iv: iv.toString('hex'), encryptedData: encrypted.toString('hex') };
  }

  decryptText(encryptedJson) {
    let iv = Buffer.from(encryptedJson.iv, 'hex');
    let encryptedText = Buffer.from(encryptedJson.encryptedData, 'hex');
    let decipher = crypto.createDecipheriv(crypto_algorithm, Buffer.from(Homey.env.ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  }

}

module.exports = PVOutputDevice;
