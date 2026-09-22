/**
 * shopping.ts — what to buy for the recipes you cannot make yet.
 *
 * One line per ingredient however many recipes want it, so a thing three
 * recipes need is not bought three times. Amounts ADD UP across the chosen
 * recipes — the list assumes you mean to cook all of them — and it buys the
 * GAP where the gap is known rather than the whole amount the recipe asks for.
 */
import type { Recipe } from '../types'
import type { Match } from './match'
import { normalize } from './names'
import * as units from './units'

export interface BuyLine {
  name: string
  amount: string
  why: string
  recipes: string[]
}

export function shoppingList(chosen: { recipe: Recipe; match: Match }[]): BuyLine[] {
  const acc = new Map<string, {
    name: string; why: string; total: units.Qty | null; raw: string[];
    sums: boolean; recipes: Set<string>
  }>()

  for (const { recipe, match } of chosen) {
    for (const line of match.lines) {
      if (line.have) continue
      const key = normalize(line.name)
      const e = acc.get(key) ?? {
        name: line.name, why: line.why, total: null, raw: [],
        sums: true, recipes: new Set<string>(),
      }
      e.recipes.add(recipe.name)
      if (line.why === 'expired') e.why = 'expired'
      // Buy the gap when it is known, else the whole amount asked for.
      const want = line.gap ? units.parse(line.gap) : units.parse(line.qty)
      if (!want) {
        // A line whose amount cannot be read still appears: a missing entry is
        // worse than an unquantified one.
        e.sums = false
        if (line.qty) e.raw.push(line.qty)
      } else if (!e.total) {
        e.total = want
      } else {
        const merged = units.add(e.total, want)
        if (!merged) { e.sums = false; e.raw.push(units.fmt(want)) }
        else e.total = merged
      }
      acc.set(key, e)
    }
  }

  const out: BuyLine[] = []
  for (const e of acc.values()) {
    let amount = units.fmt(e.total)
    if (!e.sums && e.raw.length) amount = (amount ? amount + ' + ' : '') + e.raw.join(' + ')
    out.push({ name: e.name, amount, why: e.why, recipes: [...e.recipes].sort() })
  }
  out.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
  return out
}

/** The same list as plain text — the point of an export is that it pastes. */
export function shoppingText(buy: BuyLine[], forRecipes: string[], date: string): string {
  const out = [`Shopping list - ${date}`, '']
  if (!buy.length) out.push('(nothing to buy)')
  for (const e of buy) out.push(`[ ] ${e.name}${e.amount ? ` - ${e.amount}` : ''}`)
  if (forRecipes.length) out.push('', 'for: ' + forRecipes.join(', '))
  return out.join('\n') + '\n'
}
