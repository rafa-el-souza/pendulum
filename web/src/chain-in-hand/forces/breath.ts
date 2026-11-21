import type { Heat } from "../../physics/drive.ts";
import {
  TAKE_HOLD,
  along,
  leaning,
  type ForceFrame,
  type MusicForce,
  type Part,
  type Reading,
} from "./common.ts";

// The breath (docs/decisions.md, decision 77): the thermostat of decision 74
// draws the chain's energy to the loudness, times the energy that lifts it
// level. It lets go while the visitor's hand holds, and a chain at rest is
// given a lean of gravity to set it going.

/**
 * The breath's thermostat (decision 74's): how fast it draws the energy to
 * its target, in 1/s, and the least energy it divides by, as a share of the
 * energy that lifts the hanging chain level.
 */
export const BREATH_GAIN = 3;
export const BREATH_FLOOR = 0.01;
/**
 * A chain hanging at rest has no motion for a drag to grow: while its energy
 * is under SEED_ENERGY of the one that lifts it level, the breath leans
 * gravity SEED_LEAN rad for a frame, too little to be seen, to set it going.
 */
export const SEED_LEAN = 0.01;
const SEED_ENERGY = 1e-9;
/** Earth's gravity, in m/s², which gives the breath its scale where there is none. */
const EARTH = 9.81;

/** The breath: how firmly it holds, and where its target energy got to. */
export class Breath implements MusicForce {
  // How firmly it holds, from 0 to 1; what its target energy came to at the
  // end of the frame run last, and the frame being run.
  #grip = 0;
  #aimed: number | null = null;
  #aiming: { span: number; from: number; to: number } | null = null;

  drag(): number {
    return 0;
  }

  frame(input: ForceFrame, reading: Reading): Part {
    const { heard, depth, times, down, side } = reading;
    const { g, chain } = input;
    const strength = Math.hypot(g.x, g.y);
    const lift = (strength > 0 ? strength : EARTH) * chain.hangingMoment;
    const to = depth * (heard.silent ? 0 : heard.level) * times * lift;
    const from = this.#aimed ?? to;
    this.#aiming = { span: input.span, from, to };
    if (input.held) {
      this.#grip = 0;
      return {};
    }
    this.#grip = Math.min(1, this.#grip + input.real / TAKE_HOLD);
    const heat: Heat = {
      target: [from, to],
      gain: BREATH_GAIN * this.#grip,
      floor: BREATH_FLOOR * lift,
    };
    const { theta, omega } = input.state;
    if (
      to > heat.floor &&
      chain.energyAboveRest(theta, omega, g) < SEED_ENERGY * lift
    ) {
      const seed = leaning(g, SEED_LEAN, down, side);
      return { heat, tilt: [seed, seed] };
    }
    return { heat };
  }

  ran(simulated: number): void {
    const aiming = this.#aiming;
    if (aiming !== null) {
      this.#aimed =
        aiming.from + (aiming.to - aiming.from) * along(simulated, aiming.span);
    }
    this.#aiming = null;
  }

  letGo(): void {
    this.#grip = 0;
  }
}
