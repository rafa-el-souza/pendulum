import type { Mode } from "../core/routes.ts";

// The first piece's ways for the music to act (docs/decisions.md, decision
// 46): candidates, which the author settles by seeing and hearing them.

/**
 * Light only: the physics does not hear. A kick lights the chain's halo, the
 * loudness gives the trails strength, and every attack has a share of the
 * twins born again from the chain, a puff where they fade. The depths and
 * the times are the session's, placeholders.
 */
export const LIGHT: Mode = {
  id: "light",
  name: "light",
  routes: [
    { from: "kick", to: "glow", depth: 0.8, attack: 0.005, release: 0.25 },
    { from: "level", to: "trail", depth: 1, attack: 0.05, release: 0.4 },
    { from: "onset", to: "births", depth: 0.0625, attack: 0, release: 0 },
  ],
};

/** The music does nothing: the card only shows what the piece hears. */
export const NONE: Mode = { id: "none", name: "none", routes: [] };

/** The modes, the one the piece opens in first. */
export const MODES: readonly Mode[] = [LIGHT, NONE];

/** The mode with this id, or the first. */
export function modeOf(id: string): Mode {
  return MODES.find((mode) => mode.id === id) ?? LIGHT;
}
