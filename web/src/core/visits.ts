// Counting the site's visits (docs/decisions.md, decision 84), with Cloudflare
// Web Analytics, which keeps no cookie: how many came, from where, on which
// device and browser, and how soon the page answered a touch. Only the
// published site counts, in a browser that no program drives, so the browser
// tests and the README's pictures are not counted; and a device stops being
// counted with ?count=0 in the address, and counts again with ?count=1. The
// switch leaves the address as soon as the page opens, so that a shared
// address never carries it, and it is the one thing the site keeps on a
// device, only where it was used.
//
// The script reports the page once, after it loads, and its timings when the
// page is first hidden. It can also count each change of the address as a
// page, as it counts the pages of a single-page application; here the address
// changes with every setting, so that is off (spa=false).

/** The one host whose visits are counted. */
export const COUNTED_HOST = "pendulum.rafasouza.dev.br";
/** The site's token at Cloudflare Web Analytics: public, as every page carries it. */
const TOKEN = "";
/** The address's switch: 0 stops counting the device, 1 counts it again. */
const SWITCH = "count";
/** Where a device keeps that it is not counted. */
const KEPT = "pendulum-count";

/** What the address's switch asks: to stop counting the device, to count it again, or nothing. */
export type CountSwitch = "off" | "on" | null;

/** The parts of an address's query, as written, each with its name. */
function parts(search: string): { part: string; name: string }[] {
  return search
    .replace(/^\?/, "")
    .split("&")
    .filter((part) => part !== "")
    .map((part) => ({ part, name: part.split("=")[0] ?? "" }));
}

/** What the address's switch asks; the first of it written counts, as with every name. */
export function readCountSwitch(search: string): CountSwitch {
  const first = parts(search).find(({ name }) => name === SWITCH);
  if (first === undefined) return null;
  const value = first.part.slice(SWITCH.length + 1);
  return value === "0" ? "off" : value === "1" ? "on" : null;
}

/** The address's query without the switch, the rest as it was written. */
export function withoutCountSwitch(search: string): string {
  const rest = parts(search).filter(({ name }) => name !== SWITCH);
  return rest.length === 0 ? "" : `?${rest.map(({ part }) => part).join("&")}`;
}

/** Whether a visit is counted: on the published site, in a browser no program drives, on a device that has not turned counting off. */
export function counted(host: string, driven: boolean, off: boolean): boolean {
  return host === COUNTED_HOST && !driven && !off;
}

/** The script that counts, with the site's token, the address's changes not counted as pages. */
export function counterSource(token = TOKEN): string {
  const query = new URLSearchParams({ token, spa: "false" });
  return `https://static.cloudflareinsights.com/beacon.min.js?${query.toString()}`;
}

/** Whether this device stopped being counted, where storage refuses, for this page only. */
let offHere = false;

/** Keeps what the switch asked on the device, or for this page where storage is refused. */
function keep(asked: "off" | "on"): void {
  offHere = asked === "off";
  try {
    if (asked === "off") localStorage.setItem(KEPT, "0");
    else localStorage.removeItem(KEPT);
  } catch {
    // a private window, or a browser that keeps nothing: offHere holds it
  }
}

/** Whether the device stopped being counted. */
function isOff(): boolean {
  try {
    return offHere || localStorage.getItem(KEPT) === "0";
  } catch {
    return offHere;
  }
}

/** What the QR code's card says of counting: that visits are counted, or that this device is not. */
export function countNote(): string {
  return isOff()
    ? "This device is not counted."
    : "Visits are counted without cookies.";
}

/**
 * Takes the address's switch, keeping what it asks and taking it out of the
 * address, then has the visit counted if it counts.
 */
export function countVisit(): void {
  const asked = readCountSwitch(location.search);
  if (asked !== null) {
    keep(asked);
    history.replaceState(
      history.state,
      "",
      `${location.pathname}${withoutCountSwitch(location.search)}${location.hash}`,
    );
  }
  if (!counted(location.hostname, navigator.webdriver, isOff())) return;
  const script = document.createElement("script");
  script.src = counterSource();
  script.defer = true;
  document.head.append(script);
}
