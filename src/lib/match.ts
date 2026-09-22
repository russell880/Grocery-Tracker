/** match.ts — can I cook this, with what is actually in the kitchen. */
import type { Item, Recipe } from '../types'
import { expiryStatus, today } from './food'
import { normalize } from './names'
import * as units from './units'

export interface Held {
  item: Item & { state: string; days: number | null; label: string; short: string }
  items: (Item & { state: string; days: number | null })[]
  qtyText: string
}

export interface Line {
  name: string
  qty: string
  staple: boolean
  have: boolean
  why: 'staple' | 'have' | 'short' | 'missing' | 'expired'
  item: Held['item'] | null
  got: string
  gap: string
}

export interface Match {
  lines: Line[]
  missing: number
  expired: number
  shortQty: number
  short: number
  makeable: boolean
}

export function withStatus(items: Item[], now = today()) {
  return items.map((i) => ({ ...i, ...expiryStatus(i.expiresOn, now) }))
}

/**
 * norm -> what the kitchen holds of it.
 *
 * A shelf can hold the same thing twice — an old carton and a new one. The row
 * shown is the good one that lasts longest (a fresh carton bought yesterday
 * must not be hidden behind last week's), and the quantities of every IN-DATE
 * copy are added together, because two half bags really are a full one. If any
 * of them cannot be read the total is unknown, which never counts against a
 * recipe.
 */
export function buildHave(items: Item[], now = today()): Map<string, Held> {
  const groups = new Map<string, ReturnType<typeof withStatus>>()
  for (const it of withStatus(items, now)) {
    const arr = groups.get(it.norm) ?? []
    arr.push(it)
    groups.set(it.norm, arr)
  }
  const out = new Map<string, Held>()
  for (const [norm, rows] of groups) {
    rows.sort((a, b) => rank(b) - rank(a))
    const good = rows.filter((r) => r.state !== 'gone')
    const qty = good.length ? units.total(good.map((r) => r.qty)) : null
    out.set(norm, { item: rows[0], items: rows, qtyText: units.fmt(qty) })
  }
  return out
}

// Good beats expired; among good ones, later expiry wins; undated is fine but
// does not outrank a dated item you can actually see.
function rank(it: { state: string; days: number | null }): number {
  if (it.state === 'gone') return -1e9 + (it.days ?? 0)
  return it.days ?? 1e6
}

/**
 * Three ways an ingredient can fail, kept apart because they are different
 * errands: MISSING (not there), EXPIRED (there but past its date — the whole
 * point of tracking the dates), and SHORT (there, in date, and provably not
 * enough). A quantity that cannot be read or converted is NOT a shortfall.
 */
export function matchRecipe(recipe: Recipe, have: Map<string, Held>): Match {
  const lines: Line[] = []
  let missing = 0, expired = 0, shortQty = 0
  for (const ing of recipe.ingredients) {
    const held = have.get(ing.norm) ?? null
    const item = held?.item ?? null
    let hasIt: boolean, why: Line['why'], gap = ''
    if (ing.staple) {
      hasIt = true; why = 'staple'
    } else if (!item) {
      hasIt = false; why = 'missing'; missing++
    } else if (item.state === 'gone') {
      hasIt = false; why = 'expired'; expired++
    } else {
      const res = units.compare(ing.qty, held!.qtyText)
      if (res.verdict === 'short') {
        hasIt = false; why = 'short'; gap = units.fmt(res.gap); shortQty++
      } else {
        hasIt = true; why = 'have'
      }
    }
    lines.push({
      name: ing.name, qty: ing.qty, staple: ing.staple, have: hasIt, why,
      item, got: held?.qtyText ?? '', gap,
    })
  }
  const short = missing + expired + shortQty
  return { lines, missing, expired, shortQty, short, makeable: short === 0 }
}

/** Names the kitchen already uses — for snapping a receipt line onto one. */
export function knownNames(items: Item[], recipes: Recipe[]): Set<string> {
  const out = new Set<string>()
  for (const i of items) out.add(i.norm)
  for (const r of recipes) for (const g of r.ingredients) out.add(g.norm)
  return out
}

export const ingredient = (name: string, qty = '', staple = false) => ({
  name, norm: normalize(name), qty, staple,
})
