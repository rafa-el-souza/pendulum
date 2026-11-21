import { describe, expect, it } from "vitest";

import {
  COUNTED_HOST,
  counted,
  counterSource,
  readCountSwitch,
  withoutCountSwitch,
} from "./visits.ts";

// Counting the site's visits (docs/decisions.md, decision 84).

describe("the address's switch for counting a device", () => {
  it("turns counting off with count=0 and on again with count=1, and asks nothing otherwise", () => {
    expect(readCountSwitch("?count=0")).toBe("off");
    expect(readCountSwitch("?n=8&count=1")).toBe("on");
    expect(readCountSwitch("?count=2")).toBeNull();
    expect(readCountSwitch("?count")).toBeNull();
    expect(readCountSwitch("?n=8")).toBeNull();
    expect(readCountSwitch("")).toBeNull();
  });

  it("is read as the address reads every name: the first written counts", () => {
    expect(readCountSwitch("?count=1&count=0")).toBe("on");
  });

  it("leaves the address with the rest as it was written, commas and all", () => {
    expect(withoutCountSwitch("?n=8&count=0&zoom=8&at=0.12345,-0.85432")).toBe(
      "?n=8&zoom=8&at=0.12345,-0.85432",
    );
    expect(withoutCountSwitch("?count=0")).toBe("");
    expect(withoutCountSwitch("?count=1&count=0&n=8")).toBe("?n=8");
    expect(withoutCountSwitch("?n=8")).toBe("?n=8");
    expect(withoutCountSwitch("")).toBe("");
  });
});

describe("a visit", () => {
  it("is counted only on the published site, in a browser no program drives, on a device that has not turned counting off", () => {
    expect(counted(COUNTED_HOST, false, false)).toBe(true);
    expect(counted("127.0.0.1", false, false)).toBe(false);
    expect(counted("rafa-el-souza.github.io", false, false)).toBe(false);
    expect(counted(COUNTED_HOST, true, false)).toBe(false);
    expect(counted(COUNTED_HOST, false, true)).toBe(false);
  });

  it("is counted by Cloudflare's script with the site's token, the address's changes not counted as pages", () => {
    const url = new URL(counterSource("0123abcd"));
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://static.cloudflareinsights.com/beacon.min.js",
    );
    expect(url.searchParams.get("token")).toBe("0123abcd");
    expect(url.searchParams.get("spa")).toBe("false");
  });
});
