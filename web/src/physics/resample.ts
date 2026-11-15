// The same motion on a chain of another number of masses: the paper's
// refinement, in either direction and for any pair of numbers, while the
// chain moves. Ported from the sketch the first piece was chosen from.

/* eslint-disable @typescript-eslint/no-non-null-assertion --
   Every index here runs within arrays sized for it, which the compiler's
   unchecked-index rule cannot see. */

import { Chain } from "./chain.ts";
import { restingState, type ChainState } from "./step.ts";

/**
 * The chain as n equal masses on n equal rods, with the same total length and
 * mass, laid along the old one and moving with it.
 *
 * The new joints are placed along the old chain at equal steps of length, and
 * each new rod takes the direction and the turning rate of the chord between
 * two of them (a rigid rod's velocity is linear along it). When n is a
 * multiple of the old number, the old masses stay exactly where they are and
 * keep their velocities. The energy is not kept, because the mass now sits
 * elsewhere along the rods.
 */
export function resample(
  chain: Chain,
  state: ChainState,
  n: number,
): { chain: Chain; state: ChainState } {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(
      `a chain needs a whole number of masses, at least 1 (got ${String(n)})`,
    );
  }
  const old = chain.n;
  const lengths = chain.lengths;
  const { theta, omega } = state;
  // the old joints and their velocities, joint 0 being the pivot, and how far
  // along the chain each one is
  const px = new Float64Array(old + 1);
  const py = new Float64Array(old + 1);
  const vx = new Float64Array(old + 1);
  const vy = new Float64Array(old + 1);
  const along = new Float64Array(old + 1);
  for (let i = 0; i < old; i++) {
    const l = lengths[i]!;
    const s = Math.sin(theta[i]!);
    const c = Math.cos(theta[i]!);
    px[i + 1] = px[i]! + l * s;
    py[i + 1] = py[i]! - l * c;
    vx[i + 1] = vx[i]! + l * omega[i]! * c;
    vy[i + 1] = vy[i]! + l * omega[i]! * s;
    along[i + 1] = along[i]! + l;
  }

  const next = Chain.uniform(n, chain.totalLength, chain.totalMass);
  const out = restingState(n);
  let segment = 0;
  // the previous new joint, and its velocity
  let qx = 0;
  let qy = 0;
  let ux = 0;
  let uy = 0;
  for (let j = 0; j < n; j++) {
    const target =
      j + 1 === n ? along[old]! : ((j + 1) * chain.totalLength) / n;
    while (segment < old - 1 && along[segment + 1]! < target) segment++;
    const f = Math.min(
      1,
      Math.max(0, (target - along[segment]!) / lengths[segment]!),
    );
    const x = px[segment]! + f * (px[segment + 1]! - px[segment]!);
    const y = py[segment]! + f * (py[segment + 1]! - py[segment]!);
    const wx = vx[segment]! + f * (vx[segment + 1]! - vx[segment]!);
    const wy = vy[segment]! + f * (vy[segment + 1]! - vy[segment]!);
    const dx = x - qx;
    const dy = y - qy;
    const d2 = dx * dx + dy * dy;
    if (d2 > 0) {
      out.theta[j] = Math.atan2(dx, -dy);
      out.omega[j] = (dx * (wy - uy) - dy * (wx - ux)) / d2;
    } else {
      out.theta[j] = j > 0 ? out.theta[j - 1]! : 0;
      out.omega[j] = 0;
    }
    qx = x;
    qy = y;
    ux = wx;
    uy = wy;
  }
  return { chain: next, state: out };
}
