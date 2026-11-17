// A worker that carries a share of the twins (docs/decisions.md, decision
// 51): told first which share it is, then a command a frame, each answered
// with a report whose buffers are handed over to the page, not copied.

import { TwinShare, type TwinCommand } from "./twin-share.ts";
import type { TwinSetup } from "./twin-workers.ts";

let share: TwinShare | null = null;

addEventListener("message", (event: MessageEvent<TwinSetup | TwinCommand>) => {
  const message = event.data;
  if ("index" in message) {
    share = new TwinShare(message.index, message.shares, message.n);
    return;
  }
  if (share === null) throw new Error("a command came before the setup");
  const report = share.run(message);
  postMessage(report, {
    transfer: [
      report.positions.buffer,
      report.tips.buffer,
      report.apart.buffer,
    ],
  });
});
