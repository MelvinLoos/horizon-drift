/** Keyboard bindings. Pure data, keyed by `KeyboardEvent.code`. */

export type DriveAction = 'throttle' | 'brake' | 'left' | 'right';
export type Command = 'cruise' | 'radioNext' | 'biome' | 'camera' | 'headlights' | 'zen';

export const DRIVE_KEYS: Readonly<Record<string, DriveAction>> = {
  KeyW: 'throttle',
  ArrowUp: 'throttle',
  KeyS: 'brake',
  ArrowDown: 'brake',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

export const COMMAND_KEYS: Readonly<Record<string, Command>> = {
  KeyC: 'cruise',
  KeyR: 'radioNext',
  KeyB: 'biome',
  KeyV: 'camera',
  KeyL: 'headlights',
  KeyH: 'zen',
};
