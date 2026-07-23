import { Service, PlatformAccessory } from 'homebridge';
import { DreoPlatform } from '../platform';
import { BaseAccessory } from './BaseAccessory';
import { getConfiguredMaxSpeed } from './FanCapabilities';

/**
 * Air Conditioner / Cooler Accessory
 * Handles cooling devices (HAC - Hybrid Air Cooler)
 */
export class CoolerAccessory extends BaseAccessory {
  private service: Service;
  private temperatureService?: Service;

  private currState = {
    on: false,
    targetTemperature: 24,
    minTemperature: 16,
    maxTemperature: 32,
    currentTemperature: 25,
    humidity: 0,
    mode: 'cool', // cool, dry, fan, heat
    swing: false,
    speed: 1,
    maxSpeed: 4,
  };

  constructor(
    platform: DreoPlatform,
    accessory: PlatformAccessory,
    private readonly state,
  ) {
    super(platform, accessory);

    // Initialize state from device
    this.currState.on = state.poweron?.state || false;
    this.currState.currentTemperature = state.temp?.state || 25;
    this.currState.targetTemperature = state.tartemp?.state || 24;
    this.currState.humidity = state.humidity?.state || 0;
    this.currState.mode = this.mapMode(state.hvacmode?.state || 0);

    // Keep the published enhanced plugin's safe fallback when metadata is absent.
    this.currState.maxSpeed = getConfiguredMaxSpeed(
      accessory.context.device,
      4,
    );

    // Main Cooler Service
    this.service =
      this.accessory.getService(this.platform.Service.HeaterCooler) ||
      this.accessory.addService(this.platform.Service.HeaterCooler);

    this.service.setCharacteristic(
      this.platform.Characteristic.Name,
      accessory.context.device.deviceName,
    );

    // Active characteristic
    this.service
      .getCharacteristic(this.platform.Characteristic.Active)
      .onSet(this.setActive.bind(this))
      .onGet(this.getActive.bind(this));

    // Current temperature
    this.service
      .getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(this.getCurrentTemperature.bind(this));

    // Target temperature
    this.service
      .getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .setProps({
        minValue: this.currState.minTemperature,
        maxValue: this.currState.maxTemperature,
        minStep: 1,
      })
      .onSet(this.setTargetTemperature.bind(this))
      .onGet(this.getTargetTemperature.bind(this));

    // Current heater cooler state
    this.service
      .getCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState)
      .onGet(this.getCurrentHeaterCoolerState.bind(this));

    // Target heater cooler state
    this.service
      .getCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState)
      .setProps({
        validValues: [
          this.platform.Characteristic.TargetHeaterCoolerState.AUTO,
          this.platform.Characteristic.TargetHeaterCoolerState.COOL,
          this.platform.Characteristic.TargetHeaterCoolerState.HEAT,
        ],
      })
      .onSet(this.setTargetHeaterCoolerState.bind(this))
      .onGet(this.getTargetHeaterCoolerState.bind(this));

    // Rotation speed
    this.service
      .getCharacteristic(this.platform.Characteristic.RotationSpeed)
      .setProps({
        minStep: 100 / this.currState.maxSpeed,
      })
      .onSet(this.setRotationSpeed.bind(this))
      .onGet(this.getRotationSpeed.bind(this));

    // Swing mode
    this.service
      .getCharacteristic(this.platform.Characteristic.SwingMode)
      .onSet(this.setSwingMode.bind(this))
      .onGet(this.getSwingMode.bind(this));

    // Temperature display units
    this.service
      .getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
      .setValue(this.platform.Characteristic.TemperatureDisplayUnits.CELSIUS);
  }

  private mapMode(hvacMode: number): string {
    const modeMap: { [key: number]: string } = {
      0: 'cool',
      1: 'dry',
      2: 'fan',
      3: 'heat',
    };
    return modeMap[hvacMode] || 'cool';
  }

  private mapModeToHvac(mode: string): number {
    const modeMap: { [key: string]: number } = {
      cool: 0,
      dry: 1,
      fan: 2,
      heat: 3,
    };
    return modeMap[mode] || 0;
  }

  setActive(value) {
    this.platform.log.debug('Triggered SET Active:', value);
    if (this.currState.on !== Boolean(value)) {
      this.platform.webHelper.control(this.sn, {
        poweron: Boolean(value),
      });
      this.currState.on = Boolean(value);
    }
  }

  getActive() {
    return this.currState.on;
  }

  getCurrentTemperature() {
    return this.currState.currentTemperature;
  }

  setTargetTemperature(value) {
    this.platform.log.debug('Setting target temperature:', value);
    this.platform.webHelper.control(this.sn, {
      tartemp: value,
    });
    this.currState.targetTemperature = value;
  }

  getTargetTemperature() {
    return this.currState.targetTemperature;
  }

  getCurrentHeaterCoolerState() {
    if (!this.currState.on) {
      return this.platform.Characteristic.CurrentHeaterCoolerState.INACTIVE;
    }
    if (this.currState.mode === 'heat') {
      return this.platform.Characteristic.CurrentHeaterCoolerState.HEATING;
    }
    return this.platform.Characteristic.CurrentHeaterCoolerState.COOLING;
  }

  setTargetHeaterCoolerState(value) {
    let newMode = 'cool';
    if (value === this.platform.Characteristic.TargetHeaterCoolerState.HEAT) {
      newMode = 'heat';
    } else if (
      value === this.platform.Characteristic.TargetHeaterCoolerState.AUTO
    ) {
      newMode = 'cool'; // Default to cool for auto
    }
    this.platform.log.debug('Setting HVAC mode:', newMode);
    this.platform.webHelper.control(this.sn, {
      hvacmode: this.mapModeToHvac(newMode),
    });
    this.currState.mode = newMode;
  }

  getTargetHeaterCoolerState() {
    if (this.currState.mode === 'heat') {
      return this.platform.Characteristic.TargetHeaterCoolerState.HEAT;
    }
    return this.platform.Characteristic.TargetHeaterCoolerState.COOL;
  }

  setRotationSpeed(value) {
    const speed = Math.ceil((value / 100) * this.currState.maxSpeed);
    if (speed > 0 && speed !== this.currState.speed) {
      this.platform.log.debug('Setting fan speed:', speed);
      this.platform.webHelper.control(this.sn, {
        speed: speed,
      });
      this.currState.speed = speed;
    }
  }

  getRotationSpeed() {
    return (this.currState.speed / this.currState.maxSpeed) * 100;
  }

  setSwingMode(value) {
    this.platform.log.debug('Setting swing mode:', value);
    this.platform.webHelper.control(this.sn, {
      swing: Number(value),
    });
    this.currState.swing = value === 1;
  }

  getSwingMode() {
    return this.currState.swing ? 1 : 0;
  }
}
