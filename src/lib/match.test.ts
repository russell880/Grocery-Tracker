import { describe, expect, it } from 'vitest'
import { buildHave, ingredient, matchRecipe } from './match'
import { plusDays } from './food'
import { normalize } from './names'
import type { Item, Recipe } from '../types'

const item = (name: string, qty: string, days: number | null): Item => ({
  id: name + days, name, norm: normalize(name), category: 'other', qty,
  expiresOn: days === null ? null : plusDays(days), addedOn: plusDays(0),
})

const recipe = (name: string, ings: ReturnType<typeof ingredient>[]): Recipe => ({
  id: name, name, minutes: null, notes: '', ingredients: ings, addedOn: plusDays(0),
})

describe('what stops a recipe', () => {
  it('nothing, when it is all there', () => {
    const have = buildHave([item('eggs', '6', 5)])
    expect(matchRecipe(recipe('omelette', [ingredient('eggs', '3')]), have).makeable).toBe(true)
  })

  it('a missing ingredient', () => {
    const m = matchRecipe(recipe('omelette', [ingredient('eggs', '3')]), buildHave([]))
    expect(m.makeable).toBe(false)
    expect(m.lines[0].why).toBe('missing')
  })

  // The whole point of tracking the dates.
  it('an EXPIRED one, reported separately from a missing one', () => {
    const have = buildHave([item('feta', '', -3)])
    const m = matchRecipe(recipe('salad', [ingredient('feta')]), have)
    expect(m.lines[0].why).toBe('expired')
    expect(m.expired).toBe(1)
  })

  it('and not enough of one, with the gap named', () => {
    const have = buildHave([item('rice', '1 cup', 90)])
    const m = matchRecipe(recipe('pot', [ingredient('rice', '3 cups')]), have)
    expect(m.lines[0].why).toBe('short')
    expect(m.lines[0].gap).toBe('2 cups')
  })
})

describe('what does not stop one', () => {
  it('a staple is assumed', () => {
    const m = matchRecipe(recipe('x', [ingredient('salt', '', true)]), buildHave([]))
    expect(m.makeable).toBe(true)
    expect(m.lines[0].why).toBe('staple')
  })
  // Most people will not fill the quantity box in carefully.
  it('an unreadable quantity never blocks', () => {
    const have = buildHave([item('saffron', 'a pinch', 200)])
    expect(matchRecipe(recipe('x', [ingredient('saffron', '2 threads')]), have).makeable).toBe(true)
  })
})

describe('the same thing twice on the shelf', () => {
  it('adds up, so two half bags are a full one', () => {
    const have = buildHave([item('rice', '1 cup', 90), item('rice', '2 cups', 120)])
    expect(matchRecipe(recipe('pot', [ingredient('rice', '3 cups')]), have).makeable).toBe(true)
  })
  it('and a fresh carton beats an expired one', () => {
    const have = buildHave([item('feta', '4 oz', -3), item('feta', '4 oz', 6)])
    expect(matchRecipe(recipe('salad', [ingredient('feta', '1 oz')]), have).makeable).toBe(true)
  })
})
