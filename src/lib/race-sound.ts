/**
 * The race's sound, in the browser only.
 *
 * Off unless the person turns it on — this is a work tool, often open in an
 * office — and the choice is remembered on this device. Browsers only let a
 * page make sound after someone has clicked on it, so the audio context is
 * started from the toggle; a race that begins before any click just runs
 * silently.
 *
 * Two recordings, both CC0 (see the LICENSE.txt beside them):
 *   public/sfx/engine-loop.wav — looped, pitched up as the field speeds up
 *   public/sfx/flyby.mp3       — a V8 roaring past: the launch, and the leader
 *                                crossing the line
 * The start-light beeps and the finish chime are simple tones, so they are
 * synthesised here rather than downloaded.
 */

const KEY = "referral-hub:race-sound";
const FILES = { engine: "/sfx/engine-loop.wav", flyby: "/sfx/flyby.mp3" } as const;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buffers: Partial<Record<keyof typeof FILES, AudioBuffer>> = {};
let loading: Promise<void> | null = null;
/** When storage is blocked the toggle still works, for this page. */
let memo: boolean | null = null;
const listeners = new Set<() => void>();
const voices = new Set<{ stop: (fade?: number) => void }>();

function stored(): boolean {
  if (memo !== null) return memo;
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

/** Starts the audio context and loads the engine, once. Safe to call often. */
async function ensure(): Promise<void> {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") await ctx.resume().catch(() => {});
  if (!loading && Object.keys(buffers).length < Object.keys(FILES).length) {
    const c = ctx;
    loading = Promise.all(
      (Object.keys(FILES) as (keyof typeof FILES)[]).map((k) =>
        fetch(FILES[k])
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
          .then((b) => c.decodeAudioData(b))
          .then((b) => {
            buffers[k] = b;
          }),
      ),
    )
      .then(() => {})
      .catch(() => {
        loading = null; // try again next time
      });
  }
  await loading;
}

const live = () => stored() && ctx !== null && master !== null && ctx.state === "running";

function tone(freq: number, at: number, dur: number, peak: number, type: OscillatorType = "sine") {
  if (!ctx || !master) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(master);
  o.start(at);
  o.stop(at + dur + 0.02);
}

export type Engine = { rev: (speed: number) => void; stop: (fade?: number) => void };
const SILENT: Engine = { rev: () => {}, stop: () => {} };

export const raceSound = {
  // For useSyncExternalStore.
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  isOn: stored,
  isOnServer: () => false,

  /** Call from a click: that is what lets the browser start the sound. */
  async set(on: boolean) {
    memo = on;
    try {
      localStorage.setItem(KEY, on ? "on" : "off");
    } catch {
      /* memo covers it */
    }
    listeners.forEach((f) => f());
    if (on) await ensure();
    else for (const v of [...voices]) v.stop(0.15);
  },

  /** Warms up on page load if the person left it on; silent until they click. */
  prime() {
    if (stored()) void ensure();
  },

  /** One red light coming on. */
  light() {
    if (!live()) return;
    tone(620, ctx!.currentTime, 0.16, 0.22, "square");
  },

  /** Lights out. */
  go() {
    if (!live()) return;
    tone(1240, ctx!.currentTime, 0.34, 0.26, "square");
  },

  /** A car roaring past. `pan` from −1 (left) to 1 (right) follows it across the screen. */
  flyby(pan = 0, level = 0.9) {
    const b = buffers.flyby;
    if (!live() || !b) return;
    const c = ctx!;
    const s = c.createBufferSource();
    s.buffer = b;
    const g = c.createGain();
    g.gain.value = level;
    const p = c.createStereoPanner();
    p.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)) * 0.6, c.currentTime);
    s.connect(g).connect(p).connect(master!);
    s.start();
  },

  /** The race is over. */
  finish() {
    if (!live()) return;
    const t = ctx!.currentTime;
    tone(988, t, 0.22, 0.2);
    tone(1319, t + 0.11, 0.42, 0.2);
  },

  /**
   * The field's engine. Two voices a fifth apart read as several cars rather
   * than one. `rev` takes 0 (idle) to 1 (flat out); a low-pass that opens with
   * speed keeps the idle from sounding like a hairdryer.
   */
  engine(): Engine {
    const buffer = buffers.engine;
    if (!live() || !buffer) return SILENT;
    const c = ctx!;
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, c.currentTime);
    out.gain.exponentialRampToValueAtTime(0.16, c.currentTime + 0.25);
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    filter.connect(out).connect(master!);

    const sources = [1, 0.667].map((ratio, i) => {
      const s = c.createBufferSource();
      s.buffer = buffer;
      s.loop = true;
      s.playbackRate.value = 0.75 * ratio;
      const g = c.createGain();
      g.gain.value = i === 0 ? 1 : 0.45;
      s.connect(g).connect(filter);
      s.start();
      return { s, ratio };
    });

    let stopped = false;
    const voice: Engine = {
      rev(speed) {
        if (stopped) return;
        const k = Math.min(1, Math.max(0, speed));
        const now = c.currentTime;
        for (const { s, ratio } of sources) s.playbackRate.setTargetAtTime((0.75 + 1.05 * k) * ratio, now, 0.08);
        filter.frequency.setTargetAtTime(900 + 3200 * k, now, 0.08);
        out.gain.setTargetAtTime(0.1 + 0.14 * k, now, 0.1);
      },
      stop(fade = 0.6) {
        if (stopped) return;
        stopped = true;
        voices.delete(voice);
        const now = c.currentTime;
        out.gain.cancelScheduledValues(now);
        out.gain.setValueAtTime(Math.max(out.gain.value, 0.0001), now);
        out.gain.exponentialRampToValueAtTime(0.0001, now + fade);
        for (const { s } of sources) s.stop(now + fade + 0.05);
      },
    };
    voices.add(voice);
    return voice;
  },
};
