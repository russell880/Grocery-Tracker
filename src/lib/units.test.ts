import { describe, expect, it } from 'vitest'
import { add, compare, fmt, parse, total } from './units'

describe('reading what a person typed', () => {
  const cases: [string, number, string][] = [
    ['2 lb', 2, 'lb'],
    ['a dozen', 1, 'dozen'],
    ['1 1/2 cups', 1.5, 'cup'],
    ['half gal', 0.5, 'gallon'],
    ['2 cans', 2, 'can'],
    ['400g', 400, 'g'],
    ['3', 3, ''],
    ['2-3 cups', 2, 'cup'],
    ['dozen', 1, 'dozen'],
    ['1 pint', 1, 'pint'],
  ]
  it.each(cases)('parses %s', (text, n, unit) => {
    const q = parse(text)
    expect(q).not.toBeNull()
    expect(q!.n).toBeCloseTo(n)
    expect(q!.unit).toBe(unit)
  })

  it.each(['some', 'salt to taste', '', 'a few', '2 x 3'])(
    'leaves %s unknown rather than guessing',
    (text) => expect(parse(text)).toBeNull(),
  )
})

describe('enough, short, or cannot tell', () => {
  it('3 eggs out of a dozen is enough', () =>
    expect(compare('3', 'a dozen').verdict).toBe('enough'))

  it('2 cups out of 1 is short, and says by how much', () => {
    const { verdict, gap } = compare('2 cups', '1 cup')
    expect(verdict).toBe('short')
    expect(fmt(gap)).toBe('1 cup')
  })

  it('converts within a family', () =>
    expect(compare('2 lb', '500 g').verdict).toBe('short'))

  // The two refusals that matter: guessing either would put wrong food in a
  // fridge, and an unknown never blocks a recipe.
  it('will not convert cups to pounds', () =>
    expect(compare('2 cups', '1 lb').verdict).toBe('unknown'))
  it('will not equate a can with a bag', () =>
    expect(compare('1 can', '2 bags').verdict).toBe('unknown'))
  it('treats an unreadable amount as unknown', () =>
    expect(compare('2 cups', 'some').verdict).toBe('unknown'))
})

describe('two of the same thing on the shelf', () => {
  it('adds up, keeping the larger unit', () =>
    expect(fmt(total(['1 lb', '8 oz']))).toBe('1 1/2 lb'))
  it('adds within volume', () =>
    expect(fmt(total(['1 cup', '1/2 cup']))).toBe('1 1/2 cups'))
  // A total that quietly skipped the carton it could not read would claim you
  // have less than you do.
  it('abandons the total if any carton is unreadable', () =>
    expect(total(['1 lb', 'some'])).toBeNull())
  it('refuses to add different families', () =>
    expect(add(parse('1 lb'), parse('1 cup'))).toBeNull())
})

describe('formatting', () => {
  it.each([
    ['2 lb', '2 lb'],
    ['1 lb', '1 lb'],
    ['1.5 cups', '1 1/2 cups'],
    ['0.25 cup', '1/4 cup'],
    ['3', '3'],
  ])('%s round-trips as %s', (input, want) => expect(fmt(parse(input))).toBe(want))
})
