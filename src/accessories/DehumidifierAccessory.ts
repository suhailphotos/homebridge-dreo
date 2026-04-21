import { Service, PlatformAccessory } from 'homebridge';
import { DreoPlatform } from '../platform';
import { BaseAccessory } from './BaseAccessory';

/**
 * Dehumidifier Accessory
 * Handles dehumidifier devices
 */
export class DehumidifierAccessory extends BaseAccessory {
  private service: Service;

  private currState = {
    on: false,
    targetHumidity: 60,
    currentHumidity: 65,
    minHumidity: 30,
    maxHumidity: 80,
    mode: 'auto',
  };

  constructor(
    platform: DreoPlatform,
    accessory: PlatformAccessory,
    private readonly state,
  ) {
    super(platform, accessory);

    // Initialize state
    this.currState.on = state.poweron?.state || state.fanon?.state || false;
    this.currState.currentHumidity = state.humidity?.state || 65;
    this.currState.targetHumidity = state.sethumiditylevel?.state || 60;

    // Dehumidifier Service
    this.service =
      this.accessory.getService(this.platform.Service.HumidifierDehumidifier) ||
      this.accessory.addService(this.platform.Service.HumidifierDehumidifier);

    this.service.setCharacteristic(
      this.platform.Characteristic.Name,
      accessory.context.device.deviceName,
    );

    // Active
    this.service
      .getCharacteristic(this.platform.Characteristic.Active)
      .onSet(this.setActive.bind(this))
      .onGet(this.getActive.bind(this));

    // Current humidity
    this.service
      .getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
      .onGet(this.getCurrentHumidity.bind(this));

    // Target humidity
    this.service
      .getCharacteristic(this.platform.Characteristic.TargetRelativeHumidity)
      .setProps({
        minValue: this.currState.minHumidity,
        maxValue: this.currState.maxHumidity,
        minStep: 5,
      })
      .onSet(this.setTargetHumidity.bind(this))
      .onGet(this.getTargetHumidity.bind(this));

    // Dehumidification target
    this.service
      .getCharacteristic(this.platform.Characteristic.TargetHumidifierDehumidifierState)
      .setProps({
        validValues: [
          this.platform.Characteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER,
        ],
      })
      .setValue(this.platform.Characteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER);

    // Current state
    this.service
      .getCharacteristic(this.platform.Characteristic.CurrentHumidifierDehumidifierState)
      .onGet(this.getCurrentState.bind(this));

    // Water level (read-only)
    this.service
      .getCharacteristic(this.platform.Characteristic.WaterLevel)
      .onGet(this.getWaterLevel.bind(this));
  }

  async setActive(value) {
    this.currState.on = value;
    const powerCmd = this.state.fanon !== undefined ? 'fanon' : 'poweron';
    await this.sendCommand(powerCmd, value ? 1 : 0);
  }

  async getActive() {
    return this.currState.on ? 1 : 0;
  }

  async getCurrentHumidity() {
    return this.currState.currentHumidity;
  }

  async setTargetHumidity(value) {
    this.currState.targetHumidity = value;
    await this.sendCommand('sethumiditylevel', value);
  }

  async getTargetHumidity() {
    return this.currState.targetHumidity;
  }

  async getCurrentState() {
    if (!this.currState.on) {
      return this.platform.Characteristic.CurrentHumidifierDehumidifierState.INACTIVE;
    }
    if (this.currState.currentHumidity > this.currState.targetHumidity) {
      return this.platform.Characteristic.CurrentHumidifierDehumidifierState.DEHUMIDIFYING;
    }
    return this.platform.Characteristic.CurrentHumidifierDehumidifierState.IDLE;
  }

  async getWaterLevel() {
    // Return water level if available, otherwise return 0
    return this.state.waterLevel?.state || 0;
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
      this.platform.log.error(`Error sending command: ${error.message}`);
    }
  }
}
