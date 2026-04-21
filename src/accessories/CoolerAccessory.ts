import { Service, PlatformAccessory } from 'homebridge';
import { DreoPlatform } from '../platform';
import { BaseAccessory } from './BaseAccessory';

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

    // Get max speed
    const speedControl = accessory.context.device.controlsConf.control.find(
      (params) => params.type === 'Speed',
    );
    if (speedControl) {
      this.currState.maxSpeed = speedControl.items[1].text || 4;
    }

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

  async setActive(value) {
    this.currState.on = value;
    const command = value ? 'poweron' : 'poweroff';
    await this.sendCommand(command, value ? 1 : 0);
  }

  async getActive() {
    return this.currState.on ? 1 : 0;
  }

  async getCurrentTemperature() {
    return this.currState.currentTemperature;
  }

  async setTargetTemperature(value) {
    this.currState.targetTemperature = value;
    await this.sendCommand('tartemp', value);
  }

  async getTargetTemperature() {
    return this.currState.targetTemperature;
  }

  async getCurrentHeaterCoolerState() {
    if (!this.currState.on) {
      return this.platform.Characteristic.CurrentHeaterCoolerState.INACTIVE;
    }
    if (this.currState.mode === 'heat') {
      return this.platform.Characteristic.CurrentHeaterCoolerState.HEATING;
    }
    return this.platform.Characteristic.CurrentHeaterCoolerState.COOLING;
  }

  async setTargetHeaterCoolerState(value) {
    let newMode = 'cool';
    if (value === this.platform.Characteristic.TargetHeaterCoolerState.HEAT) {
      newMode = 'heat';
    } else if (
      value === this.platform.Characteristic.TargetHeaterCoolerState.AUTO
    ) {
      newMode = 'cool'; // Default to cool for auto
    }
    this.currState.mode = newMode;
    await this.sendCommand('hvacmode', this.mapModeToHvac(newMode));
  }

  async getTargetHeaterCoolerState() {
    if (this.currState.mode === 'heat') {
      return this.platform.Characteristic.TargetHeaterCoolerState.HEAT;
    }
    return this.platform.Characteristic.TargetHeaterCoolerState.COOL;
  }

  async setRotationSpeed(value) {
    const speed = Math.ceil((value / 100) * this.currState.maxSpeed);
    this.currState.speed = speed;
    await this.sendCommand('speed', speed);
  }

  async getRotationSpeed() {
    return (this.currState.speed / this.currState.maxSpeed) * 100;
  }

  async setSwingMode(value) {
    this.currState.swing = value === 1;
    await this.sendCommand('swing', value);
  }

  async getSwingMode() {
    return this.currState.swing ? 1 : 0;
  }

  private async sendCommand(directive: string, value: number | boolean) {
    this.platform.log.debug(
      `Sending command to ${this.accessory.displayName}: ${directive}=${value}`,
    );
    try {
      await this.platform.webHelper.sendCommand(
        this.accessory.context.device.sn,
        directive,
        value,
      );
    } catch (error) {
      this.platform.log.error(
        `Error sending command: ${error.message}`,
      );
    }
  }
}
