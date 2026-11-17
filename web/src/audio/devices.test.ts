import { describe, expect, it } from "vitest";

import { builtInMicrophone, type Input } from "./devices.ts";

// Which microphone the piece listens through (docs/decisions.md, decision
// 44): the device's own where the default is one worn on the head, as a
// headset that a phone or a laptop switches to by itself; else the default.

const input = (deviceId: string, label: string): Input => ({
  deviceId,
  label,
  kind: "audioinput",
});

describe("builtInMicrophone", () => {
  it("leaves the default alone when it is the device's own", () => {
    const inputs = [
      input("default", "Default - MacBook Pro Microphone (Built-in)"),
      input("a", "MacBook Pro Microphone (Built-in)"),
      input("b", "USB Audio Device"),
    ];
    expect(builtInMicrophone(inputs, "a")).toBeNull();
  });

  it("chooses the device's own over a headset or a Bluetooth microphone in use", () => {
    expect(
      builtInMicrophone(
        [input("h", "Headset microphone"), input("p", "iPhone Microphone")],
        "h",
      ),
    ).toBe("p");
    expect(
      builtInMicrophone(
        [
          input("default", "Default - AirPods Pro Hands-Free"),
          input("air", "AirPods Pro Hands-Free"),
          input("arr", "Microphone Array (Realtek(R) Audio)"),
        ],
        "air",
      ),
    ).toBe("arr");
  });

  it("keeps a worn one when there is nothing else, and passes over the aliases and the outputs", () => {
    expect(
      builtInMicrophone(
        [
          input("default", "Default - Bluetooth headset"),
          input("communications", "Communications - Bluetooth headset"),
          input("bt", "Bluetooth headset"),
          { deviceId: "spk", label: "Speakers", kind: "audiooutput" },
        ],
        "bt",
      ),
    ).toBeNull();
  });

  it("knows nothing of devices whose names it is not given", () => {
    expect(builtInMicrophone([input("x", ""), input("y", "")], "x")).toBeNull();
  });
});
