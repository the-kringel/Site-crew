// Regenerates docs/crew-lineup.svg and docs/roles/*.svg: node docs/gen-crew-lineup.mjs
// The crew comes straight from the mod's hooks/crew-art.mjs.
// Optional: `--scale N --out file.svg` draws a zoomed lineup only, for pixel checks.
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { ROLES, ROLE_INFO, CREW_CSS, CRAB_BOX, crab } from '../hooks/crew-art.mjs'

const WHO = {
  apprentice: ['Haiku', 'any effort'],
  laborer: ['Sonnet', 'low / medium'],
  bricklayer: ['Sonnet high+', 'or Opus low'],
  carpenter: ['Opus', 'medium'],
  foreman: ['Opus', 'high'],
  engineer: ['Opus', 'xhigh / max'],
  architect: ['Fable', 'any effort'],
  inspector: ['testers and', 'reviewers'],
  surveyor: ['Explore agents', 'read-only search'],
  planner: ['Plan agents', 'site office'],
  sub: ['any other model', 'subcontractor'],
}

const arg = name => {
  const i = process.argv.indexOf(name)
  return i > 0 ? process.argv[i + 1] : undefined
}
const S = Number(arg('--scale') ?? 4)
const out = arg('--out') ?? fileURLToPath(new URL('./crew-lineup.svg', import.meta.url))

const css = /<style>([\s\S]*)<\/style>/.exec(CREW_CSS)[1]
const W = Math.max(170, CRAB_BOX * S + 50)
const top = 20
const base = top + 28 * S
const H = base + 90
const total = W * ROLES.length
let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${H}" width="${total}" height="${H}" font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif"><style>${css} text{fill:#C9D0DB;font-size:13px;text-anchor:middle} .n{font-weight:700;font-size:14px;fill:#EEF1F5} rect{shape-rendering:crispEdges}</style><rect width="${total}" height="${H}" fill="#2B303B"/>`
ROLES.forEach((role, i) => {
  const cx = i * W + W / 2
  const { name, color } = ROLE_INFO[role]
  const [a, b] = WHO[role]
  svg += crab(cx - (CRAB_BOX * S) / 2, top, role, { isWorking: true, scale: S })
  svg += `<rect x="${cx - 14}" y="${base + 14}" width="28" height="3" fill="${color}"/><text class="n" x="${cx}" y="${base + 32}">${name}</text><text x="${cx}" y="${base + 52}">${a}</text><text x="${cx}" y="${base + 70}">${b}</text>`
})
svg += '</svg>\n'
writeFileSync(out, svg)
console.log(`wrote ${out}`)

// One small working crab per role, for the README's tables: docs/roles/<role>.svg.
if (!arg('--out')) {
  const R = 2
  const dir = fileURLToPath(new URL('./roles/', import.meta.url))
  mkdirSync(dir, { recursive: true })
  for (const role of ROLES) {
    const w = CRAB_BOX * R
    const h = 28 * R
    writeFileSync(
      `${dir}${role}.svg`,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><style>${css} rect{shape-rendering:crispEdges}</style>${crab(0, 0, role, { isWorking: true, scale: R })}</svg>\n`,
    )
  }
  console.log(`wrote ${ROLES.length} role badges to ${dir}`)
}
