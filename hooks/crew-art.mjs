// The site crew: every subagent and side session as a pixel crab in a construction role.
// Shared by the mod (hooks/register.tsx) and the lineup generator (docs/gen-crew-lineup.mjs).
// Pure: no imports, no I/O.
//
// The crab, `stamp`, `crabBody` and the `crab()` group builder are adapted from
// savvy-progress (github.com/the-kringel/diabolic-savvys, forked from johnnyvizz/claude-kit;
// Pixel Clawd from DockCrab), MIT licensed.

export const CLAY = '#D97757'
export const INK = '#1F1E1D'
export const CRAB_BOX = 30

// The capability ladder first (model sets the band, effort climbs within it), then the
// roles that go by job: inspector (testers, reviewers), surveyor, planner, subcontractor.
export const ROLES = Object.freeze([
  'apprentice',
  'laborer',
  'bricklayer',
  'carpenter',
  'foreman',
  'engineer',
  'architect',
  'inspector',
  'surveyor',
  'planner',
  'sub',
])

export const ROLE_INFO = {
  apprentice: { name: 'Apprentice', color: '#C8651B', look: 'orange hard hat, pushing a wheelbarrow of bricks' },
  laborer: { name: 'Laborer', color: '#A87B12', look: 'yellow hard hat, running a jackhammer' },
  bricklayer: { name: 'Bricklayer', color: '#B5523B', look: 'yellow hard hat, trowel raised beside a brick stack' },
  carpenter: { name: 'Carpenter', color: '#2F6FB5', look: 'blue hard hat and tool belt, swinging a hammer' },
  inspector: { name: 'Inspector', color: '#2E8B57', look: 'green hard hat and hi-vis vest, ticking a clipboard' },
  foreman: { name: 'Foreman', color: '#5F6B7A', look: 'white striped hard hat, calling on a walkie-talkie' },
  engineer: { name: 'Engineer', color: '#4B5BBF', look: 'white hard hat, holding a long spirit level' },
  architect: { name: 'Architect', color: '#7A4FB0', look: 'white hard hat with a gold band, round glasses and a blueprint' },
  surveyor: { name: 'Surveyor', color: '#C2477A', look: 'orange reflective hard hat, theodolite on a tripod' },
  planner: { name: 'Planner', color: '#1F8A8A', look: 'teal cap and pencil, holding a Gantt chart board' },
  sub: { name: 'Subcontractor', color: '#7D7D79', look: 'grey hard hat, carrying a red toolbox' },
}

export const stamp = (f, x, y, rows, map, cls) =>
  rows.forEach((row, dy) => [...row].forEach((ch, dx) => map[ch] && f(x + dx, y + dy, 1, 1, map[ch], cls)))

// `armFront` raises the right claw (negative is up); `armCls` lets it move with a prop.
export const crabBody = (f, armFront = 0, armCls) => {
  f(7, 10, 16, 12, CLAY)
  f(3, 14, 4, 4, CLAY)
  f(23, 14 + armFront, 4, 4, CLAY, armCls)
  f(9, 12, 2, 2, INK)
  f(19, 12, 2, 2, INK)
  f(7, 22, 2, 4, CLAY, 'la')
  f(17, 22, 2, 4, CLAY, 'la')
  f(11, 22, 2, 4, CLAY, 'lb')
  f(21, 22, 2, 4, CLAY, 'lb')
}

// Hard hats follow real site colors. [shell, shade, highlight, outline?]
// White hats get a grey outline so they still read on a light pane.
const HAT = {
  orange: ['#F28A1E', '#B85F0C', '#FFB760'],
  yellow: ['#F5C518', '#B98F06', '#FFE577'],
  blue: ['#2F6FD0', '#1C4C98', '#6A9DEB'],
  green: ['#3BA34A', '#257533', '#74CF80'],
  white: ['#F3F3F0', '#B9B9B3', '#FFFFFF', '#8E9399'],
  grey: ['#9C9C97', '#686864', '#C4C4BF'],
}

// A dome on y 4-8 with a brim on y 9, sitting on the crab's top edge; `band` fills y 7.
const hardHat = (f, [h, d, l, o], band) => {
  if (o) {
    f(12, 3, 6, 1, o)
    f(10, 4, 2, 1, o)
    f(18, 4, 2, 1, o)
    f(9, 5, 1, 1, o)
    f(20, 5, 1, 1, o)
    f(8, 6, 1, 3, o)
    f(21, 6, 1, 3, o)
    f(4, 9, 1, 1, o)
    f(25, 9, 1, 1, o)
  }
  f(12, 4, 6, 1, h)
  f(10, 5, 10, 1, h)
  f(9, 6, 12, 3, h)
  f(14, 4, 2, 5, l)
  f(10, 6, 1, 2, l)
  f(20, 6, 1, 3, d)
  if (band) f(9, 7, 12, 1, band)
  f(5, 9, 20, 1, h)
  f(5, 9, 1, 1, d)
  f(24, 9, 1, 1, d)
}

const BRICK = { r: '#B8452F', d: '#7E2C1D', m: '#CFC6B8' }
const WOOD = '#8A5A2B'
const STEEL = '#C9CED6'

const COSTUMES = {
  // Apprentice: pushes a little green wheelbarrow with bricks; the barrow bounces, the wheel ticks.
  apprentice: f => {
    crabBody(f)
    hardHat(f, HAT.orange)
    stamp(f, 27, 15, ['.rr', 'ddm', 'rmr'], BRICK, 'brw')
    stamp(f, 22, 18, ['GGGGGGGG', '.ggggggD', '.kggggD.', '.k......', '.k......'], { g: '#4F8A3B', G: '#7DBA5F', D: '#355F27', k: '#2A2A2A' }, 'brw')
    stamp(f, 26, 21, ['kwk', 'khk', 'kkk'], { k: '#2A2A2A', w: '#E8E8E8', h: '#8A8A8A' }, 'whl')
  },
  // Laborer: a jackhammer held down on the right; it shakes and dust puffs at its bit.
  laborer: f => {
    crabBody(f, -2)
    hardHat(f, HAT.yellow)
    stamp(
      f,
      23,
      10,
      ['kkkkkkk', '....yyy', '....yYy', '....yyy', '....ggg', '....gGg', '....ggg', '....ggg', '.....s.', '.....s.', '.....s.', '.....S.'],
      { k: '#2A2A2A', y: '#F2B91D', Y: '#C48E08', g: '#6E747C', G: '#9AA0A8', s: STEEL, S: '#8E949C' },
      'jh',
    )
    stamp(f, 23, 24, ['d.....d', '.......', '..d....'], { d: '#CDB98F' }, 'ds1')
    stamp(f, 24, 25, ['.d..d.', 'd....d', '...d..'], { d: '#A8977A' }, 'ds2')
  },
  // Bricklayer: the trowel in the raised claw taps; a brick stack waits at the left foot.
  bricklayer: f => {
    crabBody(f, -4, 'tw')
    hardHat(f, HAT.yellow)
    stamp(f, 23, 0, ['....s.', '...sS.', '...msS', '..ssmS', '..sssS', '.sssssS', '.SSSSSS', '..k....', '..h....', '..h....'], { s: STEEL, S: '#7E8590', m: '#A39E94', k: '#4A4E55', h: WOOD }, 'tw')
    stamp(f, 0, 19, ['rrmrrr', 'ddmddd', 'mmmmmm', 'rrrrmr', 'ddddmd', 'mmmmmm', 'rrmrrr'], BRICK)
  },
  // Carpenter: a tool belt across the body; the raised hammer swings.
  carpenter: f => {
    crabBody(f, -4, 'hm')
    hardHat(f, HAT.blue)
    f(7, 18, 16, 2, '#7A4A22')
    f(7, 19, 16, 1, '#5A3517')
    f(14, 18, 2, 2, '#E0B23A')
    stamp(f, 8, 17, ['.k..', 'bbbb', 'bBBb', 'bbbb'], { b: '#9C6431', B: '#7A4A22', k: '#6E747C' })
    stamp(f, 18, 16, ['.y.', '.y.', 'bbb', 'bBb', 'bbb'], { b: '#9C6431', B: '#7A4A22', y: '#E8C24A' })
    stamp(f, 22, 1, ['kkkkkk', 'kGkkkk', 'k..h..', '...h..', '...h..', '...h..', '...h..', '...h..', '...h..'], { k: '#5B626E', G: '#A9B0BA', h: WOOD }, 'hm')
  },
  // Inspector: a hi-vis vest and a clipboard; the check mark blinks and the pen taps.
  inspector: f => {
    crabBody(f, -4)
    hardHat(f, HAT.green)
    const vest = { v: '#C6E23A', s: '#E8ECEF' }
    stamp(f, 7, 15, ['vvvvv......vvvvv', 'sssss......sssss', 'vvvvvv....vvvvvv', 'vvvvvv....vvvvvv', 'ssssss....ssssss', 'vvvvvv....vvvvvv', 'vvvvvv....vvvvvv'], vest)
    stamp(
      f,
      24,
      2,
      ['..cc..', 'bbccbb', 'bwwwwb', 'bwwwwb', 'bwwwwb', 'bwwwwb', 'blllwb', 'bwwwwb', 'bbbbbb'],
      { b: '#8A5A2B', c: '#9AA0A8', w: '#F6F4EE', l: '#9A9A96' },
    )
    stamp(f, 25, 4, ['...g', '..g.', 'g.g.', '.g..'], { g: '#1E9E4A' }, 'ck')
    stamp(f, 21, 3, ['k..', '.b.', '.b.', '..b', '..t'], { k: '#2A2A2A', b: '#2F6FD0', t: '#1F1E1D' }, 'pn')
  },
  // Foreman: white hat with a black stripe and a walkie-talkie; its light and the signal blink.
  foreman: f => {
    crabBody(f, -4)
    hardHat(f, HAT.white, '#1F1E1D')
    f(26, 1, 1, 5, '#2A2A2A')
    stamp(f, 24, 5, ['kkkkk', 'kgggk', 'kGGGk', 'kgggk', 'kGGGk', 'kkkkk', 'kyyyk'], { k: '#2A2A2A', g: '#4A4E55', G: '#7D838C', y: '#F2B91D' })
    f(26, 0, 1, 1, '#FF3B30', 'lt')
    stamp(f, 27, 0, ['.w', 'w.', '.w'], { w: '#8FD3FF' }, 'wv')
    stamp(f, 28, 0, ['.w', '.w', 'w.', '.w', '.w'], { w: '#8FD3FF' }, 'wv2')
  },
  // Engineer: a long spirit level held across both claws; its green bubble slides.
  engineer: f => {
    crabBody(f)
    hardHat(f, HAT.white)
    f(1, 18, 29, 2, '#F2C230')
    f(1, 19, 29, 1, '#C9970F')
    f(1, 18, 1, 2, '#2A2A2A')
    f(29, 18, 1, 2, '#2A2A2A')
    f(11, 18, 8, 1, '#E4F5C8')
    f(10, 18, 1, 1, '#2A2A2A')
    f(19, 18, 1, 1, '#2A2A2A')
    f(14, 18, 2, 1, '#22B04B', 'bb')
  },
  // Architect: gold-banded white hat, round glasses, a blueprint held up; its lines shimmer.
  architect: f => {
    crabBody(f, -4)
    hardHat(f, HAT.white, '#E0B23A')
    const g = '#F2E7C4'
    for (const ex of [8, 18]) {
      f(ex + 1, 11, 2, 1, g)
      f(ex + 1, 14, 2, 1, g)
      f(ex, 12, 1, 2, g)
      f(ex + 3, 12, 1, 2, g)
    }
    f(12, 12, 1, 1, g)
    f(17, 12, 1, 1, g)
    f(13, 11, 4, 1, g)
    f(23, 1, 7, 1, '#9CC0EE')
    f(23, 2, 7, 8, '#2457A6')
    f(23, 10, 7, 1, '#9CC0EE')
    for (const gy of [4, 7]) f(23, gy, 7, 1, '#D6E4F7', 'l1')
    for (const gx of [25, 28]) f(gx, 2, 1, 8, '#D6E4F7', 'l2')
  },
  // Surveyor: reflective band on the hat, a theodolite on a tripod; its laser dot blinks.
  surveyor: f => {
    crabBody(f)
    hardHat(f, HAT.orange, '#E6EAF0')
    stamp(
      f,
      23,
      10,
      ['..yyyy.', 'gkkkkkk', '..yYyy.', '...kk..', '..tttt.', '..t.tt.', '..t.t.t', '.t..t.t', '.t..t.t', '.t..t.t', '.t..t.t', 't...t.t', 't...t.t', 't...t.t', 't...t.t', 't...t.t'],
      { y: '#F2C230', Y: '#C48E08', k: '#2A2A2A', g: '#9AA0A8', t: '#C9A04A' },
    )
    f(29, 11, 1, 1, '#FF2A2A', 'lz')
  },
  // Planner: a teal cap, a pencil tucked behind it and a Gantt board whose bars grow.
  planner: f => {
    crabBody(f, -4)
    const [c, d] = ['#1F9A9A', '#136A6A']
    f(11, 5, 8, 1, c)
    f(10, 6, 10, 3, c)
    f(14, 4, 2, 1, d)
    f(9, 9, 12, 1, d)
    f(19, 9, 3, 1, c)
    f(11, 6, 1, 2, '#4FC2C2')
    stamp(f, 4, 5, ['pp...', 'pyy..', '.yyy.', '..yyk'], { p: '#F08FA8', y: '#F2C230', k: '#3A3A3A' })
    stamp(f, 22, 2, ['kkkkkkkk', 'kwwwwwwk', 'kwwwwwwk', 'kwwwwwwk', 'kwwwwwwk', 'kwwwwwwk', 'kwwwwwwk', 'kwwwwwwk', 'kkkkkkkk'], { k: '#3A3F47', w: '#F6F4EE' })
    f(23, 4, 3, 1, '#2F6FD0', 'g1')
    f(24, 6, 4, 1, '#F28A1E', 'g2')
    f(25, 8, 4, 1, '#3BA34A', 'g3')
  },
  // Subcontractor: grey hat and a red toolbox hanging from the claw; it swings.
  sub: f => {
    crabBody(f, -1)
    hardHat(f, HAT.grey)
    stamp(f, 23, 16, ['..kkk..', '..k.k..', 'rrrrrrr', 'RRRsRRR', 'rrrrrrr', 'rrrrrrr', 'RRRRRRR'], { k: '#2A2A2A', r: '#D0392B', R: '#8E2219', s: STEEL }, 'tb')
  },
  plain: f => crabBody(f),
}

// Pure CSS: legs step, the body bobs, each role's prop adds its own motion.
// Periods divide one second so a once-a-second redraw keeps them in phase.
export const CREW_CSS = `<style>
.run .la{animation:sc-st .5s steps(1) infinite}.run .lb{animation:sc-st .5s steps(1) infinite -.25s}
.run .bd{animation:sc-bob .5s steps(1) infinite -.125s}
.run g{transform-box:fill-box}
@keyframes sc-st{50%{transform:translateY(-1px)}}@keyframes sc-bob{50%{transform:translateY(1px)}}
@keyframes sc-blink{50%{opacity:.15}}@keyframes sc-up{50%{transform:translateY(-1px)}}@keyframes sc-down{50%{transform:translateY(1px)}}
.c-apprentice.run .brw{animation:sc-up .5s steps(1) infinite}
.c-apprentice.run .whl{transform-origin:50% 50%;animation:sc-spin 1s steps(4) infinite}
@keyframes sc-spin{to{transform:rotate(360deg)}}
.c-laborer.run .jh{animation:sc-up .25s steps(1) infinite}
.c-laborer.run .ds1{animation:sc-blink .25s steps(1) infinite}
.c-laborer.run .ds2{animation:sc-blink .25s steps(1) infinite -.125s}
.c-bricklayer.run .tw{animation:sc-tap .5s steps(1) infinite}
@keyframes sc-tap{50%{transform:translateY(2px)}}
.c-carpenter.run .hm{transform-origin:30% 100%;animation:sc-swing .5s ease-in-out infinite}
@keyframes sc-swing{0%,100%{transform:rotate(-15deg)}50%{transform:rotate(20deg)}}
.c-inspector.run .ck{animation:sc-blink 1s steps(1) infinite}
.c-inspector.run .pn{animation:sc-down .5s steps(1) infinite}
.c-foreman.run .lt{animation:sc-blink .5s steps(1) infinite}
.c-foreman.run .wv{animation:sc-blink 1s steps(1) infinite}
.c-foreman.run .wv2{animation:sc-blink 1s steps(1) infinite -.5s}
.c-engineer.run .bb{animation:sc-slide 1s ease-in-out infinite}
@keyframes sc-slide{0%,100%{transform:translateX(-2px)}50%{transform:translateX(2px)}}
.c-architect.run .l1{animation:sc-shim 1s ease-in-out infinite}
.c-architect.run .l2{animation:sc-shim 1s ease-in-out infinite -.5s}
@keyframes sc-shim{50%{opacity:.3}}
.c-surveyor.run .lz{animation:sc-blink .5s steps(1) infinite}
.c-planner.run .g1,.c-planner.run .g2,.c-planner.run .g3{transform-origin:0 50%;animation:sc-grow 1s ease-out infinite}
.c-planner.run .g2{animation-delay:-.25s}.c-planner.run .g3{animation-delay:-.5s}
@keyframes sc-grow{0%{transform:scaleX(.25)}70%,100%{transform:scaleX(1)}}
.c-sub.run .tb{transform-origin:50% 0;animation:sc-rock 1s ease-in-out infinite}
@keyframes sc-rock{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(6deg)}}
@media (prefers-reduced-motion: reduce){.run,.run g{animation:none!important}}
</style>`

const CRAB_SCALE = 1.1

// Body and props nest inside `bd` so a prop rides the bob and adds its own motion;
// legs stay outside it and step on their own. `mirror` flips the crab inside its
// own box (x .. x + CRAB_BOX * scale) so it faces left.
export const crab = (x, y, role, opts = {}) => {
  const { dim = false, isWorking = false, scale = CRAB_SCALE, mirror = false } = opts
  const known = Object.prototype.hasOwnProperty.call(COSTUMES, role) && role !== 'plain'
  const groups = new Map([['bd', []]])
  const f = (cx, cy, w, h, c, cls = 'bd') => {
    if (!groups.has(cls)) groups.set(cls, [])
    groups.get(cls).push(`<rect x="${cx}" y="${cy}" width="${w}" height="${h}" fill="${c}"/>`)
  }
  ;(known ? COSTUMES[role] : COSTUMES.plain)(f)
  const group = cls => `<g class="${cls}">${(groups.get(cls) ?? []).join('')}</g>`
  const props = [...groups.keys()].filter(k => k !== 'bd' && k !== 'la' && k !== 'lb')
  const body = `<g class="bd">${groups.get('bd').join('')}${props.map(group).join('')}</g>`
  const place = mirror ? `translate(${x + CRAB_BOX * scale},${y}) scale(${-scale},${scale})` : `translate(${x},${y}) scale(${scale})`
  const cls = `c-${known ? role : 'plain'}${isWorking ? ' run' : ''}`
  return `<g transform="${place}" opacity="${dim ? 0.45 : 1}" shape-rendering="crispEdges"><g class="${cls}">${body}${group('la')}${group('lb')}</g></g>`
}
