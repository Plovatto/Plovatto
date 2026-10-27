import fs from 'node:fs';
import path from 'node:path';

const [input, outDir] = process.argv.slice(2);

if (!input || !outDir) {
  console.error('Uso: node scripts/panda.mjs <contributions.json> <pasta-de-saida>');
  process.exit(1);
}

const WEEKS = 26;
const ROWS = 7;
const CELL = 16;
const DOT = 10;
const PADDING = 18;
const SPEED = 0.045;
const HALF_STEP = 280;
const LEG_SWING = 14;
const REST = 1800;
const TURN = 30;
const BLINK_EVERY = 3300;
const YAWN_ROWS = new Set([0, 3, 6]);
const EASE_OUT = 'cubic-bezier(0.23,1,0.32,1)';
const SCALE = 1.15;
const MOUTH_X = 17.4 * SCALE;
const all = JSON.parse(fs.readFileSync(input, 'utf8'));
const lastWeek = Math.max(...all.map((c) => c.x));
const cells = all.filter((c) => c.x > lastWeek - WEEKS).map((c) => ({ ...c, x: c.x - (lastWeek - WEEKS + 1) }));
const center = (cell) => cell * CELL + CELL / 2;
const width = WEEKS * CELL + 2 * PADDING;
const height = ROWS * CELL + 2 * PADDING;
const OFF_LEFT = -PADDING - 34;
const OFF_RIGHT = WEEKS * CELL + PADDING + 34;

const REST_STYLE = {
  face: 'transform:scaleX(1)',
  hop: 'transform:translateY(0)',
  sit: 'transform:translateY(0) rotate(0)',
  bob: 'transform:translateY(0)',
  head: 'transform:translate(0,0) rotate(0)',
  jaw: 'transform:rotate(0)',
  glint: 'transform:scaleY(1)',
  happy: 'opacity:0',
  tail: 'transform:rotate(0)',
  heart: 'opacity:0;transform:translateY(0) scale(.6)',
  fn: 'transform:rotate(0)',
  ff: 'transform:rotate(0)',
  hn: 'transform:rotate(0)',
  hf: 'transform:rotate(0)',
};

const channels = Object.fromEntries(Object.keys(REST_STYLE).map((k) => [k, []]));
channels.move = [];
const key = (ch, t, css) => channels[ch].push([t, css]);
const rest = (ch, t) => key(ch, t, REST_STYLE[ch]);
const LEGS = ['fn', 'ff', 'hn', 'hf'];
const legs = (t, angles) => LEGS.forEach((l, i) => key(l, t, `transform:rotate(${angles[i]}deg)`));
const meals = [];
const HEAD_DOWN = 'transform:translate(.6px,2.8px) rotate(4deg)';
const HEAD_SNIFF_A = 'transform:translate(-.3px,-1px) rotate(-9deg)';
const HEAD_SNIFF_B = 'transform:translate(-.3px,-.4px) rotate(-6deg)';
const jawOpen = (deg) => `transform:rotate(${deg}deg)`;
const cellStep = (scale, extra = '') => `transform:${extra}scale(${scale});opacity:${scale > 0 ? 1 : 0}`;

function sniff(t) {
  key('head', t + 120, HEAD_SNIFF_A);
  key('head', t + 200, HEAD_SNIFF_B);
  key('head', t + 280, HEAD_SNIFF_A);
  key('head', t + 360, HEAD_SNIFF_B);
}

function wagTail(t) {
  [0, 120, 240, 360, 480].forEach((d, i) => key('tail', t + d, `transform:rotate(${i % 2 ? -28 : 28}deg)`));
  rest('tail', t + 600);
}

function chew(t, deg, meal, scale, extra) {
  key('jaw', t - 110, jawOpen(4));
  key('jaw', t, jawOpen(deg));
  key('jaw', t + 130, jawOpen(4));
  meal.steps.push([t + 20, cellStep(scale, extra)]);
  meal.crumbs.push(t + 30);
}

function nibble(t, meal) {
  rest('head', t);
  key('head', t + 150, HEAD_DOWN);
  rest('jaw', t + 170);
  chew(t + 300, 30, meal, 0);
  rest('jaw', t + 460);
  key('head', t + 480, HEAD_DOWN);
  rest('head', t + 680);
  return 720;
}

function double(t, meal) {
  rest('head', t);
  key('head', t + 170, HEAD_DOWN);
  rest('jaw', t + 180);
  chew(t + 300, 34, meal, 0.55);
  chew(t + 580, 30, meal, 0);
  rest('jaw', t + 740);
  key('head', t + 820, HEAD_DOWN);
  rest('head', t + 1040);
  return 1080;
}

function hearty(t, meal) {
  rest('head', t);
  sniff(t);
  key('head', t + 540, HEAD_DOWN);
  rest('jaw', t + 560);
  chew(t + 680, 34, meal, 0.72);
  chew(t + 910, 30, meal, 0.45);
  chew(t + 1140, 34, meal, 0);
  rest('jaw', t + 1300);
  key('head', t + 1380, HEAD_DOWN);
  rest('head', t + 1600);
  rest('tail', t + 1250);
  wagTail(t + 1260);
  return 1880;
}

function feast(t, meal) {
  rest('head', t);
  sniff(t);
  rest('sit', t + 420);
  legs(t + 420, [0, 0, 0, 0]);
  key('sit', t + 820, 'transform:translateY(1.8px) rotate(-17deg)');
  legs(t + 820, [17, 17, -62, -58]);
  key('head', t + 820, 'transform:translate(0,0) rotate(7deg)');
  key('fn', t + 1080, 'transform:rotate(-96deg)');
  meal.steps.push([t + 900, cellStep(1)]);
  meal.steps.push([t + 1100, cellStep(0.78, `translate(${-meal.dir * 3}px,-7px) `)]);
  rest('jaw', t + 1100);
  const grab = `translate(${-meal.dir * 3}px,-7px) `;
  chew(t + 1260, 30, meal, 0.58, grab);
  chew(t + 1510, 26, meal, 0.38, grab);
  chew(t + 1760, 30, meal, 0.2, grab);
  chew(t + 2010, 26, meal, 0, grab);
  rest('jaw', t + 2170);
  rest('glint', t + 2120);
  rest('happy', t + 2120);
  key('glint', t + 2180, 'transform:scaleY(0)');
  key('happy', t + 2180, 'opacity:1');
  key('happy', t + 2700, 'opacity:1');
  rest('happy', t + 2760);
  key('glint', t + 2700, 'transform:scaleY(0)');
  rest('glint', t + 2780);
  rest('heart', t + 2150);
  key('heart', t + 2350, 'opacity:1;transform:translateY(-2px) scale(1)');
  key('heart', t + 2800, 'opacity:0;transform:translateY(-7px) scale(1.1)');
  rest('heart', t + 2810);
  key('fn', t + 2380, 'transform:rotate(-96deg)');
  key('fn', t + 2580, 'transform:rotate(17deg)');
  key('sit', t + 2650, 'transform:translateY(1.8px) rotate(-17deg)');
  key('head', t + 2650, 'transform:translate(0,0) rotate(7deg)');
  legs(t + 2650, [17, 17, -62, -58]);
  rest('sit', t + 3000);
  rest('head', t + 3000);
  legs(t + 3000, [0, 0, 0, 0]);
  rest('tail', t + 3000);
  wagTail(t + 3010);
  rest('hop', t + 3050);
  key('hop', t + 3200, 'transform:translateY(-4px)');
  rest('hop', t + 3360);
  legs(t + 3120, [-12, -12, 14, 14]);
  legs(t + 3360, [0, 0, 0, 0]);
  return 3440;
}

function yawn(t) {
  rest('head', t);
  key('head', t + 300, 'transform:translate(-.4px,-1.2px) rotate(-15deg)');
  rest('jaw', t + 300);
  key('jaw', t + 560, jawOpen(50));
  key('jaw', t + 1050, jawOpen(46));
  rest('jaw', t + 1260);
  rest('glint', t + 330);
  rest('happy', t + 330);
  key('glint', t + 400, 'transform:scaleY(0)');
  key('happy', t + 400, 'opacity:1');
  key('glint', t + 1200, 'transform:scaleY(0)');
  key('happy', t + 1200, 'opacity:1');
  rest('glint', t + 1280);
  rest('happy', t + 1280);
  key('head', t + 1250, 'transform:translate(-.4px,-1.2px) rotate(-15deg)');
  rest('head', t + 1560);
  return 1640;
}

const EAT = { 1: nibble, 2: double, 3: hearty, 4: feast };

function walk(a, b) {
  const steps = Math.max(1, Math.round((b - a) / HALF_STEP));
  const h = (b - a) / steps;
  legs(a, [0, 0, 0, 0]);
  rest('bob', a);
  for (let k = 1; k <= steps; k++) {
    const at = a + k * h;
    const s = (k % 2 ? 1 : -1) * LEG_SWING * (k === 1 || k === steps ? 0.6 : 1);
    const end = k === steps ? 0 : 0.15;
    legs(at - h / 2, [s, -s, -s, s]);
    legs(at, [s * end, -s * end, -s * end, s * end]);
    key('bob', at - h / 2, 'transform:translateY(-0.7px)');
    rest('bob', at);
  }
  for (let t = a + 900; t < b - 300; t += BLINK_EVERY) {
    rest('glint', t);
    key('glint', t + 70, 'transform:scaleY(.1)');
    rest('glint', t + 150);
  }
}

const facing = [];
let t = 0;

for (let r = 0; r < ROWS; r++) {
  const dir = r % 2 === 0 ? 1 : -1;
  const y = center(r);
  let x = dir > 0 ? OFF_LEFT : OFF_RIGHT;
  facing.push([t + TURN, dir]);
  channels.move.push([t + TURN, `transform:translate(${x.toFixed(2)}px,${y}px)`]);
  const stops = cells
    .filter((c) => c.y === r && c.level > 0)
    .sort((a, b) => dir * (a.x - b.x))
    .map((c) => ({ cell: c, x: center(c.x) - dir * MOUTH_X }));
  const yawnAfter = YAWN_ROWS.has(r) ? Math.floor(stops.length / 2) : -1;
  stops.forEach((s, i) => {
    const dur = Math.abs(s.x - x) / SPEED;
    walk(t, t + dur);
    t += dur;
    x = s.x;
    channels.move.push([t, `transform:translate(${x.toFixed(2)}px,${y}px)`]);
    const meal = { cell: s.cell, dir, steps: [], crumbs: [], at: t };
    t += EAT[s.cell.level](t, meal);
    meals.push(meal);
    channels.move.push([t, `transform:translate(${x.toFixed(2)}px,${y}px)`]);
    if (i === yawnAfter) {
      t += yawn(t);
      channels.move.push([t, `transform:translate(${x.toFixed(2)}px,${y}px)`]);
    }
  });
  const end = dir > 0 ? OFF_RIGHT : OFF_LEFT;
  const dur = Math.abs(end - x) / SPEED;
  walk(t, t + dur);
  t += dur;
  channels.move.push([t, `transform:translate(${end.toFixed(2)}px,${y}px)`]);
  facing.push([t, dir]);
}

const runEnd = t;
const total = runEnd + REST;
facing.forEach(([ft, dir]) => key('face', ft, `transform:scaleX(${dir})`));
const pct = (ms) => `${((Math.min(Math.max(ms, 0), total) / total) * 100).toFixed(4)}%`;

const kf = (list, first, lastCss) => {
  const sorted = [
    [0, first],
    ...list.map((e, i) => [...e, i]).sort((a, b) => a[0] - b[0] || a[2] - b[2]),
    [total, lastCss ?? first],
  ];
  let last = -Infinity;
  return sorted
    .map(([ms, css]) => {
      const at = Math.min(Math.max(ms, last + 2), total);
      last = at;
      return `${pct(at)}{${css}}`;
    })
    .join('');
};

const firstMove = channels.move[0][1];
const lastMove = channels.move.at(-1)[1];
const anim = (name) =>
  `@keyframes ${name}{${name === 'move' ? kf(channels.move, firstMove, lastMove) : kf(channels[name], REST_STYLE[name], name === 'face' ? `transform:scaleX(${facing.at(-1)[1]})` : undefined)}}`;
const cellCss = meals
  .map((meal, i) => {
    const c = meal.cell;
    const o = `${center(c.x)}px ${center(c.y)}px`;
    const back = runEnd + (c.x / WEEKS) * (REST * 0.5);
    const steps = [[meal.at, 'transform:scale(1);opacity:1'], ...meal.steps].map(([ms, css]) => [
      ms,
      `${css};animation-timing-function:${EASE_OUT}`,
    ]);
    const body = kf(
      [
        ...steps,
        [back, 'transform:scale(.9);opacity:0;animation-timing-function:' + EASE_OUT],
        [back + 400, 'transform:scale(1);opacity:1'],
      ],
      'transform:scale(1);opacity:1',
    );
    const crumbs = meal.crumbs
      .map(
        (ct, j) => `@keyframes c${i}_${j}{${kf(
          [
            [ct, `transform:scale(.5);opacity:0;animation-timing-function:${EASE_OUT}`],
            [ct + 40, 'opacity:1'],
            [ct + 480, 'transform:scale(1.7);opacity:0'],
          ],
          'transform:scale(.5);opacity:0',
          'transform:scale(1.7);opacity:0',
        )}}
.c${i}_${j}{animation-name:c${i}_${j};transform-origin:${o}}`,
      )
      .join('\n');
    return `@keyframes e${i}{${body}}\n.e${i}{animation-name:e${i};transform-origin:${o}}\n${crumbs}`;
  })
  .join('\n');
const leg = (cls, x, y, h) => `<rect class="leg ${cls}" x="${x - 2.1}" y="${y}" width="4.2" height="${h}" rx="2"/>`;
const HIP = { x: -6, y: 3 };
const panda = `
  <g class="p-move">
    <g class="p-face">
      <g transform="scale(${SCALE})">
        <g class="p-hop">
          <g transform="translate(9 -17)"><path class="heart" d="M0 1.7C-2.6 0 -1.9 -2.3 0 -1.1C1.9 -2.3 2.6 0 0 1.7Z" fill="#fe428e"/></g>
          <g transform="translate(${HIP.x} ${HIP.y})"><g class="p-sit"><g transform="translate(${-HIP.x} ${-HIP.y})">
            <g class="p-body">
              ${leg('far ff', 6.9, 3.2, 8)}
              ${leg('far hf', -4.4, 3.2, 8)}
              <g transform="translate(-9.4 -2.4)"><g class="tail"><ellipse class="w" cx="-1" cy="0" rx="1.9" ry="1.35"/></g></g>
              <path class="w" d="M-10 -0.5C-10 -5.6 -5.6 -7.9 0.6 -7.8C5.6 -7.7 9.2 -5.6 10 -1.2C10.6 2.8 7.4 6.2 1.4 6.6C-4.8 6.9 -10 4.6 -10 -0.5Z"/>
              <ellipse class="k" cx="-5.6" cy="2.4" rx="4.4" ry="4.3"/>
              <path class="k" d="M0.8 -7.8C3.6 -7.8 6.3 -7 8.2 -5.3C9.4 0 9.2 3.4 8.4 6.2C6.2 6.6 4.2 6.6 2.4 6.6C1.4 2.4 0.9 -2.6 0.8 -7.8Z"/>
              ${leg('near hn', -6, 3.4, 7.8)}
              <g class="p-head">
                <circle class="k" cx="12.4" cy="-10.4" r="2.1"/>
                <g transform="translate(9.2 -7.4)"><g class="ear"><circle class="k" cx="0" cy="-2" r="2.3"/></g></g>
                <ellipse fill="#5a1e2b" cx="16.1" cy="-1.1" rx="2.1" ry="0.95"/>
                <g transform="translate(13.8 -0.8)"><g class="jaw"><ellipse class="w" cx="2.1" cy="0.1" rx="2.3" ry="0.8"/></g></g>
                <circle class="w" cx="11.8" cy="-4.4" r="5.9"/>
                <ellipse class="w" cx="16.3" cy="-2.5" rx="2.7" ry="2.1"/>
                <circle class="w-fill" cx="11.8" cy="-4.4" r="5.6"/>
                <ellipse class="w-fill" cx="16.3" cy="-2.5" rx="2.4" ry="1.8"/>
                <ellipse class="k" cx="13.7" cy="-4.9" rx="2.15" ry="1.45" transform="rotate(-32 13.7 -4.9)"/>
                <g transform="translate(14.1 -5.2)"><g class="glint"><circle fill="#ffffff" cx="0" cy="0" r="0.42"/></g></g>
                <path class="happy" d="M12.9 -4.7Q14 -6.1 15.1 -4.9" fill="none" stroke="#ffffff" stroke-width="0.6" stroke-linecap="round"/>
                <ellipse class="k" cx="18.4" cy="-2.9" rx="1" ry="0.75"/>
              </g>
              ${leg('near fn', 5.3, 3.4, 7.8)}
            </g>
          </g></g></g>
        </g>
      </g>
    </g>
  </g>`;

const themes = {
  'panda.svg': {
    card: '#f6f8fa',
    empty: '#ebedf0',
    dots: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
    farLeg: '#3a3a42',
    outline: '#1b1b1f',
    outlineOpacity: 0,
  },
  'panda-dark.svg': {
    card: '#141321',
    empty: '#1d1b2e',
    dots: ['#1d1b2e', '#01311f', '#034525', '#0f6d31', '#00c647'],
    farLeg: '#2e2d36',
    outline: '#e4e2e2',
    outlineOpacity: 0.4,
  },
};

const m = (CELL - DOT) / 2;
const mealIndex = new Map(meals.map((e, i) => [`${e.cell.x},${e.cell.y}`, i]));
const timeline = ['move', ...Object.keys(REST_STYLE)];
const legCss = LEGS.map((l) => `.${l}{animation-name:${l}}`).join('');
fs.mkdirSync(outDir, { recursive: true });

for (const [file, th] of Object.entries(themes)) {
  const rect = (cls, fill, c) =>
    `<rect${cls} x="${c.x * CELL + m}" y="${c.y * CELL + m}" width="${DOT}" height="${DOT}" rx="2" fill="${fill}"/>`;
  const dots = cells
    .map((c) => {
      const i = mealIndex.get(`${c.x},${c.y}`);
      if (i === undefined) return rect('', th.dots[c.level], c);
      return rect('', th.empty, c) + rect(` class="e e${i}"`, th.dots[c.level], c);
    })
    .join('');
  const crumbs = meals
    .map(({ cell: c, crumbs: list }, i) =>
      list
        .map((_, j) => {
          const x = center(c.x) + (j % 2 ? 1.5 : -1.5);
          const y = center(c.y) - (j % 3);
          return `<g class="c c${i}_${j}" fill="${th.dots[c.level]}"><rect x="${x - 6}" y="${y - 5.5}" width="2.4" height="2.4" rx=".6"/><rect x="${x + 3.4}" y="${y - 6.5}" width="2" height="2" rx=".5"/><rect x="${x - 1}" y="${y + 4}" width="2.2" height="2.2" rx=".6"/></g>`;
        })
        .join(''),
    )
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${-PADDING} ${-PADDING} ${width} ${height}" role="img" aria-label="Panda caminhando pelo gráfico de contribuições e comendo os commits">
<style>
.e,.c,.p-move,.p-face,.p-hop,.p-sit,.p-body,.p-head,.jaw,.glint,.happy,.tail,.heart,.leg{animation-duration:${total.toFixed(2)}ms;animation-iteration-count:infinite;animation-timing-function:linear}
.c{opacity:0}
.p-move{animation-name:move}
.p-face{animation-name:face}
.p-hop{animation-name:hop}
.p-sit{animation-name:sit}
.p-body{animation-name:bob}
.p-head{animation-name:head;transform-box:fill-box;transform-origin:25% 85%}
.jaw{animation-name:jaw}
.glint{animation-name:glint}
.happy{animation-name:happy;opacity:0}
.tail{animation-name:tail}
.heart{animation-name:heart;opacity:0;transform-box:fill-box;transform-origin:50% 100%}
.ear{animation:twitch 5300ms ease-in-out infinite}
@keyframes twitch{0%,88%,100%{transform:rotate(0)}91%{transform:rotate(-20deg)}94%{transform:rotate(8deg)}97%{transform:rotate(-6deg)}}
${legCss}
${timeline.map(anim).join('\n')}
.w{fill:#ffffff;stroke:#1b1b1f;stroke-width:.6}
.w-fill{fill:#ffffff}
.k{fill:#1b1b1f;stroke:${th.outline};stroke-opacity:${th.outlineOpacity};stroke-width:.5}
.leg{fill:#1b1b1f;stroke:${th.outline};stroke-opacity:${th.outlineOpacity};stroke-width:.5;transform-box:fill-box;transform-origin:50% 6%}
.leg.far{fill:${th.farLeg}}
${cellCss}
@media (prefers-reduced-motion:reduce){.e,.c,.p-move,.p-face,.p-hop,.p-sit,.p-body,.p-head,.jaw,.glint,.happy,.tail,.heart,.leg,.ear{animation:none}.p-move{transform:translate(${PADDING + 12}px,${center(3)}px)}}
</style>
<rect x="${-PADDING}" y="${-PADDING}" width="${width}" height="${height}" rx="10" fill="${th.card}"/>
${dots}
${panda}
${crumbs}
</svg>
`;
  fs.writeFileSync(path.join(outDir, file), svg);
}

if (process.env.PANDA_DEBUG) {
  fs.writeFileSync(
    process.env.PANDA_DEBUG,
    JSON.stringify({ total, eats: meals.map((e) => ({ t: e.at, x: e.cell.x, y: e.cell.y, level: e.cell.level })) }),
  );
}

console.log(
  `ok: ${WEEKS} semanas, ${meals.length} commits, ciclo de ${(total / 1000).toFixed(1)}s, ${width}x${height}`,
);
