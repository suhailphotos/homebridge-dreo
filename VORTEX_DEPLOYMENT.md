# Vortex clean deployment

This branch packages the DR-HTF017S compatibility fix as an installable
Homebridge plugin. It replaces the runtime scripts that modified
`FanAccessory.js` whenever the container started.

The package intentionally keeps the published plugin name,
`@simoore/homebridge-dreo-enhanced`, so the existing Homebridge child bridge
and cached accessories retain their identity. This local build must not be
published under the maintainer's npm scope.

## Build

```bash
npm ci
npm test
npm run lint
npm pack --pack-destination artifacts
```

The resulting package is:

```text
artifacts/simoore-homebridge-dreo-enhanced-5.1.4-vortex.5.tgz
```

## Homebridge configuration

Set the local package as the Homebridge dependency:

```json
"@simoore/homebridge-dreo-enhanced": "file:packages/simoore-homebridge-dreo-enhanced-5.1.4-vortex.5.tgz"
```

Enable the optional Apple Home switch while native `Fanv2.SwingMode` is not
rendered:

```json
"exposeOscillationSwitch": true
```

The switch uses the existing `dreo-oscillation` subtype, preserving the
service created by the former runtime patch.

Enable the optional controls that Apple Home does not represent as native fan
characteristics:

```json
"exposeFanModeSwitches": true,
"exposeFanPreferences": true
```

These expose the four Dreo modes plus Display Auto Off and Panel Sound as
standard, automatable HomeKit switches. They remain synchronized when settings
change in either Apple Home or the Dreo app.

## Rollback

Restore the saved `package.json`, `package-lock.json`, and `startup.sh`, then
restart the container. The backup created during deployment retains the
original npm dependency, all patch scripts, and the pre-migration installed
plugin.
