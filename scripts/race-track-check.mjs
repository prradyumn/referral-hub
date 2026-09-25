/**
 * The leaderboard circuit — geometry and car placement, checked without a
 * browser, database or network.
 *
 *   node scripts/race-track-check.mjs      (or npm run race:check)
 *
 * Imports src/lib/race-track.ts directly; Node strips the types. The
 * placement rules are what make the picture honest — distance proportional to
 * joins, ties side by side, nobody drawn on top of anybody — so they are
 * tested here rather than trusted to a screenshot.
 */

import assert from "node:assert/strict";
import {
  CAR_LENGTH, FINISH_T, LANE_OFFSET, START_T, VIEW,
  gridSlot, placeRacers, poseAt, trackLength, trackPath,
} from "../src/lib/race-track.ts";

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log(`  ok    ${name}`); }
  catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${e.message.split("\n")[0]}`); }
}
const racers = (scores) => scores.map((score, i) => ({ key: `r${i}`, score }));
const step = (CAR_LENGTH + 6) / trackLength();

console.log("\nThe track");
check("draws as one open path of cubic curves", () => {
  const d = trackPath();
  assert.match(d, /^M[\d.]+ [\d.]+( C[\d. ]+)+$/);
  assert.ok(!/z/i.test(d), "a closed loop would put the finish on the start");
});
check("is about two thousand units long", () => assert.ok(trackLength() > 1500 && trackLength() < 2600, String(trackLength())));
check("stays inside the drawing, with room for its width", () => {
  for (let t = 0; t <= 1; t += 0.005) {
    const p = poseAt(t);
    assert.ok(p.x > 25 && p.x < VIEW.w - 25 && p.y > 25 && p.y < VIEW.h - 25, `t=${t.toFixed(3)} → ${p.x},${p.y}`);
  }
});
check("start is before finish, with the start leaving room for a grid behind it", () => {
  assert.ok(START_T < FINISH_T);
  assert.ok(START_T * trackLength() >= 4 * (CAR_LENGTH + 6) - 1, "four rows of two need space");
});
check("fractions are distances: equal steps cover equal ground", () => {
  const d = (a, b) => { const p = poseAt(a), q = poseAt(b); return Math.hypot(p.x - q.x, p.y - q.y); };
  const n = 200, len = trackLength() / n;
  for (let i = 0; i < n; i++) assert.ok(d(i / n, (i + 1) / n) <= len * 1.01, `segment ${i}`);
});
check("a lane offset is sideways to the direction of travel", () => {
  for (const t of [0.2, 0.5, 0.8]) {
    const c = poseAt(t), l = poseAt(t, LANE_OFFSET);
    const a = (c.angle * Math.PI) / 180;
    const along = (l.x - c.x) * Math.cos(a) + (l.y - c.y) * Math.sin(a);
    assert.ok(Math.abs(along) < 0.01, `t=${t}: ${along}`);
    assert.ok(Math.abs(Math.hypot(l.x - c.x, l.y - c.y) - LANE_OFFSET) < 0.01);
  }
});
check("out-of-range fractions clamp to the ends", () => {
  assert.deepEqual(poseAt(-1), poseAt(0));
  assert.deepEqual(poseAt(2), poseAt(1));
});

console.log("\nWhere the cars go");
check("the leader is nearest the finish, never past it", () => {
  const [lead] = placeRacers(racers([11, 6, 3]));
  assert.ok(lead.t < FINISH_T && lead.t > FINISH_T - 0.05, String(lead.t));
});
check("distance from the start is proportional to joins", () => {
  const [a, b, c] = placeRacers(racers([10, 5, 2]));
  const from = START_T + 0.02;
  assert.ok(Math.abs((b.t - from) / (a.t - from) - 0.5) < 1e-9, "5 of 10 is halfway");
  assert.ok(Math.abs((c.t - from) / (a.t - from) - 0.2) < 1e-9, "2 of 10 is a fifth");
});
check("a tie sits side by side, in the two lanes", () => {
  const [, b, c] = placeRacers(racers([4, 2, 2]));
  assert.equal(b.t, c.t);
  assert.notEqual(b.lane, c.lane);
});
check("a three-way tie drops the third a car length back", () => {
  const [, b, , d] = placeRacers(racers([4, 2, 2, 2]));
  assert.ok(Math.abs(b.t - d.t - step) < 1e-9, `${b.t} vs ${d.t}`);
});
check("no two cars in the same lane overlap, in a crowded field", () => {
  const p = placeRacers(racers([11, 6, 3, 2, 2, 2, 2, 1, 1, 1, 1, 1]));
  for (let i = 0; i < p.length; i++)
    for (let j = i + 1; j < p.length; j++)
      if (p[i].lane === p[j].lane) assert.ok(Math.abs(p[i].t - p[j].t) >= step - 1e-9, `${p[i].key} / ${p[j].key}`);
});
check("rank order is kept: a car never sits ahead of someone who beat it", () => {
  const p = placeRacers(racers([9, 4, 4, 4, 3, 1]));
  for (let i = 1; i < p.length; i++) assert.ok(p[i].t <= p[i - 1].t + 1e-9, `${i}`);
});
check("with nobody on the board, everyone waits at the line", () => {
  for (const c of placeRacers(racers([0, 0, 0]))) assert.ok(c.t <= START_T + 0.03);
});

console.log("\nThe starting grid");
check("two abreast, a car length between rows, all behind the line", () => {
  for (let i = 0; i < 8; i++) {
    const s = gridSlot(i);
    assert.ok(s.t < START_T, `slot ${i} is behind the line`);
    assert.equal(s.lane, i % 2 === 0 ? -1 : 1);
  }
  assert.ok(Math.abs(gridSlot(0).t - gridSlot(2).t - step) < 1e-9);
  assert.equal(gridSlot(0).t, gridSlot(1).t);
});
check("the back row still fits on the track", () => assert.ok(gridSlot(7).t > 0));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
