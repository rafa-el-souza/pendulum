// A worker that carries a share of the twins (docs/decisions.md, decision
// 51): told first which share it is, then a command a frame, each answered
// with a report whose buffers are handed over to the page, not copied; the
// page hands them back with a later command, once it has done with them,
// for the share to fill again (decision 103).

import {
  TwinShare,
  reportBuffers,
  type TwinCommand,
  type TwinReport,
} from "./twin-share.ts";
import type { TwinSetup } from "./twin-workers.ts";

/** The worker's own way back to the page, which hands buffers over; the page's types know only a window's. */
const scope = self as unknown as {
  postMessage(report: TwinReport, transfer: Transferable[]): void;
};

let share: TwinShare | null = null;

addEventListener("message", (event: MessageEvent<TwinSetup | TwinCommand>) => {
  const message = event.data;
  if ("index" in message) {
    share = new TwinShare(message.index, message.shares, message.n);
    return;
  }
  if (share === null) throw new Error("a command came before the setup");
  const report = share.run(message);
  // its numbers, and the twins' trails joined into curves where asked
  // (decision 95), with the twins stamped into them (decision 100)
  scope.postMessage(report, reportBuffers(report));
});
