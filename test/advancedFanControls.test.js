const assert = require('assert');
const configSchema = require('../config.schema.json');
const { FAN_MODE_CONTROLS } = require('../dist/platform');
const { PLUGIN_NAME } = require('../dist/settings');

const advancedControls =
  configSchema.schema.properties.exposeAdvancedFanControls;
const additionalControlsFieldset = configSchema.form.find(
  item => item.title === 'Additional Fan Controls',
);

assert.strictEqual(advancedControls.type, 'boolean');
assert.strictEqual(advancedControls.default, false);
assert.ok(
  additionalControlsFieldset.items.includes('exposeAdvancedFanControls'),
);
assert.deepStrictEqual(
  FAN_MODE_CONTROLS.map(({ value, name }) => ({ value, name })),
  [
    { value: 2, name: 'Natural Breeze' },
    { value: 3, name: 'Sleep Mode' },
  ],
);
assert.strictEqual(
  PLUGIN_NAME,
  '@simoore/homebridge-dreo-enhanced',
);

process.stdout.write(
  '✓ exposes only non-native fan modes behind the advanced opt-in\n',
);
