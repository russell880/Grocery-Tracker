import { describe, expect, it } from 'vitest'
import {
  cleanName, guessCategory, guessDays, itemsSold, looksInStore, parseText,
  upcCheckDigit, upcFull,
} from './receipts'

/**
 * These fixtures are transcribed from real Walmart receipts, including the
 * real OCR mangles. Store, card and transaction numbers are INVENTED — a real
 * receipt's transaction data does not belong in a repository.
 */
const TILL = `WAL*MART
0000000000 Mgr. TEST
ST# 0000 OP# 0000 TE# 00 TR# 0000
FEMALE CART 004740066686 8.98
PRO TP INTE 031015888767 13.568
PUMPKIN 290 007874206701 F 2.97
PUMPKIN 290 007874206701 F 2.97
POTATOES 000000004072 F
2.96 lb @ 1.0 lb /0.98 2.90
WHITE ONION 003492400775 F
0.92 1b @ 1.0 lb /1.44 1.32
BROC FLORET 068113132884 F 2.58
BANANAS 740400390004 F
2.39 lb @ 1.0 lb /0.40 0.96
LIME BULK 000000004048 F 0.23
LIME BULK 000000004048 F
2 AT 1 FOR 0.23 0.46
HL GRD CKN 007274554169 F 3.92
SWAG HOT 007602000572 F FaBd
GV ROUNDS 019434644721 F
1.00 oz @ 1.0 oz /3.42 3.42
DRS CAESAR 007020050439 F a.98
EGGS 12CT 007874212707 F 1.67
DOWNY 21.10 003077222014 15.07
SUBTOTAL 180.81
TOTAL 185.57
VISA DEBIT TEND 185.57
CHANGE DUE 0.00
AID A0000000000000
TERMINAL # 00000000
REF # 624326832172
# ITEMS SOLD 16
TC# 0000 0000 0000 0000 0000 0`

describe('a full till receipt', () => {
  const lines = parseText(TILL)
  const by = Object.fromEntries(lines.map((l) => [l.name, l]))

  it('is recognised as a till receipt', () => expect(looksInStore(TILL)).toBe(true))
  it('reads its own item count', () => expect(itemsSold(TILL)).toBe(16))
  it('finds every line and nothing else', () =>
    expect(lines.length).toBe(16))

  // A twelve-digit reference number is indistinguishable from a barcode.
  it('does not mistake REF # for an item', () =>
    expect(lines.some((l) => l.name.includes('ref'))).toBe(false))
  it('ignores totals, card and terminal lines', () =>
    expect(lines.some((l) => /total|visa|aid|terminal|change/.test(l.name))).toBe(false))

  // The bug a two-item receipt could never show: the price of a weighed item
  // is on the NEXT line, so requiring one on the item line dropped it.
  it('finds a weighed item', () => expect(by.potatoes).toBeTruthy())
  it('takes its weight as the quantity', () => expect(by.potatoes.qty).toBe('2.96 lb'))
  it('and its price from the line below', () => expect(by.potatoes.price).toBe(2.9))
  it('survives OCR reading "lb" as "1b"', () =>
    expect(by['white onion'].qty).toBe('0.92 lb'))
  it('handles an oz-priced item', () => expect(by.rounds.qty).toBe('1.00 oz'))
  it('reads a multi-buy line', () =>
    expect(lines.filter((l) => l.name === 'lime').some((l) => l.qty === '2' && l.price === 0.46)).toBe(true))

  // A barcode makes a line an item; a price OCR could not read does not unmake it.
  it.each([['pro tp inte', '13.568'], ['swag hot', 'FaBd'], ['drs caesar', 'a.98']])(
    '%s survives a price garbled as %s', (name) => {
      expect(by[name]).toBeTruthy()
      expect(by[name].price).toBeNull()
    })

  it('tells food from non-food by the F flag', () => {
    expect(by.potatoes.food).toBe(true)
    expect(by['female cart'].food).toBe(false)
    expect(by.downy.food).toBe(false)
  })
  it('labels non-food as such, not as unreadable', () =>
    expect(by['female cart'].why).toBe('not_food'))
  it('expands till abbreviations', () => expect(by['ground chicken']).toBeTruthy())
  it('never leaves a stub name', () =>
    expect(lines.filter((l) => l.name.length <= 3)).toEqual([]))
})

describe('names', () => {
  it.each([
    ['FG CHKN BRST', 'chicken breast'],
    ['GV SHRD CHDR CHZ', 'shredded cheddar cheese'],
    ['BNLS SKNLS CHKN THGH', 'boneless skinless chicken thigh'],
    ['GV PNT BTR', 'peanut butter'],
    ['GRND BF 80/20', 'ground beef'],
    ['MKTSIDE SPNCH', 'spinach'],
    ['PKG SALAD', 'salad'],
    ['ROOTBEER', 'root beer'],
  ])('%s -> %s', (a, b) => expect(cleanName(a)).toBe(b))

  it('leaves an unknown abbreviation alone rather than guessing', () =>
    expect(cleanName('ZQX PLRB')).toBe('zqx plrb'))
  // "GV WHOLE GA" lost brand and packaging word and came back as "ga".
  it('keeps enough of a name to be recognisable', () =>
    expect(cleanName('GV WHOLE GA').length).toBeGreaterThan(3))
})

describe('category and shelf life', () => {
  it('pepperoni is meat, though it contains "pepper"', () =>
    expect(guessCategory('pepperoni')[0]).toBe('meat'))
  it('frozen beats the food type, because it decides the drawer', () =>
    expect(guessCategory('frozen broccoli florets')[0]).toBe('frozen'))
  it('a recognised tin keeps the pantry year', () =>
    expect(guessDays('progrso soup', 'pantry', true)).toBeGreaterThan(300))
  // The error that lets food rot unnoticed.
  it('but an unrecognisable line does NOT', () =>
    expect(guessDays('swag hot', 'pantry', false)).toBeLessThan(90))
  it('green onions keep a week, not a dry onion month', () =>
    expect(guessDays('green onion', 'produce', true)).toBe(7))
  it('chicken is days, not weeks', () =>
    expect(guessDays('ground chicken', 'meat', true)).toBe(2))
})

describe('the barcode is not what the till printed', () => {
  it.each([
    ['002100061223', '021000612239'], // -> Kraft
    ['001200000910', '012000009105'], // -> PepsiCo
    ['007874235186', '078742351865'], // -> Great Value
  ])('%s is really %s', (printed, want) => expect(upcFull(printed)).toBe(want))

  it('none of them validate as printed', () =>
    expect(['002100061223', '001200000910'].some((p) => upcFull(p) === p)).toBe(false))
  it('leaves an already-valid UPC alone', () =>
    expect(upcFull('049000006346')).toBe('049000006346'))
  it.each(['', '123', 'abcdefghijkl'])('%s is not a barcode', (j) =>
    expect(upcFull(j)).toBeNull())
  it('computes the check digit correctly', () =>
    expect(upcCheckDigit('04900000634')).toBe(6))
})

describe('an online order is a different format', () => {
  const ONLINE = `Order# 2000123-45678
Great Value Whole Vitamin D Milk, 1 Gallon, 128 fl oz
Qty 1
$3.12
Freshness Guaranteed Boneless Skinless Chicken Breast, 3 lb Bag
Qty 2
$17.94
Marketside Baby Spinach, 10 oz Bag   1   $2.48
Order Total $23.54
Recommended for you
Great Value Sparkling Water, 12 oz
$0.98`
  const lines = parseText(ONLINE)
  it('is not mistaken for a till receipt', () => expect(looksInStore(ONLINE)).toBe(false))
  it('reads the three real items', () =>
    expect(lines.filter((l) => l.confident).map((l) => l.name))
      .toEqual(['milk', 'chicken breast', 'baby spinach']))
  it('turns the size in the name into a quantity', () =>
    expect(lines[0].qty).toBe('1 gallon'))
  it('multiplies the pack size by Qty', () =>
    expect(lines[1].qty).toBe('6 lb'))
  // A whole page handed over carries a recommendations rail that looks
  // exactly like items; those must not arrive pre-ticked.
  it('does not tick anything below the order total', () =>
    expect(lines.find((l) => l.name === 'sparkling water')?.why).toBe('after_total'))
})
