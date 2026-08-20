import { describe, expect, it } from "vitest";
import { haversineMeters } from "./geo";

describe("haversineMeters (conductor)", () => {
  it("returns 0 for identical points", () => {
    const p = { latitude: 10.787, longitude: 79.1378 };
    expect(haversineMeters(p, p)).toBe(0);
  });

  it("exceeds the 3m move threshold for two clearly distinct points", () => {
    const a = { latitude: 10.787, longitude: 79.1378 };
    const b = { latitude: 10.7871, longitude: 79.1379 };
    expect(haversineMeters(a, b)).toBeGreaterThan(3);
  });

  it("stays under the 3m move threshold for near-identical points (GPS jitter)", () => {
    const a = { latitude: 10.787, longitude: 79.1378 };
    const b = { latitude: 10.78700001, longitude: 79.13780001 };
    expect(haversineMeters(a, b)).toBeLessThan(3);
  });
});
