// The palettes (docs/decisions.md, decisions 23, 41 and 104): one list, from
// which the twins, the tension and the white's dots each take theirs. Each
// palette has seven colours, all different, in order, and is open, its ends
// apart, or closed, its last colour leading back to its first, so that a fan
// all the way round has no seam. The first is the sketch's ramp, which the
// author keeps, as the function it has always been. The others come from the
// light of physics, the colour maps of science, and art, nature and culture,
// each measured and looked at in the piece: the trails lift every colour
// towards white, so the colours sit bright and saturated. They go round the
// circle of hues, with those of many colours and the greys at the end. An
// address names a palette by its name.

import { parseColor, type Rgb } from "./color.ts";

export interface Palette {
  /** What a screen reader says for it; the address writes it with a hyphen for each space. */
  readonly name: string;
  /** Its seven colours, in order. */
  readonly colors: readonly Rgb[];
  /** Whether its last colour leads back to its first. */
  readonly closed: boolean;
  /** The colour at a place across the fan, from 0 to 1. */
  readonly color: (place: number) => Rgb;
}

/**
 * A ramp through `stops`, spaced evenly from 0 to 1 and mixed in a straight
 * line between neighbours; a closed one comes back to its first colour at 1.
 * A place outside 0 to 1 takes the colour at the nearer end.
 */
export function throughColors(
  stops: readonly Rgb[],
  closed = false,
): (place: number) => Rgb {
  if (stops.length < 2) throw new Error("a palette needs two colours or more");
  const round = closed ? [...stops, stops[0] ?? [0, 0, 0]] : stops;
  const last = round.length - 1;
  return (place) => {
    const at = Math.min(1, Math.max(0, place)) * last;
    const i = Math.min(last - 1, Math.floor(at));
    const share = at - i;
    const a = round[i] ?? [0, 0, 0];
    const b = round[i + 1] ?? a;
    return [
      a[0] + share * (b[0] - a[0]),
      a[1] + share * (b[1] - a[1]),
      a[2] + share * (b[2] - a[2]),
    ];
  };
}

/** The sketch's ramp: blue at 0, through violet, magenta and coral, to amber at 1. */
function dusk(place: number): Rgb {
  const t = 0.36 - 0.46 * place;
  return [
    0.5 + 0.5 * Math.cos(2 * Math.PI * t),
    0.5 + 0.5 * Math.cos(2 * Math.PI * (t + 0.33)),
    0.5 + 0.5 * Math.cos(2 * Math.PI * (t + 0.67)),
  ];
}

/** How many colours each palette has. */
export const COLOURS = 7;

/** An open palette through seven colours written as #rrggbb. */
function open(name: string, ...written: string[]): Palette {
  const colors = written.map(parseColor);
  return { name, colors, closed: false, color: throughColors(colors) };
}

/** A closed palette through seven colours written as #rrggbb, the last leading back to the first. */
function closed(name: string, ...written: string[]): Palette {
  const colors = written.map(parseColor);
  return { name, colors, closed: true, color: throughColors(colors, true) };
}

export const PALETTES: readonly Palette[] = [
  // the sketch's ramp, the function itself; its seven colours, for a use of
  // them one by one, are seven places evenly along it
  {
    name: "dusk",
    colors: Array.from({ length: COLOURS }, (_, k) => dusk(k / (COLOURS - 1))),
    closed: false,
    color: dusk,
  },
  // the tension's first scale (decision 35) on seven places: a push, a slack
  // rod, half a weight, then 2, 4, 8 and 16 weights; half a weight and 8
  // weights are the mixes the scale had there on the first ground
  open(
    "heat",
    "#9a66ff",
    "#4a8cff",
    "#a4bee8",
    "#ffc24d",
    "#ff8a26",
    "#ff6228",
    "#ff3b2b",
  ),
  // safflower (benibana) dyeing, deepest crimson to palest dip: traditional
  // Japanese colour names, values of nipponcolors.com via
  // github.com/xiaohk/nippon-colors (MIT), lightness evened and chroma raised
  open(
    "safflower",
    "#de1552",
    "#ee2454",
    "#f7316b",
    "#f84e7a",
    "#f86489",
    "#f97798",
    "#fa89a7",
  ),
  // a soap film's colours round one turn of Newton's second order: thin-film
  // interference under daylight (CIE D65, CIE 1931 2° observer), computed
  closed(
    "soap film",
    "#54c936",
    "#cca700",
    "#fd8266",
    "#ff66da",
    "#ca88ff",
    "#51b3ff",
    "#00c7a8",
  ),
  // salts in a burner flame (potassium, copper, barium, sodium, calcium,
  // strontium, lithium): their lines and bands as published, computed
  closed(
    "flame test",
    "#a871ff",
    "#7e9fff",
    "#00ec92",
    "#ffab64",
    "#fb7b00",
    "#ff4c3f",
    "#df002d",
  ),
  // orchid pink and leaf green across a dim middle: Fabio Crameri's
  // Scientific colour maps, vanimo (MIT), lightness and chroma raised
  open(
    "rainforest",
    "#fb97f9",
    "#f835d8",
    "#c22b8d",
    "#c23e18",
    "#82771a",
    "#79aa20",
    "#6ae611",
  ),
  // the orange-red lines a neon tube glows with: seven Ne I lines of the
  // NIST Atomic Spectra Database, computed
  open(
    "neon tube",
    "#dcb800",
    "#ff9d34",
    "#ff8d6b",
    "#ff776d",
    "#ff5a5f",
    "#ff2e4a",
    "#ec003c",
  ),
  // a black body heated from a dull red glow to blue-white, 1 000 to 12 000
  // K: Planck's law through the CIE 1931 2° observer, computed
  open(
    "black body",
    "#e43400",
    "#f46600",
    "#ff8f27",
    "#ffb165",
    "#ffcf9d",
    "#f1ddcf",
    "#d6e1ff",
  ),
  // decision 41's: deep red through orange to a golden yellow
  open(
    "fire",
    "#a8100a",
    "#d3280b",
    "#f0490f",
    "#ff7414",
    "#ff991b",
    "#ffbb2d",
    "#ffd84a",
  ),
  // oxygen's green aurora line at 110 km giving way to its red above 200 km:
  // the NIST O I lines and the layers' heights as published, computed
  open(
    "oxygen aurora",
    "#99fe00",
    "#deeb00",
    "#fccb00",
    "#fca600",
    "#fc7b00",
    "#ff5000",
    "#ff0031",
  ),
  // decision 41's bronze to pale gold, its lightness compressed and its
  // chroma raised, as the trails would otherwise wash it white
  open(
    "gold",
    "#b4631b",
    "#be731f",
    "#c7821f",
    "#d19122",
    "#d9a229",
    "#e0b22f",
    "#e3c232",
  ),
  // decision 41's: teal, a pale middle, coral
  open(
    "reef",
    "#19d3c5",
    "#62ded2",
    "#aae6dc",
    "#f2ede4",
    "#fbc49c",
    "#ff9964",
    "#ff6a3d",
  ),
  // Yellowstone's Grand Prismatic Spring, blue water ringed by green, yellow
  // and orange mats: NatParksPalettes by Kevin S. Blake (MIT), from a
  // photograph by Grant Ordelheide, lightness and chroma raised
  open(
    "hot spring",
    "#157abb",
    "#0099a2",
    "#4cb285",
    "#a0c167",
    "#eac65d",
    "#e49930",
    "#cc813e",
  ),
  // oxygen's 557.7 nm aurora line from a faint arc to a blazing storm, 1 to
  // 1 000 kilorayleighs, computed
  open(
    "green line",
    "#4d8600",
    "#599900",
    "#65ad00",
    "#71c000",
    "#7ed500",
    "#8ae900",
    "#97ff00",
  ),
  // one green from leaf shade to a lime glow: Peter Kovesi's CET map L5
  // (CC BY 4.0), as published
  open(
    "fern",
    "#1a7809",
    "#208f0b",
    "#26a70e",
    "#2cc011",
    "#32d913",
    "#5bf015",
    "#a2fb14",
  ),
  // the green lines of a copper arc and their blue and yellow neighbours:
  // seven Cu I lines of the NIST Atomic Spectra Database, computed
  open(
    "copper",
    "#5885ff",
    "#009fdd",
    "#00c2a1",
    "#00d68b",
    "#00e260",
    "#c1c600",
    "#e3b400",
  ),
  // deep teal to bright aqua green: cmocean's tempo by Kristen Thyng and
  // others (MIT), lightness and chroma raised
  open(
    "lagoon",
    "#118eab",
    "#0ca1a9",
    "#0cb3a7",
    "#1cc4a1",
    "#31d595",
    "#40e381",
    "#49f05f",
  ),
  // the turquoise of a Moche ear ornament (The Met 66.196.41): MetBrewer's
  // Peru1 by Blake R. Mills (CC0), its three turquoises evened into seven
  open(
    "turquoise",
    "#15a481",
    "#14b194",
    "#18bea9",
    "#20cbbd",
    "#3fd0d7",
    "#63d3ee",
    "#86d6ff",
  ),
  // the crystal jelly's light, aequorin's blue handing its energy to the
  // green fluorescent protein, computed from their bands as published
  open(
    "jellyfish",
    "#0092c6",
    "#00a3d1",
    "#00b5d9",
    "#00c9da",
    "#00dcd1",
    "#00eac0",
    "#00f6a6",
  ),
  // a ray of aurora from its green foot to its violet top, where sunlight
  // makes N2+ glow, computed
  open(
    "sunlit aurora",
    "#93f700",
    "#46de32",
    "#39cb81",
    "#3ab7b9",
    "#3ca3f1",
    "#7d80fc",
    "#904fff",
  ),
  // Japanese indigo dyeing, the pale first dip down to the deepest blue and
  // back through the vat's teal: values of nipponcolors.com via
  // github.com/xiaohk/nippon-colors (MIT), lightness and chroma raised
  closed(
    "indigo",
    "#83ebf5",
    "#3fc9f5",
    "#1ca1f0",
    "#1182d7",
    "#248091",
    "#2ea1b3",
    "#48c7da",
  ),
  // daylight sinking through clear water, the shallows to eighty metres:
  // Pope and Fry's absorption of pure water (1997) under CIE D65, computed
  open(
    "deep water",
    "#39dbf3",
    "#33c8df",
    "#1db5d2",
    "#00a3ce",
    "#0091d5",
    "#0081e4",
    "#0071f9",
  ),
  // the blue lines of a xenon flash tube: seven Xe I lines of the NIST
  // Atomic Spectra Database, computed
  open(
    "xenon",
    "#6b7cff",
    "#478aff",
    "#0096f6",
    "#00a0db",
    "#00aac3",
    "#00b7af",
    "#00c3a0",
  ),
  // deep cobalt through azure to cyan: Peter Kovesi's CET map L6 (CC BY
  // 4.0), as published
  open(
    "cobalt",
    "#3046ff",
    "#2e68fc",
    "#2783f6",
    "#239bef",
    "#07b2e7",
    "#1fc7e0",
    "#39dede",
  ),
  // slate blue into lavender: Fabio Crameri's Scientific colour maps, devon
  // (MIT), chroma raised and the pale end cut
  open(
    "periwinkle",
    "#1767c1",
    "#1668e2",
    "#406cf2",
    "#6873f6",
    "#877bf6",
    "#9b8af7",
    "#ab9bf9",
  ),
  // a glowing gas cloud from its oxygen-teal heart to its hydrogen-pink
  // outskirts: [O III] and the Balmer lines in their published ratios,
  // computed
  open(
    "nebula",
    "#00c6b0",
    "#00bfdb",
    "#58b3f8",
    "#96a3fa",
    "#bd91fc",
    "#dc7bff",
    "#f563ff",
  ),
  // Werner's purples named for fluor spar and amethyst: Werner's
  // Nomenclature of Colours (1821) via github.com/meodai/color-name-lists
  // (MIT), lightness and chroma raised and the top cut
  open(
    "amethyst",
    "#6b50f4",
    "#8655f5",
    "#9a64f6",
    "#ab74f7",
    "#c477f8",
    "#e06ff8",
    "#f961f8",
  ),
  // electric violet through magenta to pale pink: Peter Kovesi's CET map
  // linear_bmw_5_95_c89 (CC BY 4.0), as published
  open(
    "orchid",
    "#561fff",
    "#8a1eff",
    "#bc1eff",
    "#ea38ff",
    "#ff6fff",
    "#ff9fff",
    "#ffc8ff",
  ),
  // dusky purple to rose and blush: Fabio Crameri's Scientific colour maps,
  // acton (MIT), lightness compressed and chroma raised
  open(
    "heather",
    "#7325f3",
    "#9a27db",
    "#bb28bc",
    "#dd27a1",
    "#f64bab",
    "#fa7acd",
    "#f89efa",
  ),
  // every hue at one lightness, round the circle: cmocean's phase by Kristen
  // Thyng and others (MIT), chroma raised
  closed(
    "compass",
    "#a8780d",
    "#da474a",
    "#de23a6",
    "#b44bf1",
    "#637deb",
    "#1a94a3",
    "#3a9933",
  ),
  // the spectrum's ends joined through the purples no single wavelength
  // makes: 450 to 630 nm and the line of purples, computed
  closed(
    "spectrum",
    "#7874ff",
    "#00a8c7",
    "#00db82",
    "#a3d100",
    "#ff9a49",
    "#ff5a9c",
    "#e920ff",
  ),
  // a film thickening through Newton's first order, grey-white, straw,
  // orange, red, the first purple: thin-film interference, computed
  open(
    "first order",
    "#c8e1ff",
    "#8dd1bc",
    "#c4b46b",
    "#d47c00",
    "#ef407b",
    "#d500e5",
    "#7f5bff",
  ),
  // Klimt's Mäda Primavesi (The Met 64.148), rose, gold, leaf, blue and
  // violet: MetBrewer's Klimt by Blake R. Mills (CC0), in hue order and
  // closed
  closed(
    "garden",
    "#f7576e",
    "#fea021",
    "#a2c75c",
    "#00adad",
    "#4e7ce7",
    "#c151e0",
    "#f094e4",
  ),
  // gold and coral sinking through violet into evening blue: Fabio Crameri's
  // Scientific colour maps, managua (MIT), lightness and chroma raised
  open(
    "afterglow",
    "#ffc42e",
    "#ea8b48",
    "#d24e4f",
    "#a64798",
    "#7a6dc8",
    "#77a7e0",
    "#5ae2ff",
  ),
  // Edo's "forty-eight browns, a hundred greys", greys tinted round the
  // wheel: values of nipponcolors.com via github.com/xiaohk/nippon-colors
  // (MIT), the tints raised so that they show in the trails
  closed(
    "hundred greys",
    "#f9c1bd",
    "#c2af81",
    "#8ba981",
    "#7fbec5",
    "#afd6fa",
    "#8f95c1",
    "#c69cba",
  ),
  // decision 23's: no colour, only light, its dark end lifted
  open(
    "silver",
    "#7f7f7f",
    "#949494",
    "#aaaaaa",
    "#bfbfbf",
    "#d4d4d4",
    "#eaeaea",
    "#ffffff",
  ),
];

/** The palette at `index` in PALETTES; any other index throws. */
export function paletteAt(index: number): Palette {
  const palette = Number.isInteger(index) ? PALETTES[index] : undefined;
  if (palette === undefined) {
    throw new Error(`there is no palette ${String(index)}`);
  }
  return palette;
}

/** The place in PALETTES of the palette named `name`; throws when there is none. */
export function paletteNamed(name: string): number {
  const index = PALETTES.findIndex((palette) => palette.name === name);
  if (index < 0) throw new Error(`there is no palette ${JSON.stringify(name)}`);
  return index;
}

/**
 * The colour of a note, by its name from 0 for C to 11 for B (decision 49):
 * the notes go round the wheel of hues by fifths, C, G, D, A and on, so that
 * notes a fifth apart are neighbours and those of one key lie together. Each
 * is bright, at seven tenths of full saturation.
 */
export function noteColor(name: number): Rgb {
  const fifths = (((7 * Math.round(name)) % 12) + 12) % 12;
  const hue = (fifths / 12) * 6;
  const saturation = 0.7;
  const channel = (n: number): number => {
    const k = (n + hue) % 6;
    return 1 - saturation * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [channel(5), channel(3), channel(1)];
}
