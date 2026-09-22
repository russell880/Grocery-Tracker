import { describe, expect, it } from 'vitest'
import { expiryStatus, iconFor, plusDays, whereFor } from './food'

describe('expiry', () => {
  it('past is gone', () => expect(expiryStatus(plusDays(-2)).state).toBe('gone'))
  it('today is soon', () => expect(expiryStatus(plusDays(0)).state).toBe('soon'))
  it('three days is soon', () => expect(expiryStatus(plusDays(3)).state).toBe('soon'))
  it('nine days is fine', () => expect(expiryStatus(plusDays(9)).state).toBe('ok'))
  it('no date is none', () => expect(expiryStatus(null).state).toBe('none'))
  it('junk is not a date', () => expect(expiryStatus('next tuesday').state).toBe('none'))
  // The tag has room for "expired"; the sentence belongs in the tooltip.
  it('has a short form for the shelf tag', () =>
    expect(expiryStatus(plusDays(-2)).short).toBe('expired'))
})

describe('where things live', () => {
  it.each([['dairy', 'fridge'], ['frozen', 'freezer'], ['other', 'pantry']] as const)(
    '%s goes in the %s', (c, l) => expect(whereFor(c)).toBe(l))
})

describe('artwork', () => {
  it('picks off the name first', () => expect(iconFor('cherry tomatoes')).toBe('🍅'))
  it('falls back to the category', () => expect(iconFor('whatever', 'frozen')).toBe('🧊'))
})
