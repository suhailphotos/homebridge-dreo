const assert = require('assert');
const configSchema = require('../config.schema.json');
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
assert.strictEqual(
  PLUGIN_NAME,
  '@simoore/homebridge-dreo-enhanced',
);

process.stdout.write(
  '✓ keeps advanced fan controls opt-in and registered to the scoped plugin\n',
);
