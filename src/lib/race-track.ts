/**
 * The leaderboard's circuit, as geometry.
 *
 * Pure — no DOM, no imports — so the server can place every car at its final
 * position before any JavaScript runs, the client can animate along the same
 * curve, and scripts/race-track-check.mjs can test it in Node.
 *
 * The track is point to point, not a loop. On a loop the finish line sits on
 * the start line, so the leader would look as though they were right behind
 * the car in last place.
 */

export type Pt = { x: number; y: number };
export type Pose = { x: number; y: number; angle: number };

export const VIEW = { w: 1000, h: 440 };
export const TRACK_WIDTH = 50;
export const LANE_OFFSET = 11.5; // two lanes, either side of the centre line
export const CAR_LENGTH = 38;

/** Start bottom-left, finish top-right, winding between. */
const CONTROL: Pt[] = [
  { x: 60, y: 362 },
  { x: 250, y: 386 },
  { x: 430, y: 362 },
  { x: 522, y: 292 },
  { x: 472, y: 216 },
  { x: 330, y: 190 },
  { x: 212, y: 152 },
  { x: 212, y: 86 },
  { x: 340, y: 56 },
  { x: 520, y: 76 },
  { x: 640, y: 150 },
  { x: 720, y: 250 },
  { x: 800, y: 330 },
  { x: 900, y: 332 },
  { x: 946, y: 252 },
  { x: 932, y: 152 },
  { x: 942, y: 70 },
];

/**
 * Where the start line and the finish line are drawn, as fractions of the
 * track. The start sits a tenth of the way in so a full grid — four rows of
 * two, a car length apart — fits behind it.
 */
export const START_T = 0.1;
export const FINISH_T = 0.965;
/** The furthest a car is placed: its nose just short of the finish line. */
const LEADER_T = 0.95;

type Bezier = [Pt, Pt, Pt, Pt];

/** Uniform Catmull-Rom through CONTROL, as cubic Béziers — exactly what is drawn. */
function segments(): Bezier[] {
  const c = CONTROL;
  const at = (i: number): Pt => {
    if (i < 0) return { x: 2 * c[0].x - c[1].x, y: 2 * c[0].y - c[1].y };
    if (i >= c.length) {
      const n = c.length - 1;
      return { x: 2 * c[n].x - c[n - 1].x, y: 2 * c[n].y - c[n - 1].y };
    }
    return c[i];
  };
  const out: Bezier[] = [];
  for (let i = 0; i < c.length - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    out.push([
      p1,
      { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
      { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
      p2,
    ]);
  }
  return out;
}

const round = (n: number) => Math.round(n * 10) / 10;

export function trackPath(): string {
  const segs = segments();
  const [a] = segs[0];
  return (
    `M${round(a.x)} ${round(a.y)}` +
    segs.map(([, b, c, d]) => ` C${round(b.x)} ${round(b.y)} ${round(c.x)} ${round(c.y)} ${round(d.x)} ${round(d.y)}`).join("")
  );
}

function bezier([a, b, c, d]: Bezier, u: number): Pt {
  const v = 1 - u;
  return {
    x: v * v * v * a.x + 3 * v * v * u * b.x + 3 * v * u * u * c.x + u * u * u * d.x,
    y: v * v * v * a.y + 3 * v * v * u * b.y + 3 * v * u * u * c.y + u * u * u * d.y,
  };
}

type Table = { pts: Pt[]; cum: number[]; total: number };
let table: Table | null = null;

/** Dense samples with cumulative arc length, so a fraction means a distance. */
function sampled(): Table {
  if (table) return table;
  const pts: Pt[] = [];
  for (const s of segments()) for (let k = 0; k < 80; k++) pts.push(bezier(s, k / 80));
  pts.push(CONTROL[CONTROL.length - 1]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  table = { pts, cum, total: cum[cum.length - 1] };
  return table;
}

export function trackLength(): number {
  return sampled().total;
}

/**
 * Where a car is at fraction t of the track's length, `lateral` units to the
 * left (+) or right (−) of the centre line, and which way it faces.
 */
export function poseAt(t: number, lateral = 0): Pose {
  const { pts, cum, total } = sampled();
  const target = Math.min(Math.max(t, 0), 1) * total;

  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < target) lo = mid;
    else hi = mid;
  }
  const span = cum[hi] - cum[lo] || 1;
  const f = (target - cum[lo]) / span;
  const x = pts[lo].x + (pts[hi].x - pts[lo].x) * f;
  const y = pts[lo].y + (pts[hi].y - pts[lo].y) * f;

  const angle = Math.atan2(pts[hi].y - pts[lo].y, pts[hi].x - pts[lo].x);
  // Left-hand normal of the direction of travel.
  return { x: x + Math.sin(angle) * lateral, y: y - Math.cos(angle) * lateral, angle: (angle * 180) / Math.PI };
}

export type Placement = { key: string; t: number; lane: -1 | 1 };

/**
 * Where each racer sits, leader nearest the finish.
 *
 * Distance is proportional to score, which is honest: someone on 1 join
 * against a leader on 11 really is a long way back. Cars that would overlap —
 * ties, above all — fill the other lane first, then drop one car length back,
 * forming a grid the way a real field does.
 *
 * `racers` arrive in rank order; that order also decides who holds the
 * front of a pack.
 */
export function placeRacers(racers: { key: string; score: number }[]): Placement[] {
  const top = Math.max(0, ...racers.map((r) => r.score));
  const step = (CAR_LENGTH + 6) / trackLength();
  const placed: Placement[] = [];

  for (const r of racers) {
    let t = top > 0 ? START_T + 0.02 + (LEADER_T - START_T - 0.02) * (r.score / top) : START_T + 0.02;
    let spot: Placement | null = null;
    for (let tries = 0; tries < 40 && !spot; tries++) {
      for (const lane of [-1, 1] as const) {
        if (placed.every((p) => p.lane !== lane || Math.abs(p.t - t) >= step)) {
          spot = { key: r.key, t, lane };
          break;
        }
      }
      if (!spot) t = Math.max(0.005, t - step);
    }
    placed.push(spot ?? { key: r.key, t, lane: -1 });
  }
  return placed;
}

/** Grid slot i before the lights go out: two abreast, rows a car length apart, behind the line. */
export function gridSlot(i: number): { t: number; lane: -1 | 1 } {
  const step = (CAR_LENGTH + 6) / trackLength();
  return { t: Math.max(0.004, START_T - 0.008 - Math.floor(i / 2) * step), lane: i % 2 === 0 ? -1 : 1 };
}
