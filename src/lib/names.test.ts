import { describe, expect, it } from 'vitest'
import { normalize, suggestName } from './names'

describe('normalize', () => {
  it.each([
    ['Eggs', 'egg'], ['egg', 'egg'], ['Potatoes', 'potato'],
    ['Cherry Tomatoes', 'cherry tomato'], ['Black Beans', 'black bean'],
    ['  OLIVE   OIL  ', 'olive oil'], ['Berries', 'berry'], ['Hummus', 'hummus'],
    ['Dishes', 'dish'], ['Boxes', 'box'], ['Glasses', 'glass'],
  ])('%s -> %s', (a, b) => expect(normalize(a)).toBe(b))

  // The ss guard: without it these land on different keys.
  it('cheese and cheeses are the same thing', () =>
    expect(normalize('cheese')).toBe(normalize('cheeses')))
  it('bean and beans are the same thing', () =>
    expect(normalize('bean')).toBe(normalize('beans')))
  it('but different foods stay different', () =>
    expect(normalize('chicken breast')).not.toBe(normalize('chicken thigh')))
})

describe('snapping onto names you already use', () => {
  it('finds the food inside a till name', () =>
    expect(suggestName('large white eggs', new Set(['egg']))).toBe('eggs'))
  it('and leaves it alone when nothing matches', () =>
    expect(suggestName('sweet peas', new Set(['rice']))).toBe('sweet peas'))
})
