/**
 * units.ts — "do I have enough of it", not just "do I have it".
 *
 * Kitchen quantities are typed by a person in a hurry: "2 lb", "a dozen",
 * "1 1/2 cups", "2 cans", "half gal". This parses what it recognises and is
 * honest about the rest.
 *
 * THE RULE THAT MATTERS: an unrecognised quantity is UNKNOWN, and unknown
 * never blocks a recipe. Most people won't fill the quantity box in carefully,
 * and a tracker that refused to cook dinner over an unparsed "some" would be
 * worse than one that never counted at all. Only a shortfall it can actually
 * prove counts against you.
 */

export type Family = 'weight' | 'volume' | 'count'

export interface Qty {
  n: number
  unit: string // canonical unit name; '' is a bare count
  family: Family
  factor: number // unit -> family base (grams, millilitres, each)
  base: number // n * factor, what comparisons are done on
  container: boolean // true for things counted in packages (cans, bags, heads)
}

const WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, couple: 2,
  half: 0.5, quarter: 0.25,
}

interface UnitDef { family: Family; factor: number; plural: string; container: boolean }

const UNITS: Record<string, UnitDef> = {
  // weight, base gram
  g: { family: 'weight', factor: 1, plural: 'g', container: false },
  kg: { family: 'weight', factor: 1000, plural: 'kg', container: false },
  oz: { family: 'weight', factor: 28.3495, plural: 'oz', container: false },
  lb: { family: 'weight', factor: 453.592, plural: 'lb', container: false },
  // volume, base millilitre
  ml: { family: 'volume', factor: 1, plural: 'ml', container: false },
  l: { family: 'volume', factor: 1000, plural: 'l', container: false },
  tsp: { family: 'volume', factor: 4.929, plural: 'tsp', container: false },
  tbsp: { family: 'volume', factor: 14.787, plural: 'tbsp', container: false },
  'fl oz': { family: 'volume', factor: 29.574, plural: 'fl oz', container: false },
  cup: { family: 'volume', factor: 236.588, plural: 'cups', container: false },
  pint: { family: 'volume', factor: 473.176, plural: 'pints', container: false },
  quart: { family: 'volume', factor: 946.353, plural: 'quarts', container: false },
  gallon: { family: 'volume', factor: 3785.41, plural: 'gallons', container: false },
  // count, base each
  '': { family: 'count', factor: 1, plural: '', container: false },
  dozen: { family: 'count', factor: 12, plural: 'dozen', container: false },
  pair: { family: 'count', factor: 2, plural: 'pairs', container: false },
  // count, but counted in packages
  can: { family: 'count', factor: 1, plural: 'cans', container: true },
  jar: { family: 'count', factor: 1, plural: 'jars', container: true },
  bag: { family: 'count', factor: 1, plural: 'bags', container: true },
  box: { family: 'count', factor: 1, plural: 'boxes', container: true },
  bottle: { family: 'count', factor: 1, plural: 'bottles', container: true },
  package: { family: 'count', factor: 1, plural: 'packages', container: true },
  block: { family: 'count', factor: 1, plural: 'blocks', container: true },
  loaf: { family: 'count', factor: 1, plural: 'loaves', container: true },
  stick: { family: 'count', factor: 1, plural: 'sticks', container: true },
  bunch: { family: 'count', factor: 1, plural: 'bunches', container: true },
  head: { family: 'count', factor: 1, plural: 'heads', container: true },
  clove: { family: 'count', factor: 1, plural: 'cloves', container: true },
  slice: { family: 'count', factor: 1, plural: 'slices', container: true },
  handful: { family: 'count', factor: 1, plural: 'handfuls', container: true },
  sprig: { family: 'count', factor: 1, plural: 'sprigs', container: true },
}

const ALIAS: Record<string, string> = {
  gram: 'g', grams: 'g', gr: 'g',
  kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
  ounce: 'oz', ounces: 'oz', ozs: 'oz',
  pound: 'lb', pounds: 'lb', lbs: 'lb', '#': 'lb',
  millilitre: 'ml', milliliter: 'ml', mls: 'ml',
  litre: 'l', liter: 'l', litres: 'l', liters: 'l', ltr: 'l',
  teaspoon: 'tsp', teaspoons: 'tsp', tsps: 'tsp', t: 'tsp',
  tablespoon: 'tbsp', tablespoons: 'tbsp', tbsps: 'tbsp', tbs: 'tbsp', tb: 'tbsp',
  floz: 'fl oz', 'fluid ounce': 'fl oz', 'fluid ounces': 'fl oz',
  c: 'cup', cups: 'cup',
  pt: 'pint', pts: 'pint', pints: 'pint',
  qt: 'quart', qts: 'quart', quarts: 'quart',
  gal: 'gallon', gals: 'gallon', gallons: 'gallon',
  doz: 'dozen', dozens: 'dozen', dz: 'dozen',
  ct: '', count: '', each: '', ea: '', piece: '', pieces: '',
  pkg: 'package', pkgs: 'package', pack: 'package', packs: 'package',
}
// Every plural in the table resolves to its own canonical name.
for (const [canon, meta] of Object.entries(UNITS)) {
  if (meta.plural && meta.plural !== canon && !(meta.plural in ALIAS)) ALIAS[meta.plural] = canon
  if (!(canon + 's' in ALIAS)) ALIAS[canon + 's'] = canon
}

const NUM = String.raw`\d+\s+\d+/\d+|\d+\s*/\s*\d+|\d+(?:\.\d+)?|[A-Za-z]+`

/** Text -> Qty, or null when it cannot be read with confidence. */
export function parse(text: string | null | undefined): Qty | null {
  let s = (text ?? '').trim().toLowerCase()
  if (!s) return null
  s = s.replace(/\(.*?\)/g, ' ')
  s = s.replace(/^(?:about|approx\.?|around|roughly|~)\s+/, '')
  s = s.replace(/½/g, ' 1/2').replace(/¼/g, ' 1/4').replace(/¾/g, ' 3/4')
  // A range means at least the low end: "2-3 cups" is read as 2 cups.
  s = s.replace(/^(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*\d+(?:\.\d+)?/, '$1')
  s = s.replace(/[.,]$/, '').trim()

  const m = new RegExp(`^(${NUM})\\s*(.*)$`).exec(s)
  if (!m) return null
  const rawNum = m[1].trim()
  let rawUnit = m[2].trim().replace(/^of\s+/, '').trim()

  let n = parseNumber(rawNum)
  if (n === null) {
    // No number at all — but a bare unit still means one of them ("a dozen"
    // typed as "dozen", "can" for one can).
    const u = resolveUnit(rawNum)
    if (u === null || rawUnit) return null
    n = 1
    rawUnit = u
  }
  const unit = resolveUnit(rawUnit)
  if (unit === null) return null
  const def = UNITS[unit]
  return { n, unit, family: def.family, factor: def.factor, base: n * def.factor, container: def.container }
}

function parseNumber(tok: string): number | null {
  if (tok in WORDS) return WORDS[tok]
  const t = tok.replace(/\s*\/\s*/g, '/')
  let m = /^(\d+)\s+(\d+)\/(\d+)$/.exec(t) // 1 1/2
  if (m) {
    const c = Number(m[3])
    return c ? Number(m[1]) + Number(m[2]) / c : null
  }
  m = /^(\d+)\/(\d+)$/.exec(t) // 1/2
  if (m) {
    const c = Number(m[2])
    return c ? Number(m[1]) / c : null
  }
  const v = Number(t)
  return Number.isFinite(v) && t !== '' ? v : null
}

function resolveUnit(tok: string): string | null {
  const t = (tok ?? '').trim().replace(/[.\s]+$/, '')
  if (t === '') return ''
  if (t in UNITS) return t
  if (t in ALIAS) return ALIAS[t]
  const first = t.split(' ')[0]
  if (first in UNITS) return first
  if (first in ALIAS) return ALIAS[first]
  return null
}

/**
 * Can these two be measured against each other at all?
 *
 * Cups of flour against pounds of flour is not a conversion anyone can do
 * without knowing the flour, so it says no rather than inventing a density.
 * Two DIFFERENT packages (a can vs a bag) are the same refusal.
 */
export function comparable(a: Qty | null, b: Qty | null): boolean {
  if (!a || !b || a.family !== b.family) return false
  if (a.container && b.container && a.unit !== b.unit) return false
  return true
}

export type Verdict = 'enough' | 'short' | 'unknown'

export function compare(needText: string, haveText: string): { verdict: Verdict; gap: Qty | null } {
  const need = parse(needText)
  const have = parse(haveText)
  if (!comparable(need, have)) return { verdict: 'unknown', gap: null }
  const gap = need!.base - have!.base
  if (gap <= 1e-6) return { verdict: 'enough', gap: null }
  return {
    verdict: 'short',
    gap: { ...need!, n: gap / need!.factor, base: gap },
  }
}

/** Two of the same thing on the shelf, totalled. null if they don't add. */
export function add(a: Qty | null, b: Qty | null): Qty | null {
  if (!comparable(a, b)) return null
  // Keep the larger unit so a total reads as "2 lb", not "907 g".
  const keep = a!.factor >= b!.factor ? a! : b!
  const base = a!.base + b!.base
  return { ...keep, n: base / keep.factor, base }
}

/**
 * Sum a shelf's worth of quantities, or null if any of them is unreadable.
 *
 * All-or-nothing on purpose: a total that quietly ignored the carton it
 * couldn't read would claim you have less than you do.
 */
export function total(texts: string[]): Qty | null {
  if (!texts.length) return null
  const parsed = texts.map(parse)
  if (parsed.some((p) => p === null)) return null
  let out = parsed[0]!
  for (const p of parsed.slice(1)) {
    const merged = add(out, p)
    if (!merged) return null
    out = merged
  }
  return out
}

/** A Qty back into something a person would have typed. */
export function fmt(q: Qty | null): string {
  if (!q) return ''
  const n = Math.round((q.n + 1e-9) * 100) / 100
  let num: string
  if (Math.abs(n - Math.round(n)) < 0.01) {
    num = String(Math.round(n))
  } else if (Math.abs(n - Math.round(n * 4) / 4) < 0.01) {
    const whole = Math.floor(n)
    const frac = ({ 0.25: '1/4', 0.5: '1/2', 0.75: '3/4' } as Record<string, string>)[
      String(Math.round((n % 1) * 100) / 100)
    ]
    num = whole ? `${whole} ${frac}` : frac
  } else {
    num = String(n)
  }
  if (!q.unit) return num
  // Singular at or below one: "1/4 cup", not "1/4 cups". The Python this was
  // ported from said "cups" and nothing tested it.
  const word = n <= 1.009 ? q.unit : UNITS[q.unit].plural
  return `${num} ${word}`
}
