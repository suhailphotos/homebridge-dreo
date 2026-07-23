interface FanControl {
  type?: string;
  cmd?: string;
  items?: Array<{ text?: string | number }>;
}

interface FanDevice {
  model?: string;
  controlsConf?: {
    control?: unknown;
  };
}

interface FanStateValue {
  state?: unknown;
}

type FanState = Record<string, FanStateValue | undefined>;

interface FanProfile {
  maxSpeed: number;
  swingCommand?: string;
}

const FAN_PROFILES: Record<string, FanProfile> = {
  'DR-HTF017S': {
    maxSpeed: 4,
    swingCommand: 'shakehorizon',
  },
};

function getControls(device: FanDevice): FanControl[] {
  const controls = device.controlsConf?.control;
  return Array.isArray(controls) ? controls : [];
}

export function getConfiguredMaxSpeed(
  device: FanDevice,
  fallback: number,
): number {
  const speedControl = getControls(device).find(
    (control) => control?.type === 'Speed',
  );
  const configuredMaxSpeed = Number(speedControl?.items?.[1]?.text);

  if (Number.isFinite(configuredMaxSpeed) && configuredMaxSpeed > 0) {
    return configuredMaxSpeed;
  }

  return fallback;
}

export function getMaxFanSpeed(device: FanDevice): number {
  const profileMaxSpeed = FAN_PROFILES[device.model || '']?.maxSpeed || 1;
  return getConfiguredMaxSpeed(device, profileMaxSpeed);
}

export function getSwingCommand(
  device: FanDevice,
  state: FanState,
): string | undefined {
  const configuredCommand = getControls(device).find(
    (control) => control?.type === 'Oscillation',
  )?.cmd;

  if (configuredCommand) {
    return configuredCommand;
  }

  const stateCommand = ['shakehorizon', 'hoscon', 'oscmode'].find(
    (command) => state[command] !== undefined,
  );

  return stateCommand || FAN_PROFILES[device.model || '']?.swingCommand;
}

export function getModeCommand(state: FanState): string | undefined {
  return ['windtype', 'mode'].find((command) => state[command] !== undefined);
}

export function getStateValue(
  state: FanState,
  command: string,
): unknown {
  return state[command]?.state;
}
