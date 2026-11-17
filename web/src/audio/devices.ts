// Which microphone the piece listens through (docs/decisions.md, decision
// 44). A phone or a laptop switches its default input to a headset by
// itself, wired or Bluetooth, and a Bluetooth headset's microphone pulls its
// sound down to a call's. So where the default is worn on the head and the
// device has a microphone of its own, the piece asks for that one by its id.
// The names are the browser's, given once the microphone is allowed.

/** A device as the browser lists it (MediaDeviceInfo). */
export interface Input {
  readonly deviceId: string;
  readonly label: string;
  readonly kind: string;
}

/** Names of microphones worn on the head, or carried by Bluetooth. */
const WORN =
  /bluetooth|headset|head set|hands-?free|airpods|buds|headphone|earphone|earpiece/i;
/** The browser's aliases for whichever device is the default. */
const ALIASES: ReadonlySet<string> = new Set(["default", "communications"]);

/**
 * The id of the device's own microphone, where the one in use (`current`) is
 * worn and another is not; or null, to keep the one in use.
 */
export function builtInMicrophone(
  devices: readonly Input[],
  current: string,
): string | null {
  const inputs = devices.filter(
    ({ kind, deviceId }) => kind === "audioinput" && !ALIASES.has(deviceId),
  );
  const using = inputs.find(({ deviceId }) => deviceId === current);
  if (using === undefined || !WORN.test(using.label)) return null;
  const own = inputs.find(
    ({ deviceId, label }) =>
      deviceId !== current && label !== "" && !WORN.test(label),
  );
  return own?.deviceId ?? null;
}
