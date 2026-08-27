// ============================================================================
// seatLayout — where seats and pucks sit on the table
//
// Pure functions only. No React, no DOM. Inputs -> outputs, so this is easy to
// unit-test and reason about. Everything is returned as a PERCENTAGE of the
// .table-wrap box; React feeds those into CSS custom properties and CSS does
// `left: var(--seat-x); top: var(--seat-y)`.
//
// Coordinate system: (0%,0%) is top-left of .table-wrap, (100%,100%) bottom-
// right. Screen Y grows downward, so on our ellipse:
//   angle  90deg -> bottom   (the human)
//   angle 270deg -> top
//   angle   0deg -> right,  180deg -> left
// ============================================================================

export interface Point {
  xPct: number;
  yPct: number;
}

/** Ellipse the AI seats ride on, as percentages of .table-wrap. */
const AI_RADIUS_X = 50;
const AI_RADIUS_Y = 52;
const CENTER = { xPct: 50, yPct: 50 };

/** The human never moves — pinned to the lower felt, bottom-center, and kept
 *  clear of the HUD rail below the table. */
const HUMAN_SEAT: Point = { xPct: 50, yPct: 99 };

/**
 * Angle offsets (degrees) from straight-up (270deg) for each AI seat, keyed by
 * how many opponents there are. Ordered left -> right across the top of the
 * table. Wider spread as the count grows so seats never crowd.
 *
 * Same idea as a hand-tuned seating chart, but expressed as angles so the
 * ellipse math does the placement.
 */
const AI_ANGLE_OFFSETS: Record<number, number[]> = {
  1: [0],
  2: [-46, 46],
  3: [-70, 0, 70],
  4: [-96, -34, 34, 96],
  5: [-104, -52, 0, 52, 104],
};

const TOP_ANGLE_DEG = 270;

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** A point on the AI ellipse at the given angle (degrees). */
function ellipsePoint(angleDeg: number, radiusX: number, radiusY: number): Point {
  const a = degToRad(angleDeg);
  return {
    xPct: CENTER.xPct + radiusX * Math.cos(a),
    yPct: CENTER.yPct + radiusY * Math.sin(a),
  };
}

/** Fixed position of the human seat. */
export function humanSeat(): Point {
  return { ...HUMAN_SEAT };
}

/**
 * Positions for `count` AI seats (1-5), in seating order. If an unexpected
 * count comes through, fall back to an even fan across a 200deg arc so nothing
 * ever renders on top of the human.
 */
export function aiSeats(count: number): Point[] {
  const offsets =
    AI_ANGLE_OFFSETS[count] ??
    Array.from({ length: count }, (_, i) =>
      count === 1 ? 0 : -100 + (i * 200) / (count - 1),
    );

  return offsets.map((offset) =>
    ellipsePoint(TOP_ANGLE_DEG + offset, AI_RADIUS_X, AI_RADIUS_Y),
  );
}

/**
 * Where a dealer / blind puck rests: on the felt, between its seat and the
 * center of the table. Each role gets a small sideways nudge so that when two
 * roles land on the same seat (heads-up: the dealer is also the small blind)
 * the pucks sit beside each other instead of stacking.
 */
export function puckAnchor(seat: Point, role: "D" | "SB" | "BB"): Point {
  const PULL_X = 0.58; // how far from the seat toward center, horizontally
  const PULL_Y = 0.46; // ...and vertically (kept clear of the seat's hole cards)
  const NUDGE: Record<typeof role, number> = { D: 0, SB: -5, BB: 5 };

  return {
    xPct: CENTER.xPct + (seat.xPct - CENTER.xPct) * PULL_X + NUDGE[role],
    yPct: CENTER.yPct + (seat.yPct - CENTER.yPct) * PULL_Y,
  };
}
