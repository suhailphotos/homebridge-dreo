import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import {
  FanAccessory,
  FanControlAccessories,
} from './accessories/FanAccessory';
import { HeaterAccessory } from './accessories/HeaterAccessory';
import { HumidifierAccessory } from './accessories/HumidifierAccessory';
import { CoolerAccessory } from './accessories/CoolerAccessory';
import { DehumidifierAccessory } from './accessories/DehumidifierAccessory';
import DreoAPI from './DreoAPI';

const FAN_MODE_CONTROLS = [
  { value: 1, name: 'Normal', suffix: 'dreo-mode-normal' },
  { value: 2, name: 'Natural', suffix: 'dreo-mode-natural' },
  { value: 3, name: 'Sleep', suffix: 'dreo-mode-sleep' },
  { value: 4, name: 'Auto', suffix: 'dreo-mode-auto' },
];

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class DreoPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
  public readonly webHelper = new DreoAPI(this);

  // This is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', async () => {
      log.debug('Executed didFinishLaunching callback');
      // Run the method to discover / register your devices as accessories
      this.discoverDevices();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // Add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * Log into Dreo services, retrieve the user's devices, and register them as accessories
   * Also remove accessories that are no longer present on the user's account
   */
  async discoverDevices() {
    // Validate config values
    if (!this.config.options || !this.config.options.email || !this.config.options.password) {
      this.log.error('error: Invalid email and/or password');
      return;
    }

    // Request access token from Dreo server
    let auth = await this.webHelper.authenticate();
    // Check if access_token is valid
    if (auth === undefined) {
      this.log.error('Authentication error: Failed to obtain access_token');
      return;
    }
    this.log.info('Country:', auth.countryCode);
    this.log.info('Region:', auth.region);

    // Re-authenticate with EU server if european account is detected
    if (auth.region === 'EU') {
      this.webHelper.server = 'eu';
      auth = await this.webHelper.authenticate();
    } else if (auth.region !== 'NA') {
      this.log.error('error, unknown region');
      this.log.error('Please open a github issue and provide your Country and Region (shown above)');
      return;
    }

    // Use access token to retrieve user's devices
    const dreoDevices = await this.webHelper.getDevices();
    // Make sure devices were retrieved successfully
    if (dreoDevices === undefined) {
      return;
    }

    // Mask sensitive information and print the device list
    const maskedDevices = dreoDevices.map(device => ({
      ...device,
      sn: '********',
      deviceId: '********',
      familyId: '********',
      familyName: '********',
      roomId: '********',
      roomName: '********',
    }));
    this.log.debug('\n\nDevices:\n', maskedDevices);

    // Create a set of UUIDs for the currently discovered devices
    const discoveredDeviceUUIDs = new Set<string>();
    for (const device of dreoDevices) {
      discoveredDeviceUUIDs.add(this.api.hap.uuid.generate(device.sn));
      const isFan = ['DR-HTF', 'DR-HAF', 'DR-HPF', 'DR-HCF', 'DR-HAP']
        .some(prefix => device.model.startsWith(prefix));
      if (
        isFan &&
        (this.config.exposeFanModeSwitches ||
          this.config.exposeFanPreferences)
      ) {
        discoveredDeviceUUIDs.add(
          this.api.hap.uuid.generate(`${device.sn}:dreo-controls`),
        );
      }
      if (isFan && !this.config.hideTemperatureSensor) {
        discoveredDeviceUUIDs.add(
          this.api.hap.uuid.generate(`${device.sn}:dreo-temperature`),
        );
      }
    }

    // Unregister accessories that are no longer present
    const accessoriesToRemove = this.accessories.filter(accessory => !discoveredDeviceUUIDs.has(accessory.UUID));
    if (accessoriesToRemove.length > 0) {
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, accessoriesToRemove);
      this.log.info('Removing accessories:', accessoriesToRemove.map(accessory => accessory.displayName).join(', '));
    }

    // Open WebSocket (used to control devices later)
    await this.webHelper.startWebSocket();

    // Loop over the discovered devices and register each one if it has not already been registered
    for (const device of dreoDevices) {
      // Print device info:
      this.log.debug('Control config: ', JSON.stringify(device.controlsConf, null, 2));

      // Generate a unique id for the accessory this should be generated from
      // something globally unique, but constant, for example, the device serial
      // number or MAC address
      const uuid = this.api.hap.uuid.generate(device.sn);

      // See if an accessory with the same uuid has already been registered and restored from
      // the cached devices we stored in the `configureAccessory` method above
      const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

      let accessory: PlatformAccessory;

      if (existingAccessory) {
        // The accessory already exists
        this.log.info('Restoring existing accessory from cache:', device.deviceName);
        accessory = existingAccessory;
      } else {
        // The accessory does not yet exist, so we need to create it
        this.log.info('Adding new accessory:', device.deviceName);
        // Create a new accessory
        accessory = new this.api.platformAccessory(device.deviceName, uuid);
        // Store a copy of the device object in the `accessory.context`
        accessory.context.device = device;
      }
      accessory.context.device = device;

      // Get initial device state
      const state = await this.webHelper.getState(device.sn);
      if (state === undefined) {
        this.log.error('error: Failed to retrieve device state');
        return;
      }
      this.log.debug('Accessory state:', state);

      // Create the accessory handler for new/restored accessory
      // This is imported from `platformAccessory.ts`

      // List of supported model prefixes
      const SUPPORTED_MODEL_PREFIXES = [
        'DR-HTF',  // Tower Fan
        'DR-HAF',  // Air Circulator
        'DR-HPF',  // Air Circulator
        'DR-HCF',  // Ceiling Fan
        'DR-HAP',  // Air Purifier
        'DR-HSH',  // Heater
        'WH',      // Heater
        'DR-HAC',  // Air Conditioner / Hybrid Air Cooler
        'DR-HEC',  // Hybrid Evaporative Cooler
        'DR-HHM',  // Humidifier
        'DR-HDM',  // Dehumidifier
      ];

      // Find the matching prefix
      const modelPrefix = SUPPORTED_MODEL_PREFIXES.find(prefix => device.model.startsWith(prefix));

      // Determine device type based on the matched prefix
      switch (modelPrefix) {
        case 'DR-HTF':
        case 'DR-HAF':
        case 'DR-HPF':
        case 'DR-HCF':
        case 'DR-HAP':
          // Tower Fan, Air Circulator, Ceiling Fan, Air Purifier
          accessory.category = this.api.hap.Categories.FAN;
          {
            const controlAccessories: FanControlAccessories = {
              modes: new Map<number, PlatformAccessory>(),
            };
            const newControlAccessories: PlatformAccessory[] = [];
            const restoredControlAccessories: PlatformAccessory[] = [];
            const getControlAccessory = (
              name: string,
              suffix: string,
              category = this.api.hap.Categories.SWITCH,
            ) => {
              const controlUUID = this.api.hap.uuid.generate(
                `${device.sn}:${suffix}`,
              );
              let controlAccessory = this.accessories.find(
                cachedAccessory => cachedAccessory.UUID === controlUUID,
              );
              if (controlAccessory) {
                restoredControlAccessories.push(controlAccessory);
              } else {
                controlAccessory = new this.api.platformAccessory(
                  name,
                  controlUUID,
                );
                newControlAccessories.push(controlAccessory);
              }
              controlAccessory.context.parentSn = device.sn;
              controlAccessory.category = category;
              controlAccessory.getService(this.Service.AccessoryInformation)!
                .setCharacteristic(this.Characteristic.Manufacturer, device.brand)
                .setCharacteristic(this.Characteristic.Model, device.model)
                .setCharacteristic(
                  this.Characteristic.SerialNumber,
                  `${device.sn}:${suffix}`,
                );
              return controlAccessory;
            };
            const groupedControlsAccessory =
              this.config.exposeFanModeSwitches ||
              this.config.exposeFanPreferences
                ? getControlAccessory('Fan Controls', 'dreo-controls')
                : undefined;

            if (
              this.config.exposeFanModeSwitches &&
              (state.windtype !== undefined || state.mode !== undefined) &&
              groupedControlsAccessory
            ) {
              for (const control of FAN_MODE_CONTROLS) {
                controlAccessories.modes!.set(
                  control.value,
                  groupedControlsAccessory,
                );
              }
            }
            if (this.config.exposeFanPreferences) {
              if (
                state.ledalwayson !== undefined &&
                groupedControlsAccessory
              ) {
                controlAccessories.displayAutoOff = groupedControlsAccessory;
              }
              if (state.voiceon !== undefined && groupedControlsAccessory) {
                controlAccessories.panelSound = groupedControlsAccessory;
              }
            }
            if (
              !this.config.hideTemperatureSensor &&
              state.temperature !== undefined
            ) {
              controlAccessories.temperature = getControlAccessory(
                'Temperature',
                'dreo-temperature',
                this.api.hap.Categories.SENSOR,
              );
            }

            new FanAccessory(this, accessory, state, controlAccessories);
            if (newControlAccessories.length > 0) {
              this.api.registerPlatformAccessories(
                PLUGIN_NAME,
                PLATFORM_NAME,
                newControlAccessories,
              );
            }
            if (restoredControlAccessories.length > 0) {
              this.api.updatePlatformAccessories(restoredControlAccessories);
            }
          }
          break;

        case 'DR-HSH':
        case 'WH':
          // Heater
          accessory.category = this.api.hap.Categories.AIR_HEATER;
          new HeaterAccessory(this, accessory, state);
          break;

        case 'DR-HAC':
        case 'DR-HEC':
          // Air Conditioner / Hybrid Air Cooler / Hybrid Evaporative Cooler
          accessory.category = this.api.hap.Categories.AIR_CONDITIONER;
          new CoolerAccessory(this, accessory, state);
          break;

        case 'DR-HHM':
          // Humidifier
          accessory.category = this.api.hap.Categories.AIR_HUMIDIFIER;
          new HumidifierAccessory(this, accessory, state);
          break;

        case 'DR-HDM':
          // Dehumidifier
          accessory.category = this.api.hap.Categories.AIR_HUMIDIFIER;
          new DehumidifierAccessory(this, accessory, state);
          break;

        default:
          this.log.error('Error, unknown device type:', device.productName, device.model);
      }

      if (!existingAccessory && modelPrefix) {
        // Link accessory to the platform if model is supported
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      } else if (existingAccessory && modelPrefix) {
        // Persist services and optional characteristics added while restoring
        // an accessory, otherwise Homebridge can keep an outdated cache.
        this.api.updatePlatformAccessories([accessory]);
      }
    }
  }
}
