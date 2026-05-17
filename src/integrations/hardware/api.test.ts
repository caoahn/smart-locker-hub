import { describe, expect, it, vi, beforeEach } from "vitest";
import { hardwareApi, parseHardwareBaseUrlMap, parseHardwareBoxIdMap, parseHardwareOpenPathMap, resolveOpenTarget } from "./api";

describe("hardware API config", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("parses hardware box id maps from comma-delimited config", () => {
    expect(parseHardwareBoxIdMap("1:1, 2:4, bad:3, 3:nope")).toEqual({ 1: 1, 2: 4 });
  });

  it("parses per-locker open paths from JSON config", () => {
    expect(parseHardwareOpenPathMap('{"1":"/lockers/1/open","2":"/relay/two/open"}')).toEqual({
      1: "/lockers/1/open",
      2: "/relay/two/open",
    });
  });

  it("parses per-locker base URLs", () => {
    expect(parseHardwareBaseUrlMap("1:192.168.0.107,2:http://192.168.0.108/")).toEqual({
      1: "http://192.168.0.107",
      2: "http://192.168.0.108",
    });
  });

  it("resolves the hardware relay id separately from the app locker id", () => {
    vi.stubEnv("IP_HARD_WARE", "192.168.0.107");
    vi.stubEnv("HARDWARE_OPEN_PATH", "/relays/:hardwareBoxId/open");
    vi.stubEnv("HARDWARE_BOX_ID_MAP", "1:1,2:4");

    expect(resolveOpenTarget(2)).toEqual({
      boxId: 2,
      baseUrl: "http://192.168.0.107",
      hardwareBoxId: 4,
      path: "/relays/4/open",
    });
  });

  it("allows a per-locker endpoint to override the default template", () => {
    vi.stubEnv("IP_HARD_WARE", "192.168.0.107");
    vi.stubEnv("HARDWARE_OPEN_PATH", "/lockers/:boxId/open");
    vi.stubEnv("HARDWARE_OPEN_PATHS", "2:/locker-two/open");

    expect(resolveOpenTarget(2)).toEqual({
      boxId: 2,
      baseUrl: "http://192.168.0.107",
      hardwareBoxId: 2,
      path: "/locker-two/open",
    });
  });

  it("allows each locker to use a different hardware base URL", () => {
    vi.stubEnv("IP_HARD_WARE", "192.168.0.107");
    vi.stubEnv("HARDWARE_BASE_URLS", "2:192.168.0.108");

    expect(resolveOpenTarget(2)).toEqual({
      boxId: 2,
      baseUrl: "http://192.168.0.108",
      hardwareBoxId: 2,
      path: "/lockers/2/open",
    });
  });

  it("treats per-locker base URLs as configured", () => {
    vi.stubEnv("HARDWARE_BASE_URLS", "2:192.168.0.108");

    expect(hardwareApi.isConfigured()).toBe(true);
  });
});
