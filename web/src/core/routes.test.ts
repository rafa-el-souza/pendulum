import { describe, expect, it } from "vitest";

import { QUIET, type Signals } from "../audio/signals.ts";
import {
  STRENGTHS,
  Router,
  readMusic,
  writeMusic,
  type Mode,
} from "./routes.ts";

// Routes from what the music says to what it lights (docs/decisions.md,
// decisions 46 and 49): each follows its signal with an attack and a release,
// at a depth, and the strength multiplies them all; a mode may colour the
// piece with the note the bass holds.

const heard = (over: Partial<Signals>): Signals => ({
  ...QUIET,
  silent: false,
  ...over,
});

const MODE: Mode = {
  id: "test",
  name: "test",
  routes: [
    { from: "kick", to: "glow", depth: 1, attack: 0, release: 0.25 },
    { from: "level", to: "trail", depth: 0.5, attack: 0.05, release: 0.4 },
    { from: "bass", to: "trail", depth: 0.25, attack: 0, release: 0 },
    { from: "onset", to: "births", depth: 0.125, attack: 0, release: 0 },
  ],
};
const MIDDLE = 3;
/** Nothing added, as a look reads where nothing is heard. */
const NOTHING = {
  glow: 0,
  trail: 0,
  births: 0,
  linger: 0,
  spread: 0,
  note: -1,
  tint: 0,
};

describe("Router", () => {
  it("takes a drum's hit, a note's beginning and the bass's change of note as it takes any attack (decision 48)", () => {
    const router = new Router({
      id: "events",
      name: "events",
      routes: [
        { from: "hit", to: "births", depth: 0.5, attack: 0, release: 0 },
        { from: "note", to: "glow", depth: 1, attack: 0, release: 0 },
        { from: "bassChange", to: "trail", depth: 0.25, attack: 0, release: 0 },
      ],
    });
    expect(
      router.look(heard({ hit: 1, note: 0.5, bassChange: 1 }), 1 / 60, MIDDLE),
    ).toMatchObject({ glow: 0.5, trail: 0.25, births: 0.5 });
    expect(router.look(heard({}), 1 / 60, MIDDLE)).toMatchObject({
      glow: 0,
      trail: 0,
      births: 0,
    });
  });

  it("counts a signal only above a route's floor, what is above stretched from 0 to 1 (decision 49)", () => {
    const router = new Router({
      id: "strong",
      name: "strong",
      routes: [
        {
          from: "kick",
          to: "births",
          depth: 0.125,
          attack: 0,
          release: 0,
          above: 0.75,
        },
      ],
    });
    expect(router.look(heard({ kick: 0.7 }), 1 / 60, MIDDLE).births).toBe(0);
    expect(
      router.look(heard({ kick: 0.875 }), 1 / 60, MIDDLE).births,
    ).toBeCloseTo(0.0625, 12);
    expect(router.look(heard({ kick: 1 }), 1 / 60, MIDDLE).births).toBeCloseTo(
      0.125,
      12,
    );
  });

  it("makes the trails last longer and the fan open wider by routes, as it lights them", () => {
    const router = new Router({
      id: "loud",
      name: "loud",
      routes: [
        { from: "level", to: "linger", depth: 2, attack: 0, release: 0 },
        { from: "level", to: "spread", depth: 1, attack: 0, release: 0 },
      ],
    });
    const look = router.look(heard({ level: 0.5 }), 1 / 60, MIDDLE);
    expect(look.linger).toBeCloseTo(1, 12);
    expect(look.spread).toBeCloseTo(0.5, 12);
  });

  it("tells the note the bass holds by its name, and brings its colour in while the bass plays and out in silence", () => {
    const router = new Router({
      id: "hue",
      name: "hue",
      routes: [],
      tint: { to: "chain", depth: 0.8 },
    });
    expect(router.look(heard({}), 1 / 60, MIDDLE)).toEqual(NOTHING);
    // the bass begins A1, MIDI 33, whose name is A, 9 from C
    let look = router.look(
      heard({ bassNote: 33.1, bassChange: 1 }),
      1 / 60,
      MIDDLE,
    );
    expect(look.note).toBe(9);
    for (let i = 0; i < 120; i++) {
      look = router.look(heard({ bassNote: 33 }), 1 / 60, MIDDLE);
    }
    expect(look.tint).toBeCloseTo(0.8, 2);
    // a frame without a note keeps it; another note held changes it
    expect(router.look(heard({}), 1 / 60, MIDDLE).note).toBe(9);
    expect(
      router.look(heard({ bassNote: 36, bassChange: 1 }), 1 / 60, MIDDLE).note,
    ).toBe(0);
    // in silence the colour goes, and the note stays for when it comes back
    for (let i = 0; i < 600; i++) look = router.look(null, 1 / 60, MIDDLE);
    expect(look.tint).toBeLessThan(0.01);
    expect(look.note).toBe(0);
    // the strength multiplies the colour, which goes no further than whole
    const strong = new Router(router.mode);
    for (let i = 0; i < 120; i++) {
      look = strong.look(heard({ bassNote: 33, bassChange: 1 }), 1 / 60, 5);
    }
    expect(look.tint).toBeCloseTo(1, 6);
  });

  it("gives no colour in a mode that has none", () => {
    const router = new Router(MODE);
    let look = router.look(heard({}), 1 / 60, MIDDLE);
    for (let i = 0; i < 120; i++) {
      look = router.look(heard({ bassNote: 33, bassChange: 1 }), 1 / 60, 5);
    }
    expect(look.tint).toBe(0);
  });

  it("follows a signal at once with no attack, and lets it go over its release", () => {
    const router = new Router(MODE);
    expect(router.look(heard({ kick: 1 }), 1 / 60, MIDDLE).glow).toBe(1);
    // a quarter of a second later the glow is down to 1/e
    let glow = 1;
    for (let i = 0; i < 15; i++) {
      glow = router.look(heard({}), 1 / 60, MIDDLE).glow;
    }
    expect(glow).toBeCloseTo(Math.exp(-1), 6);
  });

  it("rises over its attack", () => {
    const router = new Router(MODE);
    // the bass's own route has no release: it is 0 again at once
    const first = router.look(heard({ level: 1 }), 0.05, MIDDLE);
    expect(first.trail).toBeCloseTo(0.5 * (1 - Math.exp(-1)), 6);
  });

  it("adds the routes that reach one target, and the strength multiplies them", () => {
    const at = (strength: number) =>
      new Router(MODE).look(heard({ level: 1, bass: 1 }), 10, strength).trail;
    expect(at(MIDDLE)).toBeCloseTo(0.75, 6);
    STRENGTHS.forEach((times, i) => {
      expect(at(i + 1)).toBeCloseTo(0.75 * times, 6);
    });
    expect(STRENGTHS[MIDDLE - 1]).toBe(1);
  });

  it("gives births in the frame of an attack only", () => {
    const router = new Router(MODE);
    expect(router.look(heard({ onset: 0.8 }), 1 / 60, MIDDLE).births).toBe(0.1);
    expect(router.look(heard({}), 1 / 60, MIDDLE).births).toBe(0);
  });

  it("lets everything go when nothing is heard, as it does when the music falls silent", () => {
    const router = new Router(MODE);
    router.look(heard({ kick: 1, level: 1 }), 10, MIDDLE);
    const look = router.look(null, 10, MIDDLE);
    expect(look.glow).toBeLessThan(1e-9);
    expect(look.trail).toBeLessThan(1e-9);
    expect(look.births).toBe(0);
  });

  it("with reduced motion asked for, turns pulses into slow waves and gives no births", () => {
    const router = new Router(MODE, { slow: true });
    const first = router.look(heard({ kick: 1, onset: 1 }), 1 / 60, MIDDLE);
    expect(first.glow).toBeLessThan(0.1);
    expect(first.births).toBe(0);
  });
});

describe("the music in the address", () => {
  const modes = ["light", "none"];
  it("reads the mode and the strength, and anything else as the piece opens", () => {
    expect(readMusic(modes, "?n=8&music=none&strength=5")).toEqual({
      mode: "none",
      strength: 5,
    });
    expect(readMusic(modes, "?music=dance&strength=9")).toEqual({
      mode: "light",
      strength: MIDDLE,
    });
    expect(readMusic(modes, "")).toEqual({ mode: "light", strength: MIDDLE });
  });

  it("writes only what differs from how the piece opens, after whatever else the address carried", () => {
    expect(writeMusic(modes, "?n=8", "none", 4)).toBe(
      "?n=8&music=none&strength=4",
    );
    expect(writeMusic(modes, "?n=8&music=none&strength=4", "light", 3)).toBe(
      "?n=8",
    );
    expect(writeMusic(modes, "", "light", 3)).toBe("");
  });
});
