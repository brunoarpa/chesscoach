import { describe, it, expect } from "vitest";
import { getEffectiveAvailability } from "@/lib/utils";

const minutesAgo = (m: number) => new Date(Date.now() - m * 60 * 1000);
const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000);

describe("getEffectiveAvailability", () => {
  it("is UNAVAILABLE when the coach has set no price", () => {
    expect(getEffectiveAvailability("AVAILABLE", minutesAgo(1), null, null)).toBe("UNAVAILABLE");
    expect(getEffectiveAvailability("AVAILABLE", minutesAgo(1), 0, 0)).toBe("UNAVAILABLE");
  });

  it("counts a chat-only or call-only price as having a price", () => {
    expect(getEffectiveAvailability("AVAILABLE", minutesAgo(1), 500, null)).toBe("AVAILABLE");
    expect(getEffectiveAvailability("AVAILABLE", minutesAgo(1), null, 800)).toBe("AVAILABLE");
  });

  it("keeps the coach's stated availability while recently active", () => {
    expect(getEffectiveAvailability("AVAILABLE", hoursAgo(1), 500)).toBe("AVAILABLE");
    expect(getEffectiveAvailability("AWAY", hoursAgo(1), 500)).toBe("AWAY");
  });

  it("forces UNAVAILABLE after 24h of inactivity", () => {
    expect(getEffectiveAvailability("AVAILABLE", hoursAgo(25), 500)).toBe("UNAVAILABLE");
    expect(getEffectiveAvailability("AWAY", hoursAgo(48), 500)).toBe("UNAVAILABLE");
  });

  it("respects an explicit UNAVAILABLE regardless of activity", () => {
    expect(getEffectiveAvailability("UNAVAILABLE", minutesAgo(1), 500)).toBe("UNAVAILABLE");
  });
});
