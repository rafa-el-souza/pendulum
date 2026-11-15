import "../styles/base.css";

import { mountStage } from "../core/stage.ts";

// The first piece (docs/decisions.md, decision 4). For now its page only sets
// up the stage it will draw on.
const canvas = document.getElementById("stage");
const notice = document.getElementById("notice");
if (!(canvas instanceof HTMLCanvasElement) || notice === null) {
  throw new Error("the page lacks its #stage canvas or its #notice");
}
mountStage(canvas, notice);
