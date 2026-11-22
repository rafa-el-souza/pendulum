import { describe, expect, it } from "vitest";

import {
  PERF_SPAN,
  PERF_STAGES,
  PERF_WARM,
  PerfRecord,
  perfFileName,
  readPerf,
  withoutPerf,
  type FrameState,
  type PerfStage,
} from "./perf.ts";

const state: FrameState = {
  simulated: 1 / 60,
  n: 2,
  twinsAlive: 4096,
  twinsAsked: 4096,
  twinsAffordable: 5000,
  shares: 7,
  local: false,
  budget: 9.5,
  screen: 16.7,
  period: 16.9,
  late: false,
  reached: 1,
  mechanism: "sharp",
  waited: 0,
};

function stages(ms: number): Record<PerfStage, number> {
  return Object.fromEntries(
    PERF_STAGES.map((stage, i) => [stage, ms + i]),
  ) as Record<PerfStage, number>;
}

describe("the recorder the address asks for (decision 94)", () => {
  it("records with ?perf=1, after warming up 20 s, for 20 s, unless the address says otherwise", () => {
    expect(PERF_WARM).toBe(20);
    expect(PERF_SPAN).toBe(20);
    expect(readPerf("?perf=1")).toEqual({ warm: 20, span: 20, label: "" });
    expect(readPerf("?twins=4096&perf=1&perfwarm=5&perfspan=30")).toEqual({
      warm: 5,
      span: 30,
      label: "",
    });
    expect(readPerf("?perf=1&perfwarm=0")?.warm).toBe(0);
    expect(readPerf("")).toBeNull();
    expect(readPerf("?perf=0")).toBeNull();
    expect(readPerf("?perfwarm=5")).toBeNull();
  });

  it("keeps the seconds asked for within reason, and the label to a plain word", () => {
    expect(readPerf("?perf=1&perfspan=0")?.span).toBe(20);
    expect(readPerf("?perf=1&perfspan=-3")?.span).toBe(20);
    expect(readPerf("?perf=1&perfwarm=9000")?.warm).toBe(20);
    expect(readPerf("?perf=1&perfwarm=")?.warm).toBe(20);
    expect(readPerf("?perf=1&perfwarm=soon")?.warm).toBe(20);
    expect(readPerf("?perf=1&perflabel=t4096n2")?.label).toBe("t4096n2");
    expect(readPerf("?perf=1&perflabel=a/../b%20c")?.label).toBe("abc");
  });

  it("leaves the address without its keys, the rest as written, so that no link carries them", () => {
    expect(withoutPerf("?n=8&perf=1&twins=4096&perfwarm=5")).toBe(
      "?n=8&twins=4096",
    );
    expect(
      withoutPerf("?perf=1&perfspan=3&perflabel=x&figure=swing-circle"),
    ).toBe("?figure=swing-circle");
    expect(withoutPerf("?perf=1")).toBe("");
    expect(withoutPerf("")).toBe("");
    expect(withoutPerf("?music=dance&fps=1")).toBe("?music=dance&fps=1");
    expect(withoutPerf("?a=%20b&perf=1")).toBe("?a=%20b");
    expect(withoutPerf("?perfume=1&perf")).toBe("?perfume=1");
  });

  it("keeps a row per frame: the stages, the state and the reports, the graphics card's time once it comes", () => {
    const record = new PerfRecord();
    record.add(1000, 8.5, stages(1), state, [
      { share: 3, spent: 4.2, asked: 586, count: 586, pieces: 4 },
      { share: 0, spent: 3.9, asked: 586, count: 585, pieces: 4 },
    ]);
    record.add(1016.7, 7.5, stages(2), { ...state, late: true }, []);
    record.gpu(0, 2.25);
    record.gpu(5, 9);
    expect(record.frames).toBe(2);
    const { columns } = record;
    expect(columns["t"]).toEqual([1000, 1016.7]);
    expect(columns["total"]).toEqual([8.5, 7.5]);
    expect(columns["music"]).toEqual([1, 2]);
    expect(columns["send"]).toEqual([11, 12]);
    expect(columns["gpu"]?.[0]).toBe(2.25);
    expect(columns["gpu"]?.[1]).toBeNaN();
    expect(columns["late"]).toEqual([0, 1]);
    expect(columns["waited"]).toEqual([0, 0]);
    expect(columns["alive"]).toEqual([4096, 4096]);
    for (const column of Object.values(columns)) {
      expect(column).toHaveLength(2);
    }
    expect(record.reports).toEqual([
      [3, 4.2, 586, 586, 4, 0, 3.9, 586, 585, 4],
      [],
    ]);
    const file = JSON.parse(record.json({ label: "x" })) as {
      header: { label: string; frames: number };
      columns: Record<string, number[]>;
      shares: number[][];
    };
    expect(file.header).toEqual({ label: "x", frames: 2 });
    expect(file.shares).toHaveLength(2);
    expect(Object.keys(file.columns)).toContain("draw.trails");
  });

  it("names its file by its label and the instant it was saved", () => {
    const at = new Date("2026-11-22T17:30:05.123Z");
    expect(perfFileName("", at)).toBe(
      "pendulum-perf-2026-11-22T17-30-05-123Z.json",
    );
    expect(perfFileName("t4096n2", at)).toBe(
      "pendulum-perf-t4096n2-2026-11-22T17-30-05-123Z.json",
    );
  });
});
