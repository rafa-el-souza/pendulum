import { STRENGTHS, type Force } from "../core/routes.ts";
import type { Drive, Kick, MusicHand } from "../physics/drive.ts";
import { Breath } from "./forces/breath.ts";
import {
  NO_TILT,
  directions,
  ease,
  type ForceFrame,
  type Kicked,
  type MusicForce,
  type Part,
} from "./forces/common.ts";
import { Dance } from "./forces/dance.ts";
import { Speaker } from "./forces/speaker.ts";
import { Sway } from "./forces/sway.ts";
import { Tuned } from "./forces/tuned.ts";

// The music's forces on the first piece (docs/decisions.md, decisions 75, 77
// and 79), each the force of a mode of the music's group, beside its light,
// and each a class of its own in forces/ (decision 82): the speaker, whose
// kicks take the pivot aside and back; the dancing hand, which holds the tip
// and swings it to the other side on every kick; the breath, which draws the
// chain's energy to the loudness; the swaying gravity, which leans to the
// other side on every kick; and the tuned chain, whose gravity the beat clock
// sets for it to swing once a bar, pushed on the beats. They keep the music's
// pace, as its light does: a kick lasts as long on the clock at any speed of
// the piece, so that in slow motion the chain feels it shorter and sooner
// after the one before. No force acts without a source playing, and a paused
// piece takes none: then the physics is the paper's, without friction. The
// sizes and times are placeholders, from the probe of the music's physics,
// which the author settles by seeing.
//
// Here the force of the mode playing is put together with what outlasts it:
// the pivot's kicks, the piece's time they run on, and the drag, which eases
// from one force's to the next.

export type { ForceFrame } from "./forces/common.ts";

/** A kick is let go of this many of its decays after it began, fallen to under a millionth. */
const KICK_LIFE = 14;
/** The drag follows the force's over this long, in s. */
const DRAG_EASE = 0.3;

/** The force of a mode, begun afresh. */
function begin(kind: Force["kind"], slow: boolean): MusicForce {
  switch (kind) {
    case "speaker":
      return new Speaker(slow);
    case "dance":
      return new Dance(slow);
    case "breath":
      return new Breath();
    case "sway":
      return new Sway(slow);
    case "tuned":
      return new Tuned(slow);
  }
}

/** The music's forces, frame by frame: the command each frame puts into the physics (decision 74). */
export class MusicForces {
  readonly #slow: boolean;
  // the piece's time, summed over the frames run, in s, and the kicks still
  // moving the pivot, each from when it began on it
  #clock = 0;
  #kicks: Kicked[] = [];
  #drag = 0;
  // The kind of force of the frame before, and the force acting, which a
  // change of kind begins afresh.
  #was: Force["kind"] | undefined = undefined;
  #force: MusicForce | null = null;

  /** With reduced motion asked for (`slow`), the pivot kicks nothing and the hand crosses over a second. */
  constructor(options: { slow?: boolean } = {}) {
    this.#slow = options.slow ?? false;
  }

  /** Whether kicks are still moving the pivot. */
  get kicking(): boolean {
    return this.#kicks.length > 0;
  }

  /** What the music puts into the physics over the frame about to be run, or none. */
  frame(input: ForceFrame): Drive | null {
    const { heard, real, span } = input;
    const kind = heard === null ? undefined : input.force?.kind;
    if (kind !== this.#was) {
      this.#was = kind;
      this.#force = kind === undefined ? null : begin(kind, this.#slow);
    }
    const force = this.#force;

    // the drag follows the force's, heavier in the music's silence
    const dragFrom = this.#drag;
    if (force === null || heard === null) {
      this.#drag = 0;
    } else {
      this.#drag = ease(this.#drag, force.drag(heard.silent), real, DRAG_EASE);
    }

    let part: Part = {};
    if (force !== null && heard !== null) {
      const { down, side } = directions(input.g);
      const reading = {
        heard,
        depth: input.force?.depth ?? 0,
        times: STRENGTHS[input.strength - 1] ?? 1,
        down,
        side,
      };
      const pivot = {
        clock: this.#clock,
        kick: (kicked: Kicked) => {
          this.#kicks.push(kicked);
        },
      };
      part = force.frame(input, reading, pivot);
    }

    const hands: MusicHand[] = part.hand === undefined ? [] : [part.hand];
    const tilt = part.tilt ?? [NO_TILT, NO_TILT];
    const heat = part.heat ?? null;
    const kicks: Kick[] = this.#kicks.map((kick) => ({
      start: kick.at - this.#clock,
      x: kick.x,
      y: kick.y,
      attack: kick.attack,
      decay: kick.decay,
    }));
    if (
      kicks.length === 0 &&
      hands.length === 0 &&
      dragFrom === 0 &&
      this.#drag === 0 &&
      heat === null &&
      tilt[0] === NO_TILT &&
      tilt[1] === NO_TILT
    ) {
      return null;
    }
    return {
      span,
      tilt,
      kicks,
      hands,
      drag: [dragFrom, this.#drag],
      heat,
    };
  }

  /**
   * The frame was run for `simulated` s of the piece's time, its span or
   * less: the clock goes on, the kicks that have faded are let go, and the
   * force goes on from where the frame left it.
   */
  ran(simulated: number): void {
    this.#force?.ran(simulated);
    this.#clock += simulated;
    this.#kicks = this.#kicks.filter(
      (kick) => this.#clock - kick.at < KICK_LIFE * kick.decay,
    );
  }

  /** The hand, or the breath, lets go, to take hold again from where the hand's path is, over a second: as the chain starts again or changes. */
  letGo(): void {
    this.#force?.letGo();
  }
}
