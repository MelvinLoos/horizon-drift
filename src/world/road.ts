/**
 * The endless road as pure functions of z (the player drives towards −z). Several sine waves
 * with incommensurate frequencies make the curve and grade meander without visibly repeating.
 */

/** Lateral position of the road centre at `z`. */
export function roadX(z: number): number {
  return Math.sin(z * 0.0018) * 68 + Math.cos(z * 0.00062) * 115 + Math.sin(z * 0.00023) * 160;
}

/** Height of the road surface at `z`: a slow macro elevation plus a rolling grade. */
export function roadY(z: number): number {
  const macroElevation = Math.sin(z * 0.00045) * 32.0;
  const rollingGrade = Math.sin(z * 0.0024) * 9.0 + Math.cos(z * 0.0011) * 13.5;
  return macroElevation + rollingGrade;
}

/** Lateral drift of the road per metre driven forward (towards −z); central difference. */
export function roadDerivativeX(z: number): number {
  const dz = 0.5;
  return (roadX(z - dz) - roadX(z + dz)) / (2 * dz);
}
