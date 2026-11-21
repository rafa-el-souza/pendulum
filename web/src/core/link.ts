// The page's address, shared and shown as a QR code (docs/decisions.md,
// decision 40). Sharing hands the address and the title to the device's own
// sheet where there is one, as on a phone, and copies the address where
// there is none, saying so a moment. The card shows the address as a QR code
// in the middle of the screen, to open it on a phone, with the title under
// it; an address longer than a code holds says so instead. The code's module
// loads only when a card first asks for it. Under the title, faint, the card
// says that visits are counted, or that this device is not (decision 84).

import { cls } from "./css.ts";
import styles from "./link.module.css";
import { countNote } from "./visits.ts";

const SVG = "http://www.w3.org/2000/svg";
/** How long the word that a link was copied stays, in ms. */
const SAID_MS = 2000;
/** The most letters a QR code holds, at the error correction the codes use (qr.ts). */
const QR_MOST = 2953;

/** A count with its thousands set apart by a space that does not break, as the site writes them. */
function grouped(count: number): string {
  return String(count).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
}

/** What sharing did. */
export type Shared = "shared" | "copied" | "cancelled" | "failed";

/**
 * Hands the address to the device's sheet for sharing where there is one;
 * where there is none, or it refuses, copies it.
 */
export async function shareLink(url: string, title: string): Promise<Shared> {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title, url });
      return "shared";
    } catch (error) {
      // the visitor shut the sheet; any other refusal copies instead
      if (error instanceof DOMException && error.name === "AbortError") {
        return "cancelled";
      }
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}

export interface LinkCard {
  /** Whether the card is open. */
  isOpen(): boolean;
  /** Opens the card with the code of `url`, or shuts it. */
  toggle(url: string, title: string): void;
  /** Draws the card again for `url`, if it is open. */
  update(url: string, title: string): void;
  /** Says a moment, in words, what sharing did. */
  say(text: string): void;
}

export function mountLinkCard(colors: {
  dark: string;
  light: string;
}): LinkCard {
  const card = document.createElement("div");
  card.className = cls(styles, "card");
  card.id = "link-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", "This page's address as a QR code");
  card.hidden = true;

  const code = document.createElementNS(SVG, "svg");
  code.classList.add(cls(styles, "code"));
  code.setAttribute("role", "img");
  code.setAttribute("aria-label", "QR code of this page's address");
  const title = document.createElement("p");
  title.className = cls(styles, "title");
  const note = document.createElement("p");
  note.className = cls(styles, "note");
  note.textContent = countNote();
  const close = document.createElement("button");
  close.type = "button";
  close.className = cls(styles, "close");
  close.textContent = "×";
  close.setAttribute("aria-label", "Close");
  close.addEventListener("click", () => {
    shut();
  });
  card.append(code, title, note, close);

  const said = document.createElement("p");
  said.className = cls(styles, "said");
  said.setAttribute("role", "status");
  said.hidden = true;
  document.body.append(card, said);

  // Escape shuts the card before anything else hears it.
  addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || card.hidden) return;
      event.stopImmediatePropagation();
      shut();
    },
    { capture: true },
  );

  // the latest drawing asked for, so that an older one that loads later is dropped
  let drawing = 0;
  async function draw(url: string, words: string): Promise<void> {
    const mine = ++drawing;
    const { qrModules, qrPath } = await import("./qr.ts");
    if (mine !== drawing) return;
    const modules = qrModules(url);
    if (modules === null) {
      code.replaceChildren();
      code.style.display = "none";
      title.textContent = `This address is too long for a QR code: ${grouped(url.length)} letters, where a code holds ${grouped(QR_MOST)}. With fewer masses it is shorter.`;
      return;
    }
    const size = modules.length;
    code.style.display = "";
    code.setAttribute("viewBox", `0 0 ${String(size)} ${String(size)}`);
    code.setAttribute("shape-rendering", "crispEdges");
    const ground = document.createElementNS(SVG, "rect");
    ground.setAttribute("width", String(size));
    ground.setAttribute("height", String(size));
    ground.setAttribute("fill", colors.light);
    const dark = document.createElementNS(SVG, "path");
    dark.setAttribute("d", qrPath(modules));
    dark.setAttribute("fill", colors.dark);
    code.replaceChildren(ground, dark);
    card.dataset.address = url;
    title.textContent = words;
  }

  function shut(): void {
    card.hidden = true;
    drawing++;
  }

  let sayTimer = 0;
  return {
    isOpen: () => !card.hidden,
    toggle(url, words) {
      if (!card.hidden) {
        shut();
        return;
      }
      card.hidden = false;
      void draw(url, words);
    },
    update(url, words) {
      if (!card.hidden) void draw(url, words);
    },
    say(text) {
      said.textContent = text;
      said.hidden = false;
      clearTimeout(sayTimer);
      sayTimer = window.setTimeout(() => {
        said.hidden = true;
      }, SAID_MS);
    },
  };
}
