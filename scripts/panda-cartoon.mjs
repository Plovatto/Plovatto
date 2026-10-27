import fs from 'node:fs';
import path from 'node:path';

const [dir] = process.argv.slice(2);

if (!dir) {
  console.error('Uso: node scripts/panda-cartoon.mjs <pasta>');
  process.exit(1);
}

const THEMES = {
  dark: {
    rim: 'stroke:#f3eefc;stroke-opacity:0.28',
    edge: 'stroke:#000000;stroke-opacity:0.45',
    shadow: 0.55,
    furK: ['#554d58', '#38323d', '#26222b'],
    farBlack: '#2e2934',
    shine: '#a69cb4',
    nose: '#141116',
    muzzle: 0.2,
    mouth: 'rgba(42,36,36,0.8)',
    ink: '#cfc8dc',
    puff: '#e9e4f2',
    dirt: '#5d4a3a',
    hole: '#07060c',
  },
  light: {
    rim: 'stroke:#ffffff;stroke-opacity:0',
    edge: 'stroke:#1b1b1f;stroke-opacity:0.38',
    shadow: 0.12,
    furK: ['#3d3634', '#221e1e', '#141212'],
    farBlack: '#0c0a0a',
    shine: '#7d7372',
    nose: '#0f0d0d',
    muzzle: 0.16,
    mouth: 'rgba(42,36,36,0.8)',
    ink: '#57606a',
    puff: '#b9c0c8',
    dirt: '#a68a6d',
    hole: '#3b2f25',
  },
};

const SINE = 'cubic-bezier(0.37,0,0.63,1)';
const SNAP = 'cubic-bezier(0.23,1,0.32,1)';
const SCALE = 1.1;
const SHIFT = 6.7;

function normalize(d) {
  return d
    .replace(/rotate\(0\)/g, 'rotate(0deg)')
    .replace(/translateY\(0\)/g, 'translateY(0px)')
    .replace(/translate\(0,0\)/g, 'translate(0px,0px)');
}

const stripTiming = (d) => d.replace(/;?animation-timing-function:[^;]*/, '');

function parseKeyframes(css) {
  const map = new Map();
  for (const m of css.matchAll(/@keyframes ([\w-]+)\{(.*?\})\}/g)) {
    map.set(
      m[1],
      [...m[2].matchAll(/([\d.]+)%\{([^}]*)\}/g)].map((k) => ({ p: +k[1], d: normalize(k[2]) })),
    );
  }
  return map;
}

function cartoonBob(frames) {
  const ys = frames.map((f) => parseFloat((f.d.match(/translateY\(([-\d.]+)/) || [])[1] || 0));
  return frames.map((f, i) => {
    let t;
    if (ys[i] < 0) t = 'translateY(-1.15px) scale(.985,1.025)';
    else if (
      i > 0 &&
      i < frames.length - 1 &&
      ys[i - 1] < 0 &&
      ys[i + 1] < 0 &&
      frames[i + 1].p - frames[i - 1].p < 0.3
    )
      t = 'translateY(.15px) scale(1.03,.97)';
    else t = 'translateY(0px) scale(1,1)';
    return { p: f.p, d: `transform:${t}` };
  });
}

function smoothStride(frames) {
  const ang = (f) => parseFloat((f.d.match(/rotate\(([-\d.]+)/) || [])[1] || 0);
  return frames.filter((f, i) => {
    if (i === 0 || i === frames.length - 1) return true;
    const a = ang(f),
      p = ang(frames[i - 1]),
      n = ang(frames[i + 1]);
    return !(
      Math.abs(a) < 3 &&
      Math.abs(p) >= 5 &&
      Math.abs(n) >= 5 &&
      Math.sign(p) !== Math.sign(n) &&
      frames[i + 1].p - frames[i - 1].p < 0.3
    );
  });
}

function valueAt(frames, T) {
  let a = null,
    b = null;
  for (const f of frames) {
    if (f.p <= T) a = f;
    if (f.p >= T) {
      b = f;
      break;
    }
  }
  if (!a) return stripTiming(b.d);
  if (!b || a === b) return stripTiming(a.d);
  const ad = stripTiming(a.d),
    bd = stripTiming(b.d);
  if (ad === bd) return ad;
  const sk = (s) => s.replace(/-?\d*\.?\d+/g, '#');
  if (sk(ad) !== sk(bd)) return ad;
  const u = (T - a.p) / (b.p - a.p);
  const bn = bd.match(/-?\d*\.?\d+/g);
  let i = 0;
  return ad.replace(/-?\d*\.?\d+/g, (n) => {
    const v = +n + (+bn[i++] - +n) * u;
    return +v.toFixed(3) + '';
  });
}

function insertGaps(K, names, D, gaps) {
  const D2 = D + gaps.reduce((s, g) => s + g.G, 0);
  const mapMs = (ms) => ms + gaps.filter((g) => (g.T * D) / 100 < ms).reduce((s, g) => s + g.G, 0);
  const pct = (ms) => +((ms / D2) * 100).toFixed(4);
  for (const name of names) {
    const fr = K.get(name);
    const unshifted = new Map();
    if (/^[ce]\d/.test(name)) {
      for (const g of gaps) {
        if (steadyAt(fr, g.T)) continue;
        for (let i = fr.findIndex((f) => f.p > g.T); i >= 0 && i < fr.length; i++) {
          if (!unshifted.has(fr[i])) unshifted.set(fr[i], new Set());
          unshifted.get(fr[i]).add(g);
          if (steadyAt(fr, (fr[i].p + (fr[i + 1] ? fr[i + 1].p : 100)) / 2)) break;
        }
      }
    }
    const shift = (f) =>
      (f.p * D) / 100 +
      gaps.filter((g) => g.T < f.p && !(unshifted.get(f) || new Set()).has(g)).reduce((s, g) => s + g.G, 0);
    const out = fr.map((f) => ({ p: pct(shift(f)), d: f.d }));
    for (const g of gaps) {
      const before = [...fr].reverse().find((f) => f.p < g.T);
      const after = fr.find((f) => f.p > g.T);
      const at = fr.find((f) => f.p === g.T);
      const v = valueAt(fr, g.T);
      const steady = !at && before && after && stripTiming(before.d) === v && stripTiming(after.d) === v;
      if (steady || [...unshifted.values()].some((set) => set.has(g))) continue;
      const start = pct(mapMs((g.T * D) / 100));
      if (at) {
        const o = out.find((f) => f.p === start && f.d === at.d);
        if (o) o.d = stripTiming(o.d);
        out.push({ p: pct(mapMs((g.T * D) / 100) + g.G), d: at.d });
      } else {
        out.push({ p: start, d: v }, { p: pct(mapMs((g.T * D) / 100) + g.G), d: v });
      }
    }
    out.sort((x, y) => x.p - y.p);
    K.set(name, out);
  }
  return { D2, mapMs };
}

const serialize = (name, frames) =>
  `@keyframes ${name}{${frames.map((f) => `${(+f.p).toFixed(4)}%{${f.d}}`).join('')}}`;
const T = (x = 0, y = 0, r = 0, sx = 1, sy = sx) =>
  `transform:translate(${x}px,${y}px) rotate(${r}deg) scale(${sx},${sy})`;
const O = (op, x = 0, y = 0, s = 1, r = 0) =>
  `opacity:${op};transform:translate(${x}px,${y}px) rotate(${r}deg) scale(${s})`;
const snap = (d) => `${d};animation-timing-function:${SNAP}`;
const ID = T();

function legs(frames, which = ['a-fn', 'a-ff', 'a-hn', 'a-hf']) {
  return Object.fromEntries(which.map((l) => [l, frames]));
}

function zz(start) {
  return [
    [start - 0.001, O(0, 0, 0, 0.6)],
    [start + 0.03, O(1, 1, -1.5, 0.9)],
    [start + 0.12, O(1, 3, -5, 1.1, 8)],
    [start + 0.18, O(0, 4, -8, 1.2, -6)],
  ];
}

function orbit(t0, t1, phase, cx, cy) {
  const n = 10,
    out = [[t0 - 0.001, O(0, cx, cy, 0.5)]];
  for (let i = 0; i <= n; i++) {
    const a = phase + (i / n) * Math.PI * 4,
      t = t0 + ((t1 - t0) * i) / n;
    out.push([
      t,
      O(
        i === n ? 0 : 1,
        +(cx + Math.cos(a) * 4.2).toFixed(2),
        +(cy + Math.sin(a) * 1.3).toFixed(2),
        +(0.9 + 0.2 * Math.sin(a)).toFixed(2),
        i * 40,
      ),
    ]);
  }
  return out;
}

function rise(t0, t1, x, y, dx, dy, s = 1) {
  const at = (k) => t0 + (t1 - t0) * k;
  return [
    [t0 - 0.001, O(0, x, y, 0.5 * s)],
    [at(0.2), O(1, x + dx * 0.2, y + dy * 0.2, s)],
    [at(0.75), O(1, x + dx * 0.8, y + dy * 0.8, 1.05 * s)],
    [t1, O(0, x + dx, y + dy, 1.1 * s)],
  ];
}

const chew = (from, to, a, b, step = 0.08) => {
  const out = [];
  for (let t = from; t < to; t += step) out.push([t, a], [t + step / 2, b]);
  return out;
};

const ACTS = [
  {
    id: 'fareja',
    G: 3000,
    minRow: 8,
    layers: {
      'a-head': [
        [0.1, T(0.4, 2.6, 22)],
        [0.2, T(0.4, 2.6, 17)],
        [0.28, T(0.4, 2.6, 22)],
        [0.36, T(0.4, 2.6, 17)],
        [0.44, T(0.4, 2.6, 22)],
        [0.54, snap(T(0, -0.5, -9))],
        [0.78, T(0, -0.5, -9)],
        [0.9, ID],
      ],
      'a-ear': [
        [0.52, ID],
        [0.56, snap(T(0, 0, -22))],
        [0.82, T(0, 0, -16)],
        [0.9, ID],
      ],
      'a-eye': [
        [0.52, ID],
        [0.56, snap(T(0, 0, 0, 1.3, 1.3))],
        [0.8, T(0, 0, 0, 1.2, 1.2)],
        [0.88, ID],
      ],
      'a-body': [
        [0.53, ID],
        [0.58, snap(T(0, -1.6, 0, 0.97, 1.04))],
        [0.66, T(0, 0, 0, 1.03, 0.97)],
        [0.72, ID],
      ],
      'a-ex': [
        [0.54, O(0, 13, -14.5, 0.4)],
        [0.6, snap(O(1, 13, -16.5, 1.15))],
        [0.66, O(1, 13, -16, 1)],
        [0.84, O(1, 13, -16, 1)],
        [0.92, O(0, 13, -17, 0.8)],
      ],
      'a-du1': [
        [0.14, O(0, 21, 8.4, 0.4)],
        [0.24, O(0.7, 23.5, 7.6, 0.9)],
        [0.4, O(0, 25.5, 6.6, 1.2)],
      ],
      'a-du2': [
        [0.26, O(0, 21, 8.6, 0.4)],
        [0.36, O(0.7, 23, 9.2, 0.8)],
        [0.5, O(0, 25, 8.4, 1.1)],
      ],
    },
  },
  {
    id: 'soneca',
    G: 7200,
    minRow: 8,
    layers: {
      'a-body': [
        [0.1, T(0, 3.2, 0, 1.02, 0.97)],
        [0.3, T(0, 3.2, 0, 1.035, 0.955)],
        [0.42, T(0, 3.2, 0, 1.01, 0.985)],
        [0.54, T(0, 3.2, 0, 1.035, 0.955)],
        [0.66, T(0, 3.2, 0, 1.01, 0.985)],
        [0.78, T(0, 3.2, 0, 1.03, 0.96)],
        [0.86, T(0, 3.2)],
        [0.93, T(0, -0.6, 0, 0.98, 1.03)],
      ],
      ...legs([
        [0.1, T(0, 0, 0, 1, 0.38)],
        [0.86, T(0, 0, 0, 1, 0.38)],
        [0.95, ID],
      ]),
      'a-head': [
        [0.12, T(0.4, 1.8, 11)],
        [0.8, T(0.4, 1.8, 11)],
        [0.86, T(0, -0.4, -9)],
        [0.93, ID],
      ],
      'a-eye': [
        [0.08, ID],
        [0.13, T(0, 0, 0, 1, 0.08)],
        [0.82, T(0, 0, 0, 1, 0.08)],
        [0.86, ID],
      ],
      'a-ear': [
        [0.15, T(0, 0, 12)],
        [0.8, T(0, 0, 12)],
        [0.86, T(0, 0, -14)],
        [0.9, ID],
      ],
      'a-shadow': [
        [0.1, T(0, 0, 0, 1.08, 1.2)],
        [0.86, T(0, 0, 0, 1.08, 1.2)],
        [0.95, ID],
      ],
      'a-z1': [...zz(0.2), ...zz(0.5)],
      'a-z2': [...zz(0.3), ...zz(0.6)],
      'a-z3': [...zz(0.4), ...zz(0.7)],
    },
  },
  {
    id: 'espirro',
    G: 4800,
    minRow: 24,
    layers: {
      'a-bf': [
        [0.05, O(1, 28, -20, 0.5)],
        [0.13, O(1, 23, -13, 0.5, 10)],
        [0.21, O(1, 26, -10, 0.5, -8)],
        [0.29, O(1, 22, -8.4, 0.5, 6)],
        [0.34, O(1, 20.9, -6.2, 0.5)],
        [0.56, O(1, 20.9, -6.2, 0.5)],
        [0.62, snap(O(1, 25, -13, 0.5, -15))],
        [0.72, O(1, 31, -21, 0.5, 10)],
        [0.8, O(0, 35, -25, 0.5)],
      ],
      'a-head': [
        [0.3, T(0, 0, -6)],
        [0.5, T(-0.3, -0.6, -15)],
        [0.58, snap(T(0.6, 0.9, 10))],
        [0.66, T(0, 0, 3)],
        [0.76, ID],
      ],
      'a-jaw': [
        [0.48, T(0, 0, 12)],
        [0.58, snap(T(0, 0, 34))],
        [0.68, ID],
      ],
      'a-eye': [
        [0.3, T(0, 0, 0, 1.15, 1.15)],
        [0.46, T(0, 0, 0, 1, 0.25)],
        [0.58, T(0, 0, 0, 1, 0.06)],
        [0.7, ID],
      ],
      'a-ear': [
        [0.56, ID],
        [0.6, snap(T(0, 0, -26))],
        [0.65, T(0, 0, 14)],
        [0.7, T(0, 0, -6)],
        [0.76, ID],
      ],
      'a-body': [
        [0.56, ID],
        [0.6, snap(T(-0.8, 0, 0, 1.05, 0.95))],
        [0.7, ID],
      ],
      'a-pf1': [
        [0.579, O(0, 21.6, -4, 0.4)],
        [0.62, O(0.9, 24.5, -4.6, 1.1)],
        [0.78, O(0, 27.5, -5.4, 1.6)],
      ],
      'a-pf2': [
        [0.579, O(0, 21.6, -3.6, 0.4)],
        [0.63, O(0.8, 25, -2.4, 0.9)],
        [0.8, O(0, 28.5, -1.6, 1.4)],
      ],
      'a-pf3': [
        [0.579, O(0, 21.6, -4.4, 0.3)],
        [0.64, O(0.7, 23.8, -6.8, 0.8)],
        [0.82, O(0, 26, -9, 1.3)],
      ],
    },
  },
  {
    id: 'cambalhota',
    G: 3300,
    minRow: 40,
    layers: {
      'a-body': [
        [0.14, T(0, 1.3, 0, 1.08, 0.9)],
        [0.3, T(0, -7.5, 140, 0.96, 1.04)],
        [0.45, T(0, -5.5, 270)],
        [0.58, snap(T(0, 0.6, 360, 1.1, 0.88))],
        [0.68, T(0, 0, 360, 0.97, 1.03)],
        [0.78, T(0, 0, 360)],
        [0.999, T(0, 0, 360)],
      ],
      ...legs([
        [0.18, ID],
        [0.28, T(0, 0, 0, 1, 0.55)],
        [0.52, T(0, 0, 0, 1, 0.55)],
        [0.6, ID],
      ]),
      'a-head': [
        [0.25, T(0, 0, 14)],
        [0.55, T(0, 0, 14)],
        [0.64, T(0, 0, -7)],
        [0.72, T(0, 0, 7)],
        [0.8, T(0, 0, -6)],
        [0.88, T(0, 0, 5)],
        [0.96, ID],
      ],
      'a-eye': [
        [0.6, ID],
        [0.64, T(0, 0, 0, 1, 0.3)],
        [0.92, T(0, 0, 0, 1, 0.3)],
        [0.97, ID],
      ],
      'a-shadow': [
        [0.14, T(0, 0, 0, 1.1, 1)],
        [0.32, T(0, 0, 0, 0.55, 0.7)],
        [0.5, T(0, 0, 0, 0.7, 0.8)],
        [0.6, T(0, 0, 0, 1.12, 1.1)],
        [0.75, ID],
      ],
      'a-st1': orbit(0.62, 0.97, 0, 13, -13.5),
      'a-st2': orbit(0.62, 0.97, Math.PI, 13, -13.5),
      'a-du1': [
        [0.579, O(0, -8, 10, 0.4)],
        [0.64, O(0.8, -11, 9.4, 1)],
        [0.78, O(0, -13.5, 8.6, 1.4)],
      ],
      'a-du2': [
        [0.579, O(0, 8, 10, 0.4)],
        [0.64, O(0.8, 11, 9.4, 1)],
        [0.78, O(0, 13.5, 8.6, 1.4)],
      ],
    },
  },
  {
    id: 'em-pe',
    G: 4400,
    minRow: 40,
    layers: {
      'a-rear': [
        [0.07, T(0, 0, 5)],
        [0.18, T(0, 0, -56)],
        [0.8, T(0, 0, -56)],
        [0.9, snap(T(0, 0, 3))],
        [0.96, ID],
      ],
      'a-head': [
        [0.18, T(0, 0, 44)],
        [0.34, T(0, 0, 52)],
        [0.48, T(0, 0, 38)],
        [0.62, T(0, 0, 49)],
        [0.8, T(0, 0, 44)],
        [0.9, ID],
      ],
      'a-hn': [
        [0.18, T(0, 0, 56)],
        [0.8, T(0, 0, 56)],
        [0.9, ID],
      ],
      'a-hf': [
        [0.18, T(0, 0, 54)],
        [0.8, T(0, 0, 54)],
        [0.9, ID],
      ],
      'a-ff': [
        [0.18, T(0, 0, 32)],
        [0.8, T(0, 0, 32)],
        [0.9, ID],
      ],
      'a-fn': [
        [0.18, T(0, 0, 28)],
        [0.3, T(0, 0, -72)],
        [0.38, T(0, 0, -38)],
        [0.46, T(0, 0, -76)],
        [0.54, T(0, 0, -38)],
        [0.62, T(0, 0, -74)],
        [0.72, T(0, 0, 26)],
        [0.8, T(0, 0, 28)],
        [0.9, ID],
      ],
      'a-tail': [
        [0.2, T(0, 0, 20)],
        [0.3, T(0, 0, -20)],
        [0.4, T(0, 0, 20)],
        [0.5, T(0, 0, -20)],
        [0.6, T(0, 0, 20)],
        [0.7, ID],
      ],
      'a-eye': [
        [0.5, ID],
        [0.53, T(0, 0, 0, 1, 0.08)],
        [0.56, ID],
      ],
      'a-shadow': [
        [0.18, T(0, 0, 0, 0.7, 1)],
        [0.8, T(0, 0, 0, 0.7, 1)],
        [0.9, ID],
      ],
    },
  },
  {
    id: 'bambu',
    G: 6000,
    minRow: 8,
    layers: {
      'a-sit': [
        [0.1, T(0, 1.8, -17)],
        [0.88, T(0, 1.8, -17)],
        [0.97, ID],
      ],
      'a-hn': [
        [0.1, T(0, 0, -62)],
        [0.88, T(0, 0, -62)],
        [0.97, ID],
      ],
      'a-hf': [
        [0.1, T(0, 0, -58)],
        [0.88, T(0, 0, -58)],
        [0.97, ID],
      ],
      'a-ff': [
        [0.1, T(0, 0, 17)],
        [0.88, T(0, 0, 17)],
        [0.97, ID],
      ],
      'a-fn': [
        [0.1, T(0, 0, 17)],
        [0.2, T(0, 0, -96)],
        [0.84, T(0, 0, -96)],
        [0.92, T(0, 0, 17)],
        [0.97, ID],
      ],
      'a-bb': [
        [0.13, O(0)],
        [0.19, O(1)],
        [0.84, O(1)],
        [0.88, O(0)],
      ],
      'a-bbx': [
        [0.2, ID],
        [0.82, T(0, 0, 0, 0.35, 1)],
        [0.999, T(0, 0, 0, 0.35, 1)],
      ],
      'a-head': [[0.2, T(0, 0, 7)], ...chew(0.28, 0.8, T(0, 0, 10), T(0, 0, 6)), [0.86, T(0, 0, 7)], [0.95, ID]],
      'a-jaw': [[0.24, ID], ...chew(0.28, 0.8, T(0, 0, 26), T(0, 0, 3)), [0.84, ID]],
      'a-eye': [
        [0.46, ID],
        [0.5, T(0, 0, 0, 1, 0.15)],
        [0.6, T(0, 0, 0, 1, 0.15)],
        [0.64, ID],
      ],
      'a-lf1': [
        [0.3, O(0, 19, -1, 0.6)],
        [0.34, O(1, 19.5, 0, 1, 30)],
        [0.5, O(0, 21, 9, 1, 160)],
        [0.56, O(0, 19, -1, 0.6)],
        [0.6, O(1, 19.5, 0, 1, 20)],
        [0.76, O(0, 22, 9, 1, 200)],
      ],
      'a-lf2': [
        [0.42, O(0, 18.5, -1, 0.6)],
        [0.46, O(1, 18, 0, 1, -20)],
        [0.62, O(0, 16.5, 9, 1, -170)],
        [0.7, O(0, 18.5, -1, 0.6)],
        [0.74, O(1, 18, 0, 1, -30)],
        [0.88, O(0, 16, 9, 1, -190)],
      ],
    },
  },
  {
    id: 'danca',
    G: 3600,
    minRow: 24,
    layers: {
      'a-body': [
        [0.06, T(0, 0.8, 0, 1.06, 0.94)],
        [0.17, T(0, -3.4, -5, 0.96, 1.05)],
        [0.27, T(0, 0.7, 0, 1.07, 0.93)],
        [0.37, T(0, -3.8, 5, 0.96, 1.05)],
        [0.47, T(0, 0.7, 0, 1.07, 0.93)],
        [0.6, T(0, -4.4, -4, 0.95, 1.06)],
        [0.72, T(0, 0.8, 0, 1.08, 0.92)],
        [0.82, ID],
      ],
      ...legs([
        [0.08, ID],
        [0.17, T(0, 0, 0, 1, 0.75)],
        [0.26, ID],
        [0.37, T(0, 0, 0, 1, 0.75)],
        [0.46, ID],
        [0.6, T(0, 0, 0, 1, 0.75)],
        [0.7, ID],
      ]),
      'a-tail': [...chew(0.05, 0.8, T(0, 0, 30), T(0, 0, -30), 0.1), [0.86, ID]],
      'a-head': [
        [0.12, T(0, 0, -6)],
        [0.32, T(0, 0, 6)],
        [0.52, T(0, 0, -6)],
        [0.72, T(0, 0, 5)],
        [0.85, ID],
      ],
      'a-eye': [
        [0.08, ID],
        [0.12, T(0, 0, 0, 1, 0.3)],
        [0.8, T(0, 0, 0, 1, 0.3)],
        [0.85, ID],
      ],
      'a-shadow': [
        [0.17, T(0, 0, 0, 0.7, 0.8)],
        [0.27, ID],
        [0.37, T(0, 0, 0, 0.7, 0.8)],
        [0.47, ID],
        [0.6, T(0, 0, 0, 0.65, 0.75)],
        [0.72, ID],
      ],
      'a-ht1': rise(0.18, 0.6, 14, -14, 2, -9),
      'a-ht2': rise(0.42, 0.86, 10, -13, -2.5, -9, 0.8),
    },
  },
  {
    id: 'coceira',
    G: 3900,
    minRow: 8,
    layers: {
      'a-sit': [
        [0.12, T(0, 1.8, -17)],
        [0.86, T(0, 1.8, -17)],
        [0.96, ID],
      ],
      'a-hf': [
        [0.12, T(0, 0, -58)],
        [0.86, T(0, 0, -58)],
        [0.96, ID],
      ],
      'a-fn': [
        [0.12, T(0, 0, 17)],
        [0.86, T(0, 0, 17)],
        [0.96, ID],
      ],
      'a-ff': [
        [0.12, T(0, 0, 17)],
        [0.86, T(0, 0, 17)],
        [0.96, ID],
      ],
      'a-hn': [
        [0.12, T(0, 0, -62)],
        [0.2, T(0, 0, -100)],
        ...chew(0.23, 0.74, T(0, 0, -116), T(0, 0, -86), 0.064),
        [0.78, T(0, 0, -62)],
        [0.96, ID],
      ],
      'a-head': [
        [0.2, T(0, 0, 13)],
        ...chew(0.26, 0.74, T(0, 0, 15), T(0, 0, 11), 0.12),
        [0.8, T(0, 0, 4)],
        [0.92, ID],
      ],
      'a-eye': [
        [0.18, ID],
        [0.23, T(0, 0, 0, 1, 0.18)],
        [0.76, T(0, 0, 0, 1, 0.18)],
        [0.8, ID],
      ],
      'a-ear': [...chew(0.25, 0.74, T(0, 0, 8), T(0, 0, -10), 0.12), [0.8, ID]],
      'a-fl1': rise(0.3, 0.7, 6, -4, 3, -8, 0.9),
      'a-fl2': rise(0.45, 0.82, 4, -3, -2, -7, 0.7),
    },
  },
  {
    id: 'espreguica',
    G: 3700,
    minRow: 8,
    layers: {
      'a-rear': [
        [0.2, T(0, 0, 13)],
        [0.66, T(0, 0, 13)],
        [0.8, ID],
      ],
      'a-fn': [
        [0.2, T(0, 0, -48)],
        [0.66, T(0, 0, -48)],
        [0.8, ID],
      ],
      'a-ff': [
        [0.2, T(0, 0, -44)],
        [0.66, T(0, 0, -44)],
        [0.8, ID],
      ],
      'a-hn': [
        [0.2, T(0, 0, -13)],
        [0.66, T(0, 0, -13)],
        [0.8, ID],
      ],
      'a-hf': [
        [0.2, T(0, 0, -13)],
        [0.66, T(0, 0, -13)],
        [0.8, ID],
      ],
      'a-head': [
        [0.2, T(0, 0, -18)],
        [0.36, T(0, 0, -30)],
        [0.58, T(0, 0, -30)],
        [0.68, T(0, 0, -8)],
        [0.82, ID],
      ],
      'a-jaw': [
        [0.28, T(0, 0, 8)],
        [0.38, T(0, 0, 40)],
        [0.56, T(0, 0, 40)],
        [0.64, ID],
      ],
      'a-eye': [
        [0.3, ID],
        [0.36, T(0, 0, 0, 1, 0.06)],
        [0.6, T(0, 0, 0, 1, 0.06)],
        [0.66, ID],
      ],
      'a-tail': [
        [0.2, T(0, 0, 25)],
        [0.3, T(0, 0, -15)],
        [0.4, T(0, 0, 25)],
        [0.5, T(0, 0, -15)],
        [0.6, T(0, 0, 20)],
        [0.72, ID],
      ],
      'a-body': [
        [0.2, ID],
        [0.4, T(0, 0, 0, 1.04, 0.97)],
        [0.6, T(0, 0, 0, 1.04, 0.97)],
        [0.75, ID],
      ],
    },
  },
];

const S = (op, x = 0, y = 0, sx = 1, sy = sx) =>
  `opacity:${op};transform:translate(${x}px,${y}px) rotate(0deg) scale(${sx},${sy})`;
const pebble = (dx, dy, t0) => [
  [t0 - 0.001, O(0, 2, 11, 0.5)],
  [t0 + 0.04, O(1, 2 + dx * 0.4, 11 + dy, 1)],
  [t0 + 0.14, O(1, 2 + dx * 0.8, 11 + dy * 0.7, 1, 120)],
  [t0 + 0.26, O(0, 2 + dx, 12.5, 0.8, 240)],
];
const sparkle = (x, y, t0) => [
  [t0 - 0.001, O(0, x, y, 0.4)],
  [t0 + 0.06, snap(O(1, x, y, 1.25, 45))],
  [t0 + 0.16, O(1, x, y - 0.6, 0.9, 90)],
  [t0 + 0.26, O(0, x, y - 1.2, 0.4, 135)],
];

const SURGE = {
  id: 'surgir',
  G: 2800,
  layers: {
    'a-surge': [
      [0, S(0, 0, 28, 0.9, 1.1)],
      [0.3, S(1, 0, 28, 0.9, 1.1)],
      [0.42, snap(S(1, 0, -8, 0.9, 1.12))],
      [0.52, S(1, 0, -10)],
      [0.64, S(1, 0, 0.8, 1.12, 0.86)],
      [0.72, S(1, 0, -1, 0.96, 1.05)],
      [0.8, S(1)],
    ],
    'a-hole': [
      [0.04, O(0, 0, 0, 0.3)],
      [0.16, O(1, 0, 0, 1)],
      [0.24, O(1, 0, 0, 1.08)],
      [0.28, O(1, 0, 0, 0.97)],
      [0.32, O(1, 0, 0, 1.06)],
      [0.6, O(1, 0, 0, 1)],
      [0.76, O(0, 0, 0, 0.4)],
    ],
    'a-dirt1': pebble(-9, -8, 0.33),
    'a-dirt2': pebble(8, -9, 0.35),
    'a-dirt3': pebble(-5, -11, 0.38),
    'a-dirt4': pebble(11, -6, 0.4),
    ...legs([
      [0.38, ID],
      [0.44, T(0, 0, 0, 1, 0.7)],
      [0.56, T(0, 0, 0, 1, 0.7)],
      [0.62, ID],
    ]),
    'a-ear': [
      [0.42, ID],
      [0.46, T(0, 0, 22)],
      [0.56, T(0, 0, -18)],
      [0.66, T(0, 0, 10)],
      [0.74, ID],
    ],
    'a-eye': [
      [0.32, ID],
      [0.36, T(0, 0, 0, 1, 0.08)],
      [0.58, T(0, 0, 0, 1, 0.08)],
      [0.64, ID],
    ],
    'a-head': [
      [0.74, ID],
      [0.78, T(0, 0, -9)],
      [0.82, T(0, 0, 9)],
      [0.86, T(0, 0, -6)],
      [0.9, T(0, 0, 4)],
      [0.95, ID],
    ],
    'a-tail': [
      [0.8, ID],
      [0.84, T(0, 0, 26)],
      [0.88, T(0, 0, -20)],
      [0.92, T(0, 0, 14)],
      [0.96, ID],
    ],
    'a-shadow': [
      [0, T(0, 0, 0, 0.2, 0.2)],
      [0.4, T(0, 0, 0, 0.35, 0.45)],
      [0.52, T(0, 0, 0, 0.5, 0.55)],
      [0.64, T(0, 0, 0, 1.12, 1.05)],
      [0.76, ID],
    ],
    'a-spk1': sparkle(16, -15, 0.66),
    'a-spk2': sparkle(23, -9, 0.72),
    'a-spk3': sparkle(6, -16, 0.78),
  },
};

const PROP_IDLE = {
  'a-z1': O(0),
  'a-z2': O(0),
  'a-z3': O(0),
  'a-bf': O(0, 30, -22, 0.5),
  'a-pf1': O(0),
  'a-pf2': O(0),
  'a-pf3': O(0),
  'a-st1': O(0),
  'a-st2': O(0),
  'a-du1': O(0),
  'a-du2': O(0),
  'a-bb': O(0),
  'a-lf1': O(0),
  'a-lf2': O(0),
  'a-ht1': O(0),
  'a-ht2': O(0),
  'a-fl1': O(0),
  'a-fl2': O(0),
  'a-ex': O(0),
  'a-hole': O(0),
  'a-dirt1': O(0),
  'a-dirt2': O(0),
  'a-dirt3': O(0),
  'a-dirt4': O(0),
  'a-spk1': O(0),
  'a-spk2': O(0),
  'a-spk3': O(0),
  'a-surge': S(1),
};

const ORIGINS = {
  'a-body': '0px -1px',
  'a-rear': '-6.4px 10.6px',
  'a-sit': '-6px 3px',
  'a-head': '9.3px -1.5px',
  'a-fn': '6px 1px',
  'a-ff': '8.4px 0.7px',
  'a-hn': '-6.4px 1.5px',
  'a-hf': '-4px 1.2px',
  'a-shadow': '2px 11.4px',
  'a-bb': '6.9px 10.2px',
  'a-bbx': '6.9px 10.2px',
  'a-surge': '0px 10.6px',
  'a-hole': '2px 11.4px',
};

function steadyAt(frames, T) {
  const before = [...frames].reverse().find((f) => f.p < T);
  const after = frames.find((f) => f.p > T);
  const hidden = (d) => /opacity:0(;|$)/.test(d);
  return !before || !after || stripTiming(before.d) === stripTiming(after.d) || (hidden(before.d) && hidden(after.d));
}

function pickStops(K) {
  const mv = K.get('move');
  const holds = [];
  for (let i = 0; i < mv.length - 1; i++) {
    if (mv[i].d !== mv[i + 1].d || mv[i + 1].p - mv[i].p < 0.2) continue;
    const [x, y] = mv[i].d
      .match(/translate\(([-\d.]+)px,([-\d.]+)px/)
      .slice(1)
      .map(Number);
    if (x < 40 || x > 360 || mv[i].p < 2 || mv[i + 1].p > 97 || (mv[i + 1].p > 16.8 && mv[i].p < 20)) continue;
    const quiet = (Tp) =>
      /rotate\(0deg\)/.test(valueAt(K.get('jaw'), Tp)) && steadyAt(K.get('head'), Tp) && steadyAt(K.get('jaw'), Tp);
    for (let Tp = mv[i + 1].p; Tp > mv[i].p + 0.02; Tp = +(Tp - 0.01).toFixed(4)) {
      if (quiet(Tp)) {
        holds.push({ T: Tp, x, y });
        break;
      }
    }
  }
  const gaps = [];
  ACTS.forEach((act, i) => {
    const target = ((i + 0.5) / ACTS.length) * 100;
    const pick = holds
      .filter((h) => h.y >= act.minRow && !gaps.some((g) => Math.abs(g.T - h.T) < 3))
      .sort((a, b) => Math.abs(a.T - target) - Math.abs(b.T - target))[0];
    if (!pick) throw new Error('sem parada para ' + act.id);
    gaps.push({ T: pick.T, G: act.G, act });
  });
  return gaps.sort((a, b) => a.T - b.T);
}

function activityCss(gaps, D, D2, mapMs) {
  const layers = new Map();
  for (const g of gaps) {
    const s = mapMs((g.T * D) / 100);
    for (const [name, frames] of Object.entries(g.act.layers)) {
      if (!layers.has(name)) layers.set(name, []);
      const idle = PROP_IDLE[name] || ID;
      const list = layers.get(name);
      list.push({ ms: s, d: idle });
      for (const [f, d] of frames) list.push({ ms: s + f * g.G, d });
      list.push({ ms: s + g.G, d: idle });
    }
  }
  let css = '';
  for (const [name, list] of layers) {
    const idle = PROP_IDLE[name] || ID;
    list.sort((a, b) => a.ms - b.ms);
    css +=
      serialize(name, [
        { p: 0, d: idle },
        ...list.map((e) => ({ p: (e.ms / D2) * 100, d: e.d })),
        { p: 100, d: idle },
      ]) + '\n';
  }
  const names = [...layers.keys()];
  css += `.${names.join(',.')}{animation-duration:${D2.toFixed(2)}ms;animation-iteration-count:infinite;animation-timing-function:${SINE}}\n`;
  css +=
    names
      .map(
        (n) =>
          `.${n}{animation-name:${n}${ORIGINS[n] ? `;transform-box:view-box;transform-origin:${ORIGINS[n]}` : ''}}`,
      )
      .join('\n') + '\n';
  return css;
}

const LEG = {
  front:
    'M3.4 1.2C3.6 -0.4 8.4 -0.4 8.6 1.2C8.7 4 8.9 7 9.2 8.8C9.5 9.8 9.1 10.6 7.9 10.6L5.9 10.6C4.7 10.6 3.9 10 3.8 8.8C3.7 7 3.6 4 3.4 1.2Z',
  hind: 'M-9.6 2.2C-9.4 0.2 -3.4 0.2 -3.2 2.2C-3.2 4 -3.4 7 -3.1 8.9C-2.9 9.9 -3.3 10.6 -4.4 10.6L-6.4 10.6C-7.7 10.6 -8.7 10 -8.9 8.6C-9.2 6.4 -10 4.4 -9.6 2.2Z',
};

const LEG_ORIGIN = { fn: '6px 1px', ff: '8.4px 0.7px', hn: '-6.4px 1.5px', hf: '-4px 1.2px' };

function leg(side, id, kind, dx, dy, extra = '') {
  const pawX = kind === 'front' ? 6.9 : -5.4;
  return (
    `<g class="leg ${side} ${id}" style="transform-origin:${LEG_ORIGIN[id]}"><g class="a-${id}"><g transform="translate(${dx} ${dy})">` +
    `<path d="${LEG[kind]}"/><ellipse cx="${pawX}" cy="10.1" rx="${kind === 'front' ? 2.9 : 3}" ry="1.1"/>` +
    (side === 'near'
      ? `<circle class="paw-pad" cx="${pawX + 1.6}" cy="10.2" r=".32"/><circle class="paw-pad" cx="${pawX + 0.6}" cy="10.5" r=".32"/>`
      : '') +
    `</g>${extra}</g></g>`
  );
}

const BODY =
  'M-12.6 -0.8C-12.9 -6.4 -9.2 -9.3 -3.6 -9.5C1.4 -9.7 5.6 -10.3 8.8 -8.9C11.6 -7.6 12.3 -3.4 11.6 0.4C10.9 4 8 5.9 2.4 6.1C-3.8 6.3 -9.4 5.7 -11.4 3.2C-12.2 2.2 -12.6 0.9 -12.6 -0.8Z';
const HEAD =
  'M7.6 -0.9C6.4 -3.4 6.6 -7.6 9 -9.6C11.2 -11.6 14.8 -11.4 16.8 -9.4C17.8 -8.4 18.2 -7.1 18.9 -6.1C19.7 -5.3 21 -5.2 21.5 -4.3C21.9 -3.5 21.4 -2.6 20.4 -2.3C19.3 -2 18.2 -1.4 17 -0.9C15.2 -0.1 13.4 0.4 11.6 0.2C10 0 8.6 -0.2 7.6 -0.9Z';
const HEART = 'M0 1.7C-2.6 0 -1.9 -2.3 0 -1.1C1.9 -2.3 2.6 0 0 1.7Z';
const STAR = 'M0 -1.6L.45 -.45L1.6 0L.45 .45L0 1.6L-.45 .45L-1.6 0L-.45 -.45Z';
const WINGS =
  '<path d="M0 0C-2.6 -4.2 -6.2 -2.6 -4.6 0.2C-6 2.6 -2.8 4.2 0 0Z" fill="#fe428e"/><path d="M0 0C2.6 -4.2 6.2 -2.6 4.6 0.2C6 2.6 2.8 4.2 0 0Z" fill="#fe428e"/>';
const BAMBOO = `<g class="a-bb"><g class="a-bbx">
  <rect x="1.4" y="9.6" width="11" height="1.15" rx=".5" fill="#7cb342"/>
  <path d="M4.4 9.6v1.15M8.2 9.6v1.15" stroke="#4e7d1f" stroke-width=".35"/>
  <path d="M12.2 10.1C13.6 9 15.2 9.1 15.8 9.6C14.8 10.4 13.4 10.6 12.2 10.1Z" fill="#8bc34a"/>
  <path d="M12 10.2C13 11.4 14.4 11.8 15.2 11.6C14.6 10.8 13.2 10.2 12 10.2Z" fill="#689f38"/>
</g></g>`;

function pandaMarkup(t) {
  const z = (cls, size) =>
    `<g class="${cls}"><text font-family="Arial Rounded MT Bold,Arial,sans-serif" font-weight="800" font-size="${size}" fill="${t.ink}">z</text></g>`;
  return `<g class="p-move">
    <g class="p-face">
      <g transform="scale(${SCALE}) translate(${SHIFT} 0)">
        <g class="a-hole"><ellipse cx="2" cy="11.5" rx="11" ry="2.3" fill="${t.dirt}"/><ellipse cx="2" cy="11.7" rx="9" ry="1.6" fill="${t.hole}"/></g>
        <g class="a-shadow"><ellipse class="shadow" cx="2" cy="11.4" rx="13" ry="1.7"/></g>
        <g clip-path="url(#ground)"><g class="a-surge">
        <g class="p-hop">
          <g transform="translate(11 -20)"><path class="heart" d="${HEART}" fill="#fe428e"/></g>
          <g class="a-body"><g class="a-rear"><g class="a-sit">
          <g transform="translate(-6 3)"><g class="p-sit"><g transform="translate(6 -3)">
            <g class="p-body">
              ${leg('far', 'ff', 'front', 2.4, -0.3)}
              ${leg('far', 'hf', 'hind', 2.4, -0.3)}
              <g transform="translate(-12.2 -2.6)"><g class="tail"><g class="a-tail"><g class="wag"><ellipse class="edge" cx="-0.8" cy="0" rx="1.8" ry="1.5"/><ellipse class="wf" cx="-0.8" cy="0" rx="1.8" ry="1.5"/></g></g></g></g>
              <g class="breathe">
                <path class="edge" d="${BODY}"/>
                <path class="wf" d="${BODY}"/>
                <g clip-path="url(#bodyClip)">
                  <path class="bk" d="M3.2 -12C2 -6.5 -1.4 -1.5 -2.6 8L16 8L16 -12Z"/>
                  <path class="bk" d="M-14 0.6C-11.5 -2.4 -6.4 -2.2 -4.4 1.4C-3.6 3 -3.4 5.4 -3.4 8L-14 8Z"/>
                </g>
                <path class="shine" d="M4.2 -9.6C6.6 -10.1 8.9 -9.4 10.4 -7.6"/>
              </g>
              ${leg('near', 'hn', 'hind', 0, 0)}
              <g class="p-head"><g class="a-head"><g class="look">
                <g transform="translate(13.8 -11.4)"><g class="ear2"><g class="a-ear"><circle cx="0" cy="0" r="2.2" fill="${t.farBlack}"/></g></g></g>
                <g transform="translate(9.8 -8.4)"><g class="ear"><g class="a-ear"><circle class="kf" cx="0" cy="-2.2" r="2.5"/></g></g></g>
                <g transform="translate(16.2 -2.6)"><g class="jaw"><g class="a-jaw">
                  <ellipse fill="#3a1820" cx="2.1" cy="-.45" rx="2.2" ry=".75"/><ellipse fill="#d9667f" cx="1.7" cy="-.2" rx="1.1" ry=".32"/>
                  <ellipse class="edge" cx="2.1" cy=".25" rx="2.3" ry=".72"/><ellipse class="hw" cx="2.1" cy=".25" rx="2.3" ry=".72"/>
                </g></g></g>
                <path class="edge" d="${HEAD}"/><path class="hw" d="${HEAD}"/>
                <ellipse fill="url(#muz)" cx="19.7" cy="-3.4" rx="2.7" ry="1.8"/>
                <ellipse fill="url(#blush)" cx="16.9" cy="-3" rx="1.7" ry="1"/>
                <path class="kf" d="M15.7 -8.4C17 -8.5 17.7 -7.4 17.4 -6.3C17 -5 15.8 -3.9 14.5 -3.7C13.3 -3.6 12.6 -4.4 12.8 -5.4C13.1 -6.8 14.3 -8.3 15.7 -8.4Z"/>
                <g transform="translate(15.8 -6.6)"><g class="glint"><g class="blink"><g class="blink2"><g class="a-eye">
                  <circle fill="#4a2c1c" r=".82"/><circle fill="#0b0809" cx=".1" cy=".03" r=".55"/><circle fill="#ffffff" cx=".32" cy="-.3" r=".25"/><circle fill="#ffffff" opacity=".75" cx="-.24" cy=".32" r=".11"/>
                </g></g></g></g></g>
                <path class="happy" d="M14.95 -6.5Q15.8 -7.5 16.7 -6.6" fill="none" stroke="#ffffff" stroke-width="0.5" stroke-linecap="round"/>
                <g transform="translate(20.9 -4.6)"><g class="sniff"><path class="nose" d="M-1 -.6C-.6 -1.1 .6 -1.1 .9 -.5C1.1 -.1 .6 .6 0 .7C-.6 .6 -1.2 -.1 -1 -.6Z"/><ellipse fill="#ffffff" opacity=".35" cx="-.1" cy="-.62" rx=".34" ry=".13"/></g></g>
                <path d="M20.9 -3.9L20.85 -3.35Q20.35 -2.65 19.45 -2.85Q19.15 -2.92 19 -3.15" fill="none" stroke="${t.mouth}" stroke-width=".32" stroke-linecap="round" stroke-linejoin="round"/>
              </g></g></g>
              ${leg('near', 'fn', 'front', 0, 0, BAMBOO)}
            </g>
          </g></g></g>
          </g></g></g>
        </g>
        </g></g>
        <g fill="${t.dirt}"><g class="a-dirt1"><circle r=".9"/></g><g class="a-dirt2"><circle r=".7"/></g><g class="a-dirt3"><circle r=".6"/></g><g class="a-dirt4"><circle r=".8"/></g></g>
        <g fill="#ffd54a"><g class="a-spk1"><path d="${STAR}"/></g><g class="a-spk2"><path d="${STAR}" transform="scale(.8)"/></g><g class="a-spk3"><path d="${STAR}" transform="scale(.7)"/></g></g>
        <g class="p-face" style="transform-box:view-box;transform-origin:15px 0px"><g transform="translate(15 -11)">${z('a-z1', 3)}${z('a-z2', 3.8)}${z('a-z3', 4.6)}</g></g>
        <g fill="${t.puff}"><g class="a-pf1"><circle r="1.1"/></g><g class="a-pf2"><circle r=".9"/></g><g class="a-pf3"><circle r=".8"/></g></g>
        <g fill="${t.puff}" opacity=".85"><g class="a-du1"><circle r="1"/><circle cx="1.2" cy=".3" r=".7"/></g><g class="a-du2"><circle r="1"/><circle cx="-1.2" cy=".3" r=".7"/></g></g>
        <g fill="#ffd54a"><g class="a-st1"><path d="${STAR}"/></g><g class="a-st2"><path d="${STAR}"/></g></g>
        <g fill="#fe428e"><g class="a-ht1"><path d="${HEART}"/></g><g class="a-ht2"><path d="${HEART}"/></g><g class="a-ex"><rect x="-.55" y="-3.4" width="1.1" height="2.6" rx=".5"/><circle cy=".1" r=".6"/></g></g>
        <g fill="#8bc34a"><g class="a-lf1"><ellipse rx=".9" ry=".35"/></g><g class="a-lf2"><ellipse rx=".8" ry=".3" fill="#689f38"/></g></g>
        <g fill="#ffffff"><g class="a-fl1"><circle r=".55"/></g><g class="a-fl2"><circle r=".45"/></g></g>
        <g class="a-bf"><g class="flap">${WINGS}</g><ellipse rx=".55" ry="2.3" fill="#2a2430"/></g>
      </g>
    </g>
  </g>
`;
}

const BUTTERFLY = `<g class="bfly"><g class="bfly-bob"><g transform="scale(.95)">
  <g class="flap">${WINGS}<circle cx="-3.4" cy="-1.4" r=".7" fill="#ffffff" opacity=".7"/><circle cx="3.4" cy="-1.4" r=".7" fill="#ffffff" opacity=".7"/></g>
  <ellipse cx="0" cy="0" rx=".55" ry="2.3" fill="#2a2430"/><path d="M0 -2.2L-1 -4M0 -2.2L1 -4" stroke="#2a2430" stroke-width=".35" fill="none" stroke-linecap="round"/>
</g></g></g>
`;

function defs(t) {
  const ramp = (id, attrs, stops) =>
    `<linearGradient id="${id}" ${attrs}>${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
  const glow = (id, color, opacity) =>
    `<radialGradient id="${id}"><stop offset="0" stop-color="${color}" stop-opacity="${opacity}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`;
  return `<defs>
${ramp('furW', 'gradientUnits="userSpaceOnUse" x1="0" y1="-9" x2="0" y2="7.5"', [
  [0, '#ffffff'],
  [0.55, '#f4f1ea'],
  [1, '#d9d3c8'],
])}
${ramp('furH', 'gradientUnits="userSpaceOnUse" x1="0" y1="-11.5" x2="0" y2="0.5"', [
  [0, '#ffffff'],
  [0.6, '#f6f3ed'],
  [1, '#e2ddd3'],
])}
${ramp('furK', 'x1="0" y1="0" x2="0" y2="1"', [
  [0, t.furK[0]],
  [0.5, t.furK[1]],
  [1, t.furK[2]],
])}
${ramp('furB', 'gradientUnits="userSpaceOnUse" x1="0" y1="-10" x2="0" y2="11"', [
  [0, t.furK[0]],
  [0.45, t.furK[1]],
  [1, t.furK[2]],
])}
${glow('muz', '#786c60', t.muzzle)}
${glow('blush', '#ff8fab', 0.32)}
<clipPath id="bodyClip"><path d="${BODY}"/></clipPath>
<clipPath id="ground"><rect x="-60" y="-80" width="120" height="92.6"/></clipPath>
</defs>`;
}

function idleCss(t) {
  return `
.p-move,.p-hop,.p-sit,.p-body,.p-head,.jaw,.glint,.tail,.leg{animation-timing-function:${SINE}}
.p-body{transform-box:view-box;transform-origin:0px 10.6px}
.p-head{transform-box:view-box;transform-origin:9.3px -1.5px}
.leg{transform-box:view-box;fill:url(#furB);stroke:none}
.leg.far{fill:${t.farBlack}}
.leg ellipse{${t.rim};stroke-width:.3}
.bk{fill:url(#furB)}
.hw{fill:url(#furH)}
.edge{fill:none;${t.edge};stroke-width:1;stroke-linejoin:round}
.wf{fill:url(#furW)}
.kf{fill:url(#furK);${t.rim};stroke-width:.45}
.paw-pad{fill:${t.shine};opacity:.55}
.shine{fill:none;stroke:${t.shine};stroke-opacity:.55;stroke-width:.7;stroke-linecap:round}
.nose{fill:${t.nose}}
.breathe{transform-box:view-box;transform-origin:0px 6px;animation:breathe 3.1s ${SINE} infinite alternate}
.look{transform-box:view-box;transform-origin:9.3px -1.5px;animation:look 13.7s ${SINE} infinite}
.blink{animation:blink 5.9s ${SINE} infinite}
.blink2{animation:blink2 17.3s ${SINE} infinite}
.ear{animation:twitch 5.3s ${SINE} infinite}
.ear2{animation:twitch2 7.1s ${SINE} infinite}
.sniff{animation:sniff 8.3s ${SINE} infinite}
.wag{animation:wag 4.3s ${SINE} infinite}
.shadow{fill:#000000;opacity:${t.shadow};transform-box:view-box;transform-origin:2px 11.4px;animation:shadow 3.1s ${SINE} infinite alternate}
@keyframes breathe{from{transform:scale(1,1)}to{transform:scale(1.012,1.035)}}
@keyframes look{0%,52%,100%{transform:rotate(0)}57%,66%{transform:rotate(-8deg)}71%{transform:rotate(0)}79%{transform:rotate(5deg) translateY(.3px)}83%{transform:rotate(-1.5deg)}87%{transform:rotate(0)}}
@keyframes blink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.08)}}
@keyframes blink2{0%,38%,47%,100%{transform:scaleY(1)}40%,44%{transform:scaleY(.08)}42%{transform:scaleY(1)}}
@keyframes twitch{0%,86%,100%{transform:rotate(0)}89%{transform:rotate(-22deg)}92%{transform:rotate(9deg)}95%{transform:rotate(-5deg)}97%{transform:rotate(1deg)}}
@keyframes twitch2{0%,30%,44%,100%{transform:rotate(0)}33%{transform:rotate(16deg)}37%{transform:rotate(-7deg)}40%{transform:rotate(3deg)}}
@keyframes sniff{0%,78%,92%,100%{transform:scale(1)}81%{transform:scale(1.18,.86)}84%{transform:scale(.94,1.06)}87%{transform:scale(1.14,.9)}90%{transform:scale(.98,1.02)}}
@keyframes wag{0%,68%,90%,100%{transform:rotate(0)}72%{transform:rotate(22deg)}76%{transform:rotate(-16deg)}80%{transform:rotate(12deg)}84%{transform:rotate(-6deg)}}
@keyframes shadow{from{transform:scale(1,1)}to{transform:scale(1.03,1)}}
.bfly{animation:bfly 31.7s ${SINE} infinite}
.bfly-bob{animation:bfly-bob 1.37s ${SINE} infinite alternate}
.flap{animation:flap .19s ${SINE} infinite alternate}
@keyframes bfly{0%{transform:translate(-40px,-6px) rotate(8deg)}9%{transform:translate(40px,-12px) rotate(-6deg)}17%{transform:translate(110px,-3px) rotate(10deg)}25%{transform:translate(175px,-11px) rotate(-8deg)}32%{transform:translate(236px,0px) rotate(6deg)}40%{transform:translate(300px,-9px) rotate(-10deg)}48%{transform:translate(372px,-4px) rotate(4deg)}55%,100%{transform:translate(470px,-10px) rotate(0)}}
@keyframes bfly-bob{from{transform:translateY(-2.2px)}to{transform:translateY(2.2px)}}
@keyframes flap{from{transform:scaleX(1)}to{transform:scaleX(.2)}}
.col{animation:col-in .6s ${SNAP} backwards}
@keyframes col-in{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
@media (prefers-reduced-motion: reduce){
  .breathe,.look,.blink2,.ear,.ear2,.sniff,.wag,.shadow,.bfly-bob,.flap,.col{animation:none}
  .bfly{display:none}
}
`;
}

function build(src, theme) {
  const t = THEMES[theme];
  const styleStart = src.indexOf('<style>') + 7,
    styleEnd = src.indexOf('</style>');
  let css = src.slice(styleStart, styleEnd);
  const D = parseFloat(css.match(/animation-duration:([\d.]+)ms/)[1]);
  const K = parseKeyframes(css);
  K.delete('twitch');
  K.set('bob', cartoonBob(K.get('bob')));
  for (const n of ['fn', 'ff', 'hn', 'hf']) K.set(n, smoothStride(K.get(n)));
  const mv = K.get('move'),
    firstStop = mv.find((f) => f.p > 0.1);
  for (const f of mv) if (f.p < firstStop.p) f.d = firstStop.d;
  for (const n of ['fn', 'ff', 'hn', 'hf', 'bob'])
    K.set(
      n,
      K.get(n).filter((f) => f.p === 0 || f.p >= firstStop.p),
    );
  const names = [...K.keys()];
  const gaps = [{ T: 0, G: SURGE.G, act: SURGE }, ...pickStops(K)];
  const { D2, mapMs } = insertGaps(K, names, D, gaps);
  css = css
    .replace(/@keyframes [\w-]+\{.*?\}\}/g, '')
    .replace('.ear{animation:twitch 5300ms ease-in-out infinite}', '')
    .replace(/animation-duration:[\d.]+ms/, `animation-duration:${D2.toFixed(2)}ms`)
    .replace(/\n{3,}/g, '\n');
  css += names.map((n) => serialize(n, K.get(n))).join('\n') + '\n';
  css += activityCss(gaps, D, D2, mapMs);
  css += idleCss(t);
  let s = src.slice(0, styleStart) + css + src.slice(styleEnd);
  s = s.replace('</style>', `</style>\n${defs(t)}`);
  const a = s.indexOf('<g class="p-move">'),
    b = s.indexOf('<g class="c ');
  if (a < 0 || b < a) throw new Error('estrutura do SVG inesperada');
  const bgTag = s.match(/<rect x="-18" y="-18"[^>]*\/>/);
  const bg = bgTag.index + bgTag[0].length;
  const cols = new Map();
  for (const r of s.slice(bg, a).match(/<rect [^>]*\/>/g)) {
    const x = r.match(/ x="([-\d.]+)"/)[1];
    if (!cols.has(x)) cols.set(x, []);
    cols.get(x).push(r);
  }
  const grid = [...cols.values()]
    .map((rs, i) => `<g class="col" style="animation-delay:${i * 28}ms">${rs.join('')}</g>`)
    .join('\n');
  s = s.slice(0, bg) + '\n' + grid + '\n' + pandaMarkup(t) + s.slice(b);
  s = s.replace('</svg>', BUTTERFLY + '</svg>');
  return { svg: s, D2 };
}

for (const [theme, file] of [
  ['dark', 'panda-dark.svg'],
  ['light', 'panda.svg'],
]) {
  const target = path.join(dir, file);
  const { svg, D2 } = build(fs.readFileSync(target, 'utf8'), theme);
  fs.writeFileSync(target, svg);
  console.log(`${file}: ciclo de ${(D2 / 1000).toFixed(1)}s`);
}
