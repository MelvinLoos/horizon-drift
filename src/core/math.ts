/** Small numeric helpers. Pure; operation order matches the prototype so results stay bit-identical. */

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Clamps to [0, 1]. */
export function saturate(value: number): number {
  return clamp(value, 0, 1);
}

/** Hermite smoothstep of an already normalised `t` in [0, 1]: 3t² − 2t³. */
export function smoothstep01(t: number): number {
  return t * t * (3.0 - 2.0 * t);
}
