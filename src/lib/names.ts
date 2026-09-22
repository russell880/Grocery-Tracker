/**
 * names.ts — deciding when two names mean the same food.
 *
 * Lowercase, punctuation out, plurals singularised. "Eggs", "egg" and "EGG "
 * all match; nothing cleverer, because guessing harder would start matching
 * things a person never meant — and there is no way to see that it did.
 */

/** Words that only LOOK plural; stripping the 's' breaks the match. */
const KEEP = new Set(['hummus', 'couscous', 'molasses', 'asparagus', 'swiss'])

export function normalize(name: string | null | undefined): string {
  let s = (name ?? '').trim().toLowerCase()
  s = s.replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!s) return ''
  return s.split(' ').map(singular).join(' ')
}

/**
 * Plural -> singular, far enough for a kitchen and no further.
 *
 * The `ss` guard is what makes "cheese" and "cheeses" land on the same key:
 * without it the first becomes "chees" and the second stays "cheese".
 */
export function singular(w: string): string {
  if (KEEP.has(w) || w.length <= 3) return w
  if (w.endsWith('ies')) return w.slice(0, -3) + 'y'
  if (w.endsWith('oes')) return w.slice(0, -2) // tomatoes, potatoes
  if (w.endsWith('es') && /(ss|x|z|ch|sh)$/.test(w.slice(0, -2))) return w.slice(0, -2)
  if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

/**
 * Snap a parsed name onto one the kitchen already uses, if it is in there.
 *
 * "large white eggs" is not "eggs" to a string comparison, but dropping
 * leading words finds it — and matching what the recipes actually call for is
 * the entire point of importing a receipt.
 */
export function suggestName(name: string, known: Set<string>): string {
  const words = (name ?? '').split(' ').filter(Boolean)
  for (let i = 0; i < words.length; i++) {
    const tail = words.slice(i).join(' ')
    if (known.has(normalize(tail))) return tail
  }
  return name
}
