import type { Mode, Route } from "../core/routes.ts";

// The first piece's ways for the music to act (docs/decisions.md, decisions
// 46 and 49): candidates, which the author settles by seeing and hearing
// them. "light" is the first; each of the others changes one thing of it,
// so that they can be told apart side by side. In every one, where the
// trails are a strobe's, a kick flashes it (decision 50).

/** A kick lights the chain's halo. */
const HALO: Route = {
  from: "kick",
  to: "glow",
  depth: 0.8,
  attack: 0.005,
  release: 0.25,
};
/** The loudness gives the trails strength. */
const BRIGHTER: Route = {
  from: "level",
  to: "trail",
  depth: 1,
  attack: 0.05,
  release: 0.4,
};
/** Every attack has a sixteenth of the twins born again from the chain. */
const ON_ATTACKS: Route = {
  from: "onset",
  to: "births",
  depth: 0.0625,
  attack: 0,
  release: 0,
};
/** A kick flashes the strobe, where the trails are a strobe's. */
const FLASH: Route = {
  from: "kick",
  to: "flash",
  depth: 1,
  attack: 0,
  release: 0,
};

/**
 * Light only: the physics does not hear. A kick lights the chain's halo, the
 * loudness gives the trails strength, and every attack has a share of the
 * twins born again from the chain, a puff where they fade. The depths and
 * the times are the session's, placeholders.
 */
export const LIGHT: Mode = {
  id: "light",
  name: "light",
  routes: [HALO, BRIGHTER, ON_ATTACKS, FLASH],
};

/** As light, with a halo three times as strong on the kicks, and a little slower to go. */
export const GLOW: Mode = {
  id: "glow",
  name: "glow",
  routes: [{ ...HALO, depth: 2.4, release: 0.35 }, BRIGHTER, ON_ATTACKS, FLASH],
};

/** As light, with the twins born again on the hits of drums only, not on notes. */
export const HITS: Mode = {
  id: "hits",
  name: "hits",
  routes: [HALO, BRIGHTER, { ...ON_ATTACKS, from: "hit" }, FLASH],
};

/** As light, with an eighth of the twins born again on the strongest kicks only. */
export const KICKS: Mode = {
  id: "kicks",
  name: "kicks",
  routes: [
    HALO,
    BRIGHTER,
    { ...ON_ATTACKS, from: "kick", depth: 0.125, above: 0.75 },
    FLASH,
  ],
};

/**
 * As light, with the trails lasting longer, instead of brighter, the louder
 * the music is than its middle: up to four times as long.
 */
export const LINGER: Mode = {
  id: "linger",
  name: "linger",
  routes: [
    HALO,
    {
      from: "level",
      to: "linger",
      depth: 3,
      attack: 0.1,
      release: 0.6,
      above: 0.5,
    },
    ON_ATTACKS,
    FLASH,
  ],
};

/**
 * As light, with the trails brighter on the kicks instead of with the
 * loudness, which moves them little: each kick leaves a brighter stretch.
 */
export const DASHES: Mode = {
  id: "dashes",
  name: "dashes",
  routes: [
    HALO,
    { from: "kick", to: "trail", depth: 2, attack: 0.005, release: 0.12 },
    ON_ATTACKS,
    FLASH,
  ],
};

/**
 * As light, with the fan opening wider for the twins born again the louder
 * the music is than its middle: up to a hundred times as wide.
 */
export const FAN: Mode = {
  id: "fan",
  name: "fan",
  routes: [
    HALO,
    BRIGHTER,
    ON_ATTACKS,
    {
      from: "level",
      to: "spread",
      depth: 2,
      attack: 0.05,
      release: 0.4,
      above: 0.5,
    },
    FLASH,
  ],
};

/** As light, with the note the bass holds colouring the chain and its halo. */
export const HUE: Mode = {
  id: "hue",
  name: "hue",
  routes: LIGHT.routes,
  tint: { to: "chain", depth: 0.8 },
};

/** As light, with the note the bass holds colouring the twins. */
export const TWIN_HUE: Mode = {
  id: "twinhue",
  name: "twin hue",
  routes: LIGHT.routes,
  tint: { to: "twins", depth: 0.8 },
};

/** The music does nothing: the card only shows what the piece hears. */
export const NONE: Mode = { id: "none", name: "none", routes: [] };

/** The modes, the one the piece opens in first. */
export const MODES: readonly Mode[] = [
  LIGHT,
  GLOW,
  HITS,
  KICKS,
  LINGER,
  DASHES,
  FAN,
  HUE,
  TWIN_HUE,
  NONE,
];

/** The mode with this id, or the first. */
export function modeOf(id: string): Mode {
  return MODES.find((mode) => mode.id === id) ?? LIGHT;
}
