"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  CAR_LENGTH,
  FINISH_T,
  LANE_OFFSET,
  START_T,
  TRACK_WIDTH,
  VIEW,
  gridSlot,
  placeRacers,
  poseAt,
  trackPath,
  type Pose,
} from "@/lib/race-track";
import { raceSound, type Engine } from "@/lib/race-sound";

export type Racer = {
  key: string;
  name: string;
  unit: string | null;
  joined: number;
  earned: number;
  isYou: boolean;
};

/*
 * Colour is emphasis, not identity (dataviz: "eight hues when the story is
 * one number → highlight one, grey the rest"). Everyone races in the team
 * livery; the leader is gold and you are mint, each with a label, so colour
 * never carries meaning alone. Gold and mint are the validated dark steps
 * (#c98500, #199e70): every check passes on the asphalt, all pairs.
 */
const LIVERY = {
  rest: { body: "#8b90a8", stripe: "#5b4fd6", helmet: "#e9e7f2" },
  leader: { body: "#c98500", stripe: "#7a4f00", helmet: "#fff4d6" },
  you: { body: "#199e70", stripe: "#0b5e42", helmet: "#e3fbf2" },
};

const ASPHALT = "#262a3f";
const TRACK_D = trackPath();
const START = poseAt(START_T);
const FINISH = poseAt(FINISH_T);
const END = poseAt(1);
// Where the fixed labels sit, so name tags can steer clear of them.
const LIGHTS_AT = { x: START.x - 6, y: START.y - 72 };
const FLAG_AT = { x: FINISH.x + 30, y: FINISH.y + 8 };
const FINISH_LABEL_AT = { x: END.x, y: END.y - TRACK_WIDTH / 2 - 12 };
const FIXED_BOXES = [
  { x: LIGHTS_AT.x - 4, y: LIGHTS_AT.y - 12, w: 100, h: 24 },
  { x: FLAG_AT.x - 2, y: FLAG_AT.y - 36, w: 26, h: 38 },
  { x: FINISH_LABEL_AT.x - 28, y: FINISH_LABEL_AT.y - 12, w: 56, h: 16 },
  { x: START.x - 28, y: START.y + TRACK_WIDTH / 2 + 10, w: 56, h: 16 },
];

const shortName = (n: string) => {
  const w = n.trim().split(/\s+/);
  const given = w.find((x, i) => i < w.length - 1 && x.replace(/\W/g, "").length > 1) ?? w[0];
  return w.length > 1 && given !== w[w.length - 1] ? `${given} ${w[w.length - 1][0]}.` : given;
};
const rupees = (n: number) => "₹" + n.toLocaleString("en-IN");
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const clamp01 = (k: number) => Math.min(1, Math.max(0, k));
/** One decimal, everywhere a number reaches markup. Server and browser do not
 *  agree on the last digit of Math.atan2, and a raw float in an attribute is
 *  a hydration mismatch. */
const n1 = (n: number) => n.toFixed(1);
const carTransform = (p: Pose) => `translate(${n1(p.x)} ${n1(p.y)}) rotate(${n1(p.angle)})`;

type Spot = { t: number; lat: number };

/** An estimate, but a generous one: an under-sized pill would clip its own text. */
function tagWidth(name: string, joined: number, leader: boolean, you: boolean): number {
  const chars = shortName(name).length + String(joined).length + 1 + (you ? 6 : 0);
  return 34 + chars * 6.6 + (leader ? 15 : 0);
}
/** The rank chip on a pack's label: "2–8". */
const packChipWidth = (from: number, to: number) => 12 + (String(from).length + String(to).length + 1) * 5.6;
const packLine = (size: number, joined: number, you: boolean) => `${size} tied on ${joined}${you ? " · incl. you" : ""}`;
function packWidth(from: number, to: number, size: number, joined: number, you: boolean): number {
  return 3 + packChipWidth(from, to) + 7 + packLine(size, joined, you).length * 6.4 + 12;
}
type Tag = { dx: number; dy: number; w: number };

type Box = { x: number; y: number; w: number; h: number };

type Pack = {
  id: string;
  joined: number;
  from: number;
  to: number;
  keys: Set<string>;
  names: string[];
  you: boolean;
  /** Tied for first. */
  lead: boolean;
  /** The car the label rides on. */
  front: string;
};

/** Keeps a tag of width w inside the drawing. */
const tagX = (x: number, w: number) => Math.min(Math.max(x, w / 2 + 4), VIEW.w - w / 2 - 4);

/**
 * Greedy placement for the few name tags: above the car, else below, further
 * out each time — clear of the other tags, every position badge and car, and
 * the fixed labels.
 */
function placeTags(items: { key: string; pose: Pose; w: number }[], obstacles: Box[]): Map<string, Tag> {
  const out = new Map<string, Tag>();
  const boxes: Box[] = [...obstacles];
  const h = 20;
  for (const it of items) {
    const tries = [-24, 26, -46, 48, -68, 70, -90];
    let chosen = tries[0];
    for (const dy of tries) {
      const b = { x: tagX(it.pose.x, it.w) - it.w / 2, y: it.pose.y + dy - h / 2, w: it.w, h };
      const clash = boxes.some((o) => b.x < o.x + o.w + 4 && b.x + b.w + 4 > o.x && b.y < o.y + o.h + 2 && b.y + b.h + 2 > o.y);
      const inside = b.y > 2 && b.y + h < VIEW.h - 2;
      if (!clash && inside) {
        chosen = dy;
        break;
      }
    }
    boxes.push({ x: tagX(it.pose.x, it.w) - it.w / 2, y: it.pose.y + chosen - h / 2, w: it.w, h });
    out.set(it.key, { dx: 0, dy: chosen, w: it.w });
  }
  return out;
}

export default function RaceTrack({ racers, periodLabel }: { racers: Racer[]; periodLabel: string }) {
  const layout = useMemo(() => {
    const places = placeRacers(racers.map((r) => ({ key: r.key, score: r.joined })));
    const byKey = new Map(places.map((p) => [p.key, p]));
    const leaderKey = racers[0]?.joined > 0 ? racers[0].key : null;
    const cars = racers.map((r, i) => {
      const p = byKey.get(r.key)!;
      const spot: Spot = { t: p.t, lat: p.lane * LANE_OFFSET };
      const kind: keyof typeof LIVERY = r.key === leaderKey ? "leader" : r.isYou ? "you" : "rest";
      return { ...r, rank: i + 1, spot, pose: poseAt(spot.t, spot.lat), kind };
    });

    // Ties race as a pack, and a pack gets ONE label — "2–8 · 7 tied on 1" —
    // over its front car. A tag or badge per car in a pack of seven piles
    // eight labels onto a few centimetres of track; the names are in the
    // standings below, and on hover. A tie for the lead is a pack too, led
    // by the tiebreak winner (most earned) — the gold car, as in the table.
    const packs = new Map<number, typeof cars>();
    for (const c of cars) {
      if (c.joined > 0) packs.set(c.joined, [...(packs.get(c.joined) ?? []), c]);
    }
    const packOf = new Map<string, Pack>();
    for (const [joined, members] of packs) {
      if (members.length < 2) continue;
      const pack: Pack = {
        id: `pack:${joined}`,
        joined,
        from: members[0].rank,
        to: members[members.length - 1].rank,
        keys: new Set(members.map((m) => m.key)),
        names: members.map((m) => shortName(m.name)),
        you: members.some((m) => m.isYou),
        lead: members[0].key === leaderKey,
        front: members[0].key,
      };
      for (const m of members) packOf.set(m.key, pack);
    }
    const label = (c: (typeof cars)[number]): "name" | "pack" | "badge" | null => {
      const pack = packOf.get(c.key);
      if (pack) return pack.front === c.key ? "pack" : null;
      return c.rank <= 3 || c.isYou ? "name" : "badge";
    };
    const labelled = cars.map((c) => ({ ...c, label: label(c), pack: packOf.get(c.key) ?? null }));

    const obstacles: Box[] = [
      ...labelled.map((c) => ({ x: c.pose.x - 17, y: c.pose.y - 9, w: 34, h: 18 })),
      ...labelled.filter((c) => c.label === "badge").map((c) => ({ x: c.pose.x - 9, y: c.pose.y - 28, w: 18, h: 18 })),
      ...FIXED_BOXES,
    ];
    const tags = placeTags(
      labelled
        .filter((c) => c.label === "name" || c.label === "pack")
        .map((c) => ({
          key: c.key,
          pose: c.pose,
          w:
            c.label === "pack"
              ? packWidth(c.pack!.from, c.pack!.to, c.pack!.keys.size, c.joined, c.pack!.you) + (c.pack!.lead ? 15 : 0)
              : tagWidth(c.name, c.joined, c.key === leaderKey, c.isYou),
        })),
      obstacles,
    );
    return { cars: labelled, tags, leaderKey };
  }, [racers]);

  const carRefs = useRef(new Map<string, SVGGElement>());
  const trailRefs = useRef(new Map<string, SVGPathElement>());
  const tagRefs = useRef(new Map<string, SVGGElement>());
  const fadeRefs = useRef(new Map<string, SVGGElement>());
  const countRefs = useRef(new Map<string, SVGTSpanElement>());
  const current = useRef(new Map<string, Spot>());
  const shownCount = useRef(new Map<string, number>());
  const frame = useRef<number | null>(null);
  const first = useRef(true);

  const svgRef = useRef<SVGSVGElement>(null);
  const [lights, setLights] = useState(-1); // -1 off, 0..5 lit, 6 = lights out
  const [celebrate, setCelebrate] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  // Bumped by Replay: runs the whole start again, lights and all.
  const [run, setRun] = useState(0);
  const soundOn = useSyncExternalStore(raceSound.subscribe, raceSound.isOn, raceSound.isOnServer);

  // Runs after React has written the cars' FINAL positions into the DOM and
  // before the browser paints, so each car can be put back where it visibly
  // was — the start line on first load, its old spot on a period change —
  // and driven from there. Nothing ever flashes at its destination.
  useLayoutEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cars = layout.cars;
    // A DOM flag for CSS, not React state: it only un-hides the cars once
    // they stand where the race begins. Mirroring it in state would render
    // again for nothing (react-hooks/set-state-in-effect).
    const markReady = () => svgRef.current?.setAttribute("data-ready", "");

    if (reduce) {
      for (const c of cars) {
        current.current.set(c.key, c.spot);
        shownCount.current.set(c.key, c.joined);
      }
      markReady();
      return;
    }

    // Tags fade in as the field pulls away, on the first race only: on the
    // grid, eight tags stacked over eight cars is noise. On a period change
    // they stay put and travel with their cars.
    const fading = first.current;
    const plans = cars.map((c, i) => {
      const slot = gridSlot(i);
      const from = current.current.get(c.key) ?? { t: slot.t, lat: slot.lane * LANE_OFFSET };
      const dist = Math.abs(c.spot.t - from.t);
      return {
        c,
        from,
        to: c.spot,
        // About twice the first version's pace, which read as a blur: the
        // leader now takes six seconds or so, and the field peels away one
        // car at a time.
        delay: i * 140,
        dur: 2600 + 4200 * dist,
        fromCount: shownCount.current.get(c.key) ?? 0,
      };
    });

    const place = (key: string, s: Spot, speed: number, count: number, tag: Tag | undefined, fade: number) => {
      const pose = poseAt(s.t, s.lat);
      carRefs.current.get(key)?.setAttribute("transform", carTransform(pose));
      trailRefs.current.get(key)?.setAttribute("opacity", String(Math.min(0.75, speed * 60)));
      const el = tagRefs.current.get(key);
      if (el) {
        el.setAttribute(
          "transform",
          tag ? `translate(${n1(tagX(pose.x, tag.w))} ${n1(pose.y + tag.dy)})` : `translate(${n1(pose.x)} ${n1(pose.y - 19)})`,
        );
      }
      fadeRefs.current.get(key)?.setAttribute("opacity", fade.toFixed(2));
      const span = countRefs.current.get(key);
      if (span) span.textContent = String(count);
    };

    for (const p of plans) place(p.c.key, p.from, 0, p.fromCount, layout.tags.get(p.c.key), fading ? 0 : 1);

    let engine: Engine | null = null;
    const drive = () => {
      const t0 = performance.now();
      const prev = new Map<string, number>();
      let last = t0;
      let flewBy = false;
      engine = raceSound.engine();
      const step = (now: number) => {
        let moving = false;
        let fastest = 0;
        const dt = Math.max(1, now - last);
        last = now;
        for (const p of plans) {
          const k = clamp01((now - t0 - p.delay) / p.dur);
          const e = ease(k);
          const s = { t: p.from.t + (p.to.t - p.from.t) * e, lat: p.from.lat + (p.to.lat - p.from.lat) * e };
          const speed = Math.abs(s.t - (prev.get(p.c.key) ?? s.t));
          fastest = Math.max(fastest, speed / dt);
          prev.set(p.c.key, s.t);
          const count = Math.round(p.fromCount + (p.c.joined - p.fromCount) * e);
          place(p.c.key, s, speed, count, layout.tags.get(p.c.key), fading ? Math.min(1, k * 2.5) : 1);
          current.current.set(p.c.key, s);
          shownCount.current.set(p.c.key, count);
          if (k < 1) moving = true;
        }
        // Flat out is about 2e-4 of the track a millisecond — the leader, mid-race.
        engine?.rev(fastest / 2e-4);
        // The leader braking into the line gets the roar-past, from the right.
        const lead = plans[0];
        if (!flewBy && layout.leaderKey && lead && now - t0 - lead.delay > lead.dur * 0.8) {
          flewBy = true;
          raceSound.flyby((FINISH.x / VIEW.w) * 2 - 1);
        }
        if (moving) frame.current = requestAnimationFrame(step);
        else {
          frame.current = null;
          engine?.stop();
          if (layout.leaderKey) {
            raceSound.finish();
            setCelebrate((n) => n + 1);
          }
        }
      };
      frame.current = requestAnimationFrame(step);
    };

    if (frame.current) cancelAnimationFrame(frame.current);
    markReady();
    raceSound.prime();

    // Lights only on the first race of a visit: on a period change they would
    // be a wait, not a show.
    if (first.current) {
      const timers: number[] = [];
      for (let i = 0; i <= 5; i++)
        timers.push(
          window.setTimeout(() => {
            setLights(i);
            if (i > 0) raceSound.light();
          }, 200 + i * 260),
        );
      timers.push(
        window.setTimeout(() => {
          first.current = false;
          setLights(6);
          raceSound.go();
          // Lights out: the field launching, from the left.
          raceSound.flyby((START.x / VIEW.w) * 2 - 1, 0.7);
          drive();
        }, 200 + 5 * 260 + 420),
      );
      return () => {
        timers.forEach(clearTimeout);
        if (frame.current) cancelAnimationFrame(frame.current);
        engine?.stop(0.15);
      };
    }
    drive();
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
      engine?.stop(0.15);
    };
  }, [layout, run]);

  // Drop the confetti after it has fallen, so it can fire again next time.
  useEffect(() => {
    if (!celebrate) return;
    const id = window.setTimeout(() => setCelebrate(0), 1800);
    return () => clearTimeout(id);
  }, [celebrate]);

  const fadeRef = (key: string) => (el: SVGGElement | null) => {
    if (el) fadeRefs.current.set(key, el);
    else fadeRefs.current.delete(key);
  };
  const replay = () => {
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = null;
    current.current.clear();
    shownCount.current.clear();
    first.current = true;
    setCelebrate(0);
    setLights(-1);
    setRun((n) => n + 1);
  };
  const toggleSound = async () => {
    const on = !soundOn;
    await raceSound.set(on);
    // Turning it on is asking to hear it: run the start again.
    if (on) replay();
  };

  const leader = layout.cars.find((c) => c.key === layout.leaderKey);
  const hovered = layout.cars.find((c) => c.key === hover);
  const hoveredPack = hover?.startsWith("pack:") ? layout.cars.find((c) => c.pack?.id === hover)?.pack ?? null : null;
  const dimmed = (c: (typeof layout.cars)[number]) => Boolean(hover && hover !== c.key && hover !== c.pack?.id);

  return (
    <div className="relative -mx-1 overflow-x-auto px-1">
      {/* Top-left is the one corner the circuit never uses. Both controls are
          motion-only: with reduced motion nothing races, so there is nothing
          to replay or hear. */}
      <div className="race-controls absolute top-2 left-3 z-10 flex gap-1.5">
        <button type="button" onClick={replay} className="race-btn" disabled={!layout.leaderKey}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M3.5 8a4.5 4.5 0 1 0 1.4-3.3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M4.6 1.8v3.1h3.1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Replay
        </button>
        <button
          type="button"
          onClick={toggleSound}
          className="race-btn"
          aria-pressed={soundOn}
          title={soundOn ? "Sound is on" : "Sound is off"}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M2.5 6h2.2L8 3.2v9.6L4.7 10H2.5z" fill="currentColor" />
            {soundOn ? (
              <path d="M10.4 5.6a3.2 3.2 0 0 1 0 4.8M12.3 3.8a5.8 5.8 0 0 1 0 8.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            ) : (
              <path d="M10.5 6l3.5 4M14 6l-3.5 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            )}
          </svg>
          Sound
        </button>
      </div>
      <svg
        viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
        ref={svgRef}
        className="race block w-full min-w-[720px]"
        role="img"
        aria-labelledby="race-title race-desc"
        onMouseLeave={() => setHover(null)}
      >
        <title id="race-title">{`Referral race, ${periodLabel}`}</title>
        <desc id="race-desc">
          {leader
            ? `${leader.name} leads with ${leader.joined} referral${leader.joined === 1 ? "" : "s"} joined. Each car's distance is proportional to referrals that joined. The standings table below lists everyone.`
            : "No referrals have joined in this period yet."}
        </desc>

        <defs>
          <pattern id="race-checker" width="10" height="10" patternUnits="userSpaceOnUse">
            <rect width="10" height="10" fill="#f3f2fa" />
            <rect width="5" height="5" fill="#0c0e18" />
            <rect x="5" y="5" width="5" height="5" fill="#0c0e18" />
          </pattern>
          <radialGradient id="race-glow">
            <stop offset="0" stopColor="#f0b429" stopOpacity="0.55" />
            <stop offset="1" stopColor="#f0b429" stopOpacity="0" />
          </radialGradient>
          <pattern id="race-grain" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="3" cy="4" r="0.8" fill="#ffffff" opacity="0.05" />
            <circle cx="15" cy="14" r="0.8" fill="#ffffff" opacity="0.04" />
          </pattern>
        </defs>

        <rect width={VIEW.w} height={VIEW.h} fill="#121524" />
        <rect width={VIEW.w} height={VIEW.h} fill="url(#race-grain)" />

        {/* Kerbs, asphalt, lane line. */}
        <path d={TRACK_D} fill="none" stroke="#e9e7f2" strokeWidth={TRACK_WIDTH + 9} strokeLinecap="round" />
        <path d={TRACK_D} fill="none" stroke="#c64545" strokeWidth={TRACK_WIDTH + 9} strokeDasharray="14 14" />
        <path d={TRACK_D} fill="none" stroke={ASPHALT} strokeWidth={TRACK_WIDTH} strokeLinecap="round" />
        <path d={TRACK_D} fill="none" stroke="#ffffff" strokeOpacity="0.28" strokeWidth="1.6" strokeDasharray="10 13" />

        {/* Start line. The label stays level; only the line follows the track. */}
        <g transform={carTransform(START)}>
          <rect x="-2" y={-TRACK_WIDTH / 2} width="4" height={TRACK_WIDTH} fill="#f3f2fa" />
        </g>
        <text x={n1(START.x)} y={n1(START.y + TRACK_WIDTH / 2 + 22)} className="race-label" textAnchor="middle">
          START
        </text>

        {/* Start lights: five red, then out — go. */}
        <g transform={`translate(${n1(LIGHTS_AT.x)} ${n1(LIGHTS_AT.y)})`} aria-hidden="true" className="race-lights">
          <rect x="-4" y="-12" width="100" height="24" rx="6" fill="#0c0e18" stroke="#2d3148" />
          {[0, 1, 2, 3, 4].map((i) => (
            <circle
              key={i}
              cx={10 + i * 19}
              cy="0"
              r="6.5"
              fill={lights === 6 ? "#1f2a24" : lights > i ? "#e54848" : "#2a2d3e"}
              className={lights > i && lights < 6 ? "race-light-on" : undefined}
            />
          ))}
        </g>

        {/* Finish. */}
        <g transform={carTransform(FINISH)}>
          <rect x="-5" y={-TRACK_WIDTH / 2} width="10" height={TRACK_WIDTH} fill="url(#race-checker)" />
        </g>
        <g transform={`translate(${n1(FLAG_AT.x)} ${n1(FLAG_AT.y)})`} className="race-flag" aria-hidden="true">
          <line x1="0" y1="0" x2="0" y2="-34" stroke="#c9c7d9" strokeWidth="2" />
          <path d="M0 -34 h22 v14 h-22 z" fill="url(#race-checker)" className="race-flag-cloth" />
        </g>
        <text x={n1(FINISH_LABEL_AT.x)} y={n1(FINISH_LABEL_AT.y)} className="race-label" textAnchor="middle">
          FINISH
        </text>

        {/* Cars — back of the field first, so the leader draws on top. */}
        {[...layout.cars].reverse().map((c) => {
          const liv = LIVERY[c.kind];
          const dim = dimmed(c);
          return (
            <g
              key={c.key}
              ref={(el) => {
                if (el) carRefs.current.set(c.key, el);
                else carRefs.current.delete(c.key);
              }}
              transform={carTransform(c.pose)}
              className="race-car"
              opacity={dim ? 0.35 : 1}
              onMouseEnter={() => setHover(c.key)}
            >
              <rect x={-CAR_LENGTH / 2 - 8} y="-14" width={CAR_LENGTH + 16} height="28" fill="transparent" />
              {c.kind === "leader" && <circle r="30" fill="url(#race-glow)" className="race-halo" />}
              <path
                ref={(el) => {
                  if (el) trailRefs.current.set(c.key, el);
                  else trailRefs.current.delete(c.key);
                }}
                d="M-22 -4 L-52 -4 M-22 4 L-46 4 M-24 0 L-60 0"
                stroke="#ffffff"
                strokeWidth="1.6"
                strokeLinecap="round"
                opacity="0"
              />
              <ellipse cx="1" cy="2.5" rx="21" ry="8.5" fill="#000" opacity="0.35" />
              <rect x="-19.5" y="-8.5" width="5" height="17" rx="1.6" fill="#0c0e18" />
              <rect x="-15.5" y="-10" width="8.5" height="4.2" rx="1.6" fill="#0c0e18" />
              <rect x="-15.5" y="5.8" width="8.5" height="4.2" rx="1.6" fill="#0c0e18" />
              <rect x="6.5" y="-9.4" width="7.5" height="3.8" rx="1.6" fill="#0c0e18" />
              <rect x="6.5" y="5.6" width="7.5" height="3.8" rx="1.6" fill="#0c0e18" />
              <path
                d="M-16 -5 C-16 -6.6 -14 -7.2 -11 -7.2 L6 -5.2 C12 -4.2 17 -2.2 19.5 0 C17 2.2 12 4.2 6 5.2 L-11 7.2 C-14 7.2 -16 6.6 -16 5 Z"
                fill={liv.body}
              />
              <path d="M-14 0 L17.5 0" stroke={liv.stripe} strokeWidth="2.4" strokeLinecap="round" />
              <rect x="15.5" y="-7.8" width="4" height="15.6" rx="1.4" fill="#0c0e18" />
              <circle cx="-3" r="3.8" fill={liv.helmet} stroke="#0c0e18" strokeWidth="1" />
            </g>
          );
        })}

        {/* Name tags for the podium and you, one label per tied pack, a
            numbered badge for anyone else. */}
        {layout.cars.map((c) => {
          if (!c.label) return null;
          const tag = layout.tags.get(c.key);
          const liv = LIVERY[c.kind];
          const dim = dimmed(c);
          const tagRef = (el: SVGGElement | null) => {
            if (el) tagRefs.current.set(c.key, el);
            else tagRefs.current.delete(c.key);
          };
          const countRef = (el: SVGTSpanElement | null) => {
            if (el) countRefs.current.set(c.key, el);
            else countRefs.current.delete(c.key);
          };
          if (c.label === "badge" || !tag) {
            return (
              <g
                key={`b-${c.key}`}
                ref={tagRef}
                transform={`translate(${n1(c.pose.x)} ${n1(c.pose.y - 19)})`}
                className="race-tag"
                opacity={dim ? 0.35 : 1}
                onMouseEnter={() => setHover(c.key)}
                aria-hidden="true"
              >
                <g ref={fadeRef(c.key)}>
                  <circle r="8.5" fill="#0c0e1a" stroke="#3a3f5c" />
                  <text y="3.6" textAnchor="middle" className="race-badge-text">
                    {c.rank}
                  </text>
                </g>
              </g>
            );
          }
          if (c.label === "pack") {
            const pk = c.pack!;
            const chip = packChipWidth(pk.from, pk.to);
            const edge = pk.lead ? LIVERY.leader.body : pk.you ? LIVERY.you.body : "#3a3f5c";
            return (
              <g
                key={`p-${c.key}`}
                ref={tagRef}
                transform={`translate(${n1(tagX(c.pose.x, tag.w))} ${n1(c.pose.y + tag.dy)})`}
                className="race-tag"
                opacity={dim ? 0.35 : 1}
                onMouseEnter={() => setHover(pk.id)}
                aria-hidden="true"
              >
                <g ref={fadeRef(c.key)}>
                  <rect x={-tag.w / 2} y="-10" width={tag.w} height="20" rx="10" fill="#0c0e1a" fillOpacity="0.94" stroke={edge} strokeWidth="1.4" />
                  <rect x={-tag.w / 2 + 3} y="-7" width={chip} height="14" rx="7" fill={edge} />
                  <text x={-tag.w / 2 + 3 + chip / 2} y="3.3" textAnchor="middle" className="race-badge-text">
                    {pk.from}–{pk.to}
                  </text>
                  <text x={-tag.w / 2 + 3 + chip + 7} y="3.8" className="race-tag-text">
                    {pk.lead ? "🏆 " : ""}
                    {pk.keys.size} tied on{" "}
                    <tspan ref={countRef} className="race-tag-count">
                      {c.joined}
                    </tspan>
                    {pk.you ? <tspan className="race-tag-count"> · incl. you</tspan> : null}
                  </text>
                </g>
              </g>
            );
          }
          return (
            <g
              key={`t-${c.key}`}
              ref={tagRef}
              transform={`translate(${n1(tagX(c.pose.x, tag.w))} ${n1(c.pose.y + tag.dy)})`}
              className="race-tag"
              opacity={dim ? 0.35 : 1}
              onMouseEnter={() => setHover(c.key)}
              aria-hidden="true"
            >
              <g ref={fadeRef(c.key)}>
                <rect x={-tag.w / 2} y="-10" width={tag.w} height="20" rx="10" fill="#0c0e1a" fillOpacity="0.94" stroke={c.kind === "rest" ? "#3a3f5c" : liv.body} strokeWidth="1.4" />
                <circle cx={-tag.w / 2 + 10} r="6.5" fill={c.kind === "rest" ? "#3a3f5c" : liv.body} />
                <text x={-tag.w / 2 + 10} y="3.3" textAnchor="middle" className="race-badge-text">
                  {c.rank}
                </text>
                <text x={-tag.w / 2 + 22} y="3.8" className="race-tag-text">
                  {c.kind === "leader" ? "🏆 " : ""}
                  {shortName(c.name)}
                  {c.isYou ? " (you)" : ""}{" "}
                  <tspan ref={countRef} className="race-tag-count">
                    {c.joined}
                  </tspan>
                </text>
              </g>
            </g>
          );
        })}

        {/* Confetti when the leader crosses. */}
        {celebrate > 0 && (
          <g key={celebrate} transform={`translate(${n1(FINISH.x)} ${n1(FINISH.y)})`} aria-hidden="true">
            {Array.from({ length: 18 }, (_, i) => {
              const a = (i / 18) * Math.PI * 2;
              const colors = ["#c98500", "#f0b429", "#199e70", "#e9e7f2", "#5b4fd6"];
              return (
                <rect
                  key={i}
                  width="5"
                  height="9"
                  x="-2.5"
                  y="-4.5"
                  rx="1"
                  fill={colors[i % colors.length]}
                  className="race-confetti"
                  style={
                    {
                      "--dx": `${Math.cos(a) * (38 + (i % 3) * 16)}px`,
                      "--dy": `${Math.sin(a) * (38 + (i % 3) * 16) - 18}px`,
                      "--rot": `${(i % 2 ? 1 : -1) * (180 + i * 23)}deg`,
                      animationDelay: `${(i % 4) * 30}ms`,
                    } as React.CSSProperties
                  }
                />
              );
            })}
          </g>
        )}

        {/* Hover: the full line for whichever car — or pack — is under the pointer. */}
        {(hovered || hoveredPack) &&
          (() => {
            const anchor = hovered ?? layout.cars.find((c) => c.key === hoveredPack!.front)!;
            const title = hovered
              ? `${hovered.rank}. ${hovered.name}`
              : `${hoveredPack!.from}–${hoveredPack!.to} · ${hoveredPack!.keys.size} tied on ${hoveredPack!.joined} joined`;
            const shown = hoveredPack ? hoveredPack.names.slice(0, 3).join(", ") : "";
            const more = hoveredPack ? hoveredPack.names.length - 3 : 0;
            const meta = hovered
              ? `${hovered.joined} joined · ${rupees(hovered.earned)} earned`
              : more > 0
                ? `${shown} and ${more} more`
                : shown;
            const w = Math.max(220, Math.max(title.length * 7.2, meta.length * 6.4) + 28);
            return (
              <g
                transform={`translate(${n1(Math.min(Math.max(anchor.pose.x, w / 2 + 8), VIEW.w - w / 2 - 8))} ${n1(Math.max(anchor.pose.y - 60, 30))})`}
                pointerEvents="none"
              >
                <rect x={n1(-w / 2)} y="-22" width={n1(w)} height="44" rx="8" fill="#0c0e1a" stroke="#3a3f5c" />
                <text y="-4" textAnchor="middle" className="race-tip-name">
                  {title}
                </text>
                <text y="13" textAnchor="middle" className="race-tip-meta">
                  {meta}
                </text>
              </g>
            );
          })()}
      </svg>
    </div>
  );
}
