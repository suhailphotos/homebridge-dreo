const assert = require('assert');
const {
  getConfiguredMaxSpeed,
  getMaxFanSpeed,
  getModeCommand,
  getStateValue,
  getSwingCommand,
} = require('../dist/accessories/FanCapabilities');

const tests = [
  {
    name: 'uses capability metadata when it is available',
    run() {
      const device = {
        model: 'DR-HTF001S',
        controlsConf: {
          control: [
            {
              type: 'Speed',
              items: [{ text: '1' }, { text: '6' }],
            },
            {
              type: 'Oscillation',
              cmd: 'hoscon',
            },
          ],
        },
      };

      assert.strictEqual(getMaxFanSpeed(device), 6);
      assert.strictEqual(getSwingCommand(device, {}), 'hoscon');
    },
  },
  {
    name: 'uses the DR-HTF017S profile when controls are omitted',
    run() {
      const device = {
        model: 'DR-HTF017S',
        controlsConf: {},
      };

      assert.strictEqual(getMaxFanSpeed(device), 4);
      assert.strictEqual(
        getSwingCommand(device, {}),
        'shakehorizon',
      );
    },
  },
  {
    name: 'detects each known oscillation command from live state',
    run() {
      const device = { controlsConf: {} };

      assert.strictEqual(
        getSwingCommand(device, { shakehorizon: { state: false } }),
        'shakehorizon',
      );
      assert.strictEqual(
        getSwingCommand(device, { hoscon: { state: false } }),
        'hoscon',
      );
      assert.strictEqual(
        getSwingCommand(device, { oscmode: { state: 0 } }),
        'oscmode',
      );
    },
  },
  {
    name: 'detects fan mode command variants from live state',
    run() {
      assert.strictEqual(
        getModeCommand({ windtype: { state: 2 } }),
        'windtype',
      );
      assert.strictEqual(
        getModeCommand({ mode: { state: 4 } }),
        'mode',
      );
      assert.strictEqual(getModeCommand({}), undefined);
      assert.strictEqual(
        getStateValue({ windtype: { state: 3 } }, 'windtype'),
        3,
      );
    },
  },
  {
    name: 'handles malformed or missing capability metadata',
    run() {
      assert.strictEqual(
        getConfiguredMaxSpeed({ controlsConf: {} }, 4),
        4,
      );
      assert.strictEqual(
        getMaxFanSpeed({
          model: 'UNKNOWN',
          controlsConf: { control: 'invalid' },
        }),
        1,
      );
      assert.strictEqual(
        getSwingCommand({}, {}),
        undefined,
      );
    },
  },
];

for (const test of tests) {
  test.run();
  process.stdout.write(`✓ ${test.name}\n`);
}
