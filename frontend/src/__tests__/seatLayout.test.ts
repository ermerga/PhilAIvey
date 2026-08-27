import { describe, it, expect } from "vitest";
import { humanSeat, aiSeats, puckAnchor } from "../lib/seatLayout";

describe("seatLayout", () => {
  it("pins the human seat to bottom-center, on the lower felt", () => {
    const h = humanSeat();
    expect(h.xPct).toBe(50);
    expect(h.yPct).toBeGreaterThan(80); // low on the table...
    expect(h.yPct).toBeLessThanOrEqual(100); // ...but not spilling past the rim into the HUD
  });

  it("returns one point per AI seat for every supported count", () => {
    for (let n = 1; n <= 5; n++) {
      expect(aiSeats(n)).toHaveLength(n);
    }
  });

  it("keeps AI seats in the top half, clear of the human", () => {
    for (const seat of aiSeats(5)) {
      expect(seat.yPct).toBeLessThan(90); // never down where the human sits
    }
  });

  it("spreads more AI seats over a wider span", () => {
    const two = aiSeats(2);
    const five = aiSeats(5);
    const spanTwo = Math.abs(two[0].xPct - two[two.length - 1].xPct);
    const spanFive = Math.abs(five[0].xPct - five[five.length - 1].xPct);
    expect(spanFive).toBeGreaterThan(spanTwo);
  });

  it("falls back gracefully for an unexpected count", () => {
    const six = aiSeats(6);
    expect(six).toHaveLength(6);
    for (const seat of six) {
      expect(seat.yPct).toBeLessThan(90);
    }
  });

  it("puckAnchor pulls the puck from its seat toward table center", () => {
    const seat = { xPct: 50, yPct: 116 };
    const anchor = puckAnchor(seat, "D");
    // center is (50,50); anchor should sit between seat and center
    expect(anchor.yPct).toBeLessThan(seat.yPct);
    expect(anchor.yPct).toBeGreaterThan(50);
  });

  it("nudges SB and BB pucks to opposite sides so they don't stack", () => {
    const seat = { xPct: 50, yPct: 116 };
    const sb = puckAnchor(seat, "SB");
    const bb = puckAnchor(seat, "BB");
    const d = puckAnchor(seat, "D");
    expect(sb.xPct).toBeLessThan(d.xPct);
    expect(bb.xPct).toBeGreaterThan(d.xPct);
  });
});
