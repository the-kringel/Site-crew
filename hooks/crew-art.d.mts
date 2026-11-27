// The construction crew's drawings, shared by the mod (hooks/register.tsx) and the
// lineup generator (docs/gen-crew-lineup.mjs). Pure: no I/O.

/** Fills one rectangle of the 30×28 pixel grid; `cls` puts it in a named group. */
export type Fill = (x: number, y: number, w: number, h: number, c: string, cls?: string) => void

/** Each worker's role, cheapest model at the bottom of the site, planning at the top. */
export type Role =
  | 'apprentice'
  | 'laborer'
  | 'bricklayer'
  | 'carpenter'
  | 'inspector'
  | 'foreman'
  | 'engineer'
  | 'architect'
  | 'surveyor'
  | 'planner'
  | 'sub'

/** The capability ladder (apprentice to architect), then the roles that go by job (inspector, surveyor, planner, sub). */
export declare const ROLES: readonly Role[]

/** A role's display name, its accent (readable as text on light and dark panes) and what it holds. */
export declare const ROLE_INFO: Record<Role, { name: string; color: string; look: string }>

/** The drawing grid's width in pixels (the crab and its props fit in it). */
export declare const CRAB_BOX: number

/** All crew animations in one `<style>` block; `prefers-reduced-motion` stops them. */
export declare const CREW_CSS: string

export declare const CLAY: string
export declare const INK: string

/** The shared crab: `armFront` raises the right claw (negative is up); `armCls` lets it move with a prop. */
export declare function crabBody(f: Fill, armFront?: number, armCls?: string): void

/** Draws `rows` of characters at (x, y), one pixel each; `.` is transparent, other characters map through `map`. */
export declare function stamp(f: Fill, x: number, y: number, rows: string[], map: Record<string, string>, cls?: string): void

/**
 * One crew member as an SVG `<g>`, placed at (x, y) and scaled. `isWorking` runs the walk and the
 * role's own prop animation; `dim` greys it out (a finished worker); `mirror` faces it left.
 * An unknown role draws the plain crab.
 */
export declare function crab(
  x: number,
  y: number,
  role: Role | string,
  opts?: { dim?: boolean; isWorking?: boolean; scale?: number; mirror?: boolean },
): string
