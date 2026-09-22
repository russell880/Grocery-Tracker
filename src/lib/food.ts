/** food.ts — what a thing is, where it lives, and how long it keeps. */
import type { Category, Location } from '../types'

/** How many days before the date an item counts as "use it up". */
export const SOON_DAYS = 3

export type ExpiryState = 'gone' | 'soon' | 'ok' | 'none'

export function parseDate(s: string | null | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s.trim())) return null
  const [y, m, d] = s.trim().split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? dt : null
}

export function today(): Date {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}

export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function plusDays(days: number, from = today()): string {
  const d = new Date(from)
  d.setDate(d.getDate() + days)
  return isoDate(d)
}

export function expiryStatus(expiresOn: string | null, now = today()) {
  const d = parseDate(expiresOn)
  if (!d) return { state: 'none' as ExpiryState, days: null, label: 'no date', short: 'no date' }
  const days = Math.round((d.getTime() - now.getTime()) / 86400000)
  if (days < 0) {
    const n = -days
    return { state: 'gone' as ExpiryState, days, label: `expired ${n} day${n === 1 ? '' : 's'} ago`, short: 'expired' }
  }
  if (days === 0) return { state: 'soon' as ExpiryState, days, label: 'today', short: 'today' }
  if (days <= SOON_DAYS)
    return { state: 'soon' as ExpiryState, days, label: `${days} day${days === 1 ? '' : 's'} left`, short: `${days} day${days === 1 ? '' : 's'}` }
  return { state: 'ok' as ExpiryState, days, label: `${days} days left`, short: `${days} days` }
}

/** Where a category actually lives in a kitchen. */
const WHERE: Record<Category, Location> = {
  dairy: 'fridge', meat: 'fridge', produce: 'fridge', drinks: 'fridge',
  frozen: 'freezer', pantry: 'pantry', other: 'pantry',
}
export const LOCATIONS: { key: Location; label: string }[] = [
  { key: 'fridge', label: 'Fridge' },
  { key: 'freezer', label: 'Freezer' },
  { key: 'pantry', label: 'Pantry' },
]
export const whereFor = (c: Category): Location => WHERE[c] ?? 'pantry'

// --- artwork: an emoji per item, so the shelf reads at a glance -------------
const ICONS: [string, string][] = [
  ['egg', '🥚'], ['milk', '🥛'], ['cream', '🥛'], ['yogurt', '🥛'],
  ['cheese', '🧀'], ['cheddar', '🧀'], ['butter', '🧈'],
  ['chicken', '🍗'], ['turkey', '🍗'], ['beef', '🥩'], ['steak', '🥩'],
  ['pork', '🥓'], ['bacon', '🥓'], ['sausage', '🌭'], ['pepperoni', '🍕'],
  ['fish', '🐟'], ['salmon', '🐟'], ['tuna', '🐟'], ['shrimp', '🦐'],
  ['bread', '🍞'], ['ciabatta', '🍞'], ['tortilla', '🫓'], ['bagel', '🥯'],
  ['rice', '🍚'], ['pasta', '🍝'], ['spaghetti', '🍝'], ['noodle', '🍜'],
  ['flour', '🌾'], ['oat', '🥣'], ['granola', '🥣'], ['cereal', '🥣'],
  ['bean', '🫘'], ['lentil', '🫘'],
  ['apple', '🍎'], ['banana', '🍌'], ['orange', '🍊'], ['lemon', '🍋'],
  ['lime', '🍋'], ['berry', '🫐'], ['berries', '🫐'], ['grape', '🍇'],
  ['melon', '🍉'], ['peach', '🍑'], ['avocado', '🥑'],
  // 'tomato' before 'cherr', or "cherry tomatoes" comes out a cherry.
  ['tomato', '🍅'], ['cherr', '🍒'], ['potato', '🥔'], ['onion', '🧅'], ['garlic', '🧄'],
  ['pepper', '🌶️'], ['carrot', '🥕'], ['broccoli', '🥦'], ['lettuce', '🥬'],
  ['iceberg', '🥬'], ['spinach', '🥬'], ['kale', '🥬'], ['salad', '🥗'],
  ['corn', '🌽'], ['mushroom', '🍄'], ['cucumber', '🥒'], ['pickle', '🥒'],
  ['pumpkin', '🎃'], ['cilantro', '🌿'], ['herb', '🌿'],
  ['oil', '🫒'], ['salt', '🧂'], ['sugar', '🍬'], ['honey', '🍯'],
  ['sauce', '🥫'], ['soup', '🥫'], ['pesto', '🥫'], ['juice', '🧃'],
  ['coffee', '☕'], ['tea', '🍵'], ['water', '💧'], ['wine', '🍷'],
  ['beer', '🍺'], ['chocolate', '🍫'], ['cookie', '🍪'], ['crouton', '🍞'],
  ['nut', '🥜'], ['peanut', '🥜'], ['ice cream', '🍨'], ['pizza', '🍕'],
]
const CAT_ICON: Record<Category, string> = {
  produce: '🥬', dairy: '🥛', meat: '🍖', pantry: '🥫',
  frozen: '🧊', drinks: '🧃', other: '🍽️',
}

export function iconFor(name: string, category: Category = 'other'): string {
  const low = (name ?? '').toLowerCase()
  for (const [key, art] of ICONS) if (low.includes(key)) return art
  return CAT_ICON[category] ?? '🍽️'
}
