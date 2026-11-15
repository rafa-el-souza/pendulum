import "../styles/base.css";

import { cls } from "../core/css.ts";
import { PIECES, pieceHref } from "../pieces.ts";
import styles from "./home.module.css";

const home = document.getElementById("home");
if (home === null) {
  throw new Error("index.html has no #home element");
}
home.className = cls(styles, "home");

const heading = document.createElement("h1");
heading.textContent = "Pendulum";

const lead = document.createElement("p");
lead.className = cls(styles, "lead");
lead.textContent =
  "Interactive pieces built on one physics paper, checked equation by equation.";

const list = document.createElement("ul");
list.className = cls(styles, "pieces");
for (const piece of PIECES) {
  const item = document.createElement("li");
  item.className = cls(styles, "piece");
  const link = document.createElement("a");
  link.href = pieceHref(piece);
  link.textContent = piece.title;
  const summary = document.createElement("p");
  summary.textContent = piece.summary;
  item.append(link, summary);
  list.append(item);
}

home.append(heading, lead, list);
