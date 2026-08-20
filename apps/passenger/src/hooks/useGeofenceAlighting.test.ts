import { describe, expect, it } from "vitest";
import { haversineMeters } from "./useGeofenceAlighting";

describe("haversineMeters", () => {
  it("returns 0 for identical points", () => {
    const p = { latitude: 10.787, longitude: 79.1378 };
    expect(haversineMeters(p, p)).toBe(0);
  });

  it("returns roughly the known distance between two Thanjavur-area stops", () => {
    // Thanjai Central Bus Stand -> Big Temple East Gate (~650m apart per seed data)
    const a = { latitude: 10.787, longitude: 79.1378 };
    const b = { latitude: 10.7828, longitude: 79.1319 };
    const distance = haversineMeters(a, b);
    expect(distance).toBeGreaterThan(500);
    expect(distance).toBeLessThan(900);
  });

  it("is within the 100m geofence for two very close points", () => {
    const a = { latitude: 10.787, longitude: 79.1378 };
    const b = { latitude: 10.7871, longitude: 79.1379 };
    expect(haversineMeters(a, b)).toBeLessThan(100);
  });
});
