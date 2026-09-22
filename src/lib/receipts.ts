/**
 * receipts.ts — turn a Walmart receipt into shelf rows.
 *
 * Walmart prints receipts two completely different ways and this works out
 * which it is looking at:
 *
 *   IN-STORE (what the app exports for a shop you walked around)
 *       ROOTBEER       001200000910 F    2.48
 *       30 GAL BAGS    007874235282      9.22
 *                      # ITEMS SOLD 2
 *   No dollar signs, abbreviated names, and three things worth having: a UPC
 *   (a permanent id, so a corrected name is remembered by BARCODE however the
 *   till spells it next time), an F flag (SNAP/food-eligibility, which is very
 *   nearly "is this food" — the bin bags do not carry it), and its own item
 *   count, which is a free check on the OCR.
 *
 *   ONLINE ORDER
 *       Great Value Whole Milk, 1 Gallon
 *       Qty 1
 *       $3.12
 *   Long names, dollar signs, and the size inside the name.
 *
 * WHAT THIS MODULE WILL NOT DO: write to the shelf. Every line it reads, and
 * every line it could NOT read, goes to a review page for a person to confirm.
 * A receipt says nothing about when food goes off, so the expiry date is a
 * GUESS from a shelf-life table. Silently adding a wrong date would be worse
 * than adding nothing.
 */
import type { Category } from '../types'
import * as units from './units'

export interface ParsedLine {
  name: string
  qty: string
  category: Category
  categorySure: boolean
  price: number | null
  upc: string
  flag: string
  food: boolean
  confident: boolean
  why: 'ok' | 'unread' | 'after_total' | 'not_food'
  raw: string
}

// --- what is not an item ---------------------------------------------------
const JUNK = new RegExp(
  '^\\s*(' +
    'sub\\s*total|total|tax|tip|fee|savings|discount|coupon|' +
    'order\\s*(number|\\#|total|summary|placed|date)|payment|balance|' +
    'delivery|pickup|shipping|handling|service|driver|tender|' +
    'visa|mastercard|amex|discover|debit|credit|ebt|gift\\s*card|' +
    'thank\\s*you|walmart|items?\\s*\\(|\\d+\\s*items?|' +
    'qty\\s*$|quantity\\s*$|price\\s*$|' + // bare COLUMN HEADINGS only
    'change\\s*due|account|store\\s*\\#|tc\\s*\\#|ref\\s*\\#|terminal\\s*\\#|auth|' +
    // page furniture, for when a whole browser page is handed over
    'recommended|sponsored|similar\\s*item|you\\s*might|buy\\s*it\\s*again|' +
    'based\\s*on\\s*your|popular|trending|save\\s*for\\s*later|' +
    'keep\\s*shopping|deals|related|customers\\s*also|add\\s*to\\s*cart|' +
    'in\\s*your\\s*cart|continue\\s*shopping|sign\\s*in|my\\s*items' +
    ')(?![a-z])',
  'i',
)

const DATEISH = new RegExp(
  '^\\s*(' +
    '(placed|ordered|delivered|arriving|estimated|shipped|picked|returned|' +
    'start|view|track|reorder|see|show|edit|cancel|substitut)\\w*\\b' +
    '|\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}\\b' +
    '|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\\w*\\s+\\d{1,2}\\b' +
    '|(mon|tue|wed|thu|fri|sat|sun)\\w*day\\b' +
    ')',
  'i',
)

const PRICE = /\$\s*(\d+(?:\.\d{2})?)/
const BARE_PRICE = /^\s*(\d+\.\d{2})\s*$/
const QTY = /(?:\bqty\b|\bquantity\b)\s*:?\s*(\d+)|^\s*(\d+)\s*[x×]\s|[x×]\s*(\d+)\s*$/i
// Long, comma'd names are products; a short bare phrase is a heading.
const PRODUCTISH = /,|\b\w+\s+\w+\s+\w+/
const END_OF_ORDER =
  /^\s*(order\s*total|grand\s*total|total\s*:|total\s+\$|amount\s*(charged|paid)|payment\s*method)/i

/**
 * The till's item line. The BARCODE is what makes a line an item — not the
 * price, which OCR garbles ("7.97" comes back as "FaBd") and which a pantry
 * does not care about anyway. One space is enough between the columns: OCR
 * collapses the till's wide gaps, and requiring two made every scanned
 * receipt fall through to the online parser and come out as junk.
 */
const INSTORE = new RegExp(
  '^\\s*(?<name>.*?[A-Za-z].*?)\\s+(?<upc>\\d{9,14})' +
    '(?:\\s+(?<flag>[A-Z]))?(?:\\s+(?<price>\\d+\\.\\d{2})(?!\\d))?.*$',
)

// Continuation lines, which carry the quantity AND often the only price:
//     2.96 lb @ 1.0 lb /0.98     2.90      loose produce, sold by weight
//     2 AT 1 FOR 0.23            0.46      multi-buy
// The boundary goes on the WORD only: "@" followed by a space has no word
// boundary after it, so (?:@|at)\b silently never matched a weighed line.
const AT_QTY = /^\s*(\d+)\s*(?:\bat\b|@)/i
// OCR reads "lb" as "1b" (l -> 1) in small print; the variants are normalised.
const WEIGH = /^\s*(\d+(?:\.\d+)?)\s*(lb|1b|ib|\|b|oz|0z|o2|kg|kq)\b\s*(?:\bat\b|@)/i
const UNIT_OCR: Record<string, string> = { '1b': 'lb', ib: 'lb', '|b': 'lb', '0z': 'oz', o2: 'oz', kq: 'kg' }
const LAST_PRICE = /(\d+\.\d{2})(?!.*\d+\.\d{2})/
/**
 * "# ITEMS SOLD 2" — the receipt's own count, and a free check on the OCR.
 * Deliberately loose: OCR sprays stray punctuation into big bold text
 * ("# 'ITEMS SOLD 3" is a real reading), so this anchors on the words.
 */
const SOLD = /item\w*\W+sold\W+(\d+)/i

export function itemsSold(text: string): number | null {
  const m = SOLD.exec(text ?? '')
  return m ? Number(m[1]) : null
}

export function looksInStore(text: string): boolean {
  return (text ?? '').split('\n').some((l) => INSTORE.test(l))
}

export function parseText(text: string): ParsedLine[] {
  return looksInStore(text) ? parseInStore(text) : parseOnline(text)
}

// --- the in-store (till) receipt -------------------------------------------

export function parseInStore(text: string): ParsedLine[] {
  const lines = (text ?? '').split('\n')
  // The F flag is trusted only on a receipt that uses flags at all: on one
  // that prints none, treating every line as non-food would untick the shop.
  const usesFlags = lines.some((l) => INSTORE.exec(l)?.groups?.flag === 'F')
  const out: ParsedLine[] = []
  for (const line of lines) {
    if (JUNK.test(line.trim())) continue
    const m = INSTORE.exec(line)
    if (m?.groups) {
      const g = m.groups
      const rawName = (g.name ?? '').trim()
      const flag = g.flag ?? ''
      const food = usesFlags ? flag === 'F' : true
      const name = cleanName(rawName) || rawName.toLowerCase()
      const [category, categorySure] = guessCategory(`${name} ${rawName}`)
      // A size in the name is the quantity for food ("1 GAL MILK"), but not
      // for hardware, where "30 GAL BAGS" is a capacity, not 30 gallons.
      const size = SIZE.exec(rawName)
      const qty = size && food ? sizeToQty(size[0], 1) : ''
      out.push({
        name, qty, category, categorySure,
        price: g.price ? Number(g.price) : null,
        upc: g.upc ?? '', flag, food,
        confident: food, why: food ? 'ok' : 'not_food',
        raw: line.trim(),
      })
      continue
    }
    if (!out.length) continue
    const last = out[out.length - 1]
    const w = WEIGH.exec(line)
    const at = w ? null : AT_QTY.exec(line)
    if (w) {
      const unit = w[2].toLowerCase()
      last.qty = `${w[1]} ${UNIT_OCR[unit] ?? unit}`
    } else if (at) {
      last.qty = at[1]
    }
    if ((w || at) && last.price === null) {
      const p = LAST_PRICE.exec(line)
      if (p) last.price = Number(p[1])
    }
  }
  return out
}

// --- the online order ------------------------------------------------------

function parseOnline(text: string): ParsedLine[] {
  const out: ParsedLine[] = []
  let pending: string | null = null
  let pendingQty = 1
  let pendingRaw = ''
  let pastTotal = false

  const flush = (price: number | null = null) => {
    if (!pending) return
    // An unpriced leftover is only salvaged when it reads like a product.
    if (price === null && !PRODUCTISH.test(pending) && !SIZE.test(pending)) return
    const line = fromName(pending, pendingQty)
    line.price = price
    line.raw = pendingRaw
    if (pastTotal) { line.confident = false; line.why = 'after_total' }
    else if (price === null) { line.confident = false; line.why = 'unread' }
    out.push(line)
  }

  for (const rawLine of (text ?? '').split('\n')) {
    const line = rawLine.trim()
    if (END_OF_ORDER.test(line)) { flush(); pending = null; pastTotal = true }
    if (line.length < 3 || JUNK.test(line) || DATEISH.test(line)) continue

    const priceM = PRICE.exec(line) ?? BARE_PRICE.exec(line)
    let body = line.replace(PRICE, ' ').replace(BARE_PRICE, ' ')
    const qtyM = QTY.exec(body)
    let qtyN: number | null = null
    if (qtyM) {
      qtyN = Number(qtyM.slice(1).find((g) => g !== undefined))
      body = body.replace(QTY, ' ')
    }
    body = body.replace(/\s{2,}/g, ' ').replace(/^[\s.:\-|]+|[\s.:\-|]+$/g, '')
    body = body.replace(/[\s|]+\d+\.\d{2}\s*$/, '').trim()
    const hasWords = /[a-z]{3}/i.test(body)

    if (hasWords && priceM) {
      flush()
      pending = body; pendingQty = qtyN ?? 1; pendingRaw = line
      flush(Number(priceM[1])); pending = null
    } else if (hasWords) {
      flush()
      pending = body; pendingQty = qtyN ?? 1; pendingRaw = line
    } else if (qtyN !== null && pending) {
      pendingQty = qtyN
    } else if (priceM && pending) {
      flush(Number(priceM[1])); pending = null
    }
  }
  flush()
  return out
}

function fromName(body: string, qtyN: number): ParsedLine {
  const size = SIZE.exec(body)
  const qty = size ? sizeToQty(size[0], qtyN) : qtyN > 1 ? String(qtyN) : ''
  const name = cleanName(body)
  const [category, categorySure] = guessCategory(`${name} ${body}`)
  return {
    name, qty, category, categorySure, price: null, upc: '', flag: '',
    food: true, confident: Boolean(name) && name.length > 2, why: 'ok', raw: body,
  }
}

function sizeToQty(sizeText: string, qtyN: number): string {
  const q = units.parse(sizeText)
  if (!q) return sizeText.trim()
  if (qtyN > 1) return units.fmt(units.parse(`${q.n * qtyN} ${q.unit}`) ?? q)
  return units.fmt(q)
}

// --- cleaning a name -------------------------------------------------------

// Longest alternative FIRST and a trailing \b: with "g" ahead of "gallon" the
// alternation matches the G of "1 Gallon" and calls it one gram.
const SIZE =
  /(\d+(?:\.\d+)?\s*(?:fl\s*oz|gallons|gallon|gal|liter|litre|pound|lbs|lb|quart|qt|pint|pt|count|ct|pack|pk|oz|kg|ml|g|l)\b|\b(?:half\s+)?(?:gallon|quart|pint|dozen)\b)/i

const LABEL =
  /\b(vitamin\s*d|grade\s*a|\d+\s*%|reduced\s*fat|low\s*fat|fat\s*free|nonfat|non\s*fat|unsalted|no\s*salt\s*added)\b/gi
const TILL_ABBR = /\b(gv|fg|mktside|mktsd|mkt|sc|eq|pc|bg|wm)\b|\b(lg|sm|md|xl|xlg|reg)\b/gi
const PACKAGING =
  /\b(bag|box|bottle|can|cans|jar|carton|package|pack|tub|tray|container|frozen|fresh|organic|boneless|skinless|sliced|shredded|chopped|whole|large|small|medium|family\s*size|value\s*size)\b/gi
const BRANDS = [
  'great value', 'freshness guaranteed', 'marketside', 'bettergoods',
  "sam's choice", 'sams choice', 'equate', "parent's choice",
  'clear american', "member's mark", 'wonder', 'oreo',
]

/**
 * Till abbreviations, expanded — a receipt rarely says what the thing is.
 * Only the unambiguous ones: "WHT" is white or wheat depending on the aisle,
 * and a confident wrong guess is worse on a review page than an obvious stub.
 */
const ABBREV: Record<string, string> = {
  chkn: 'chicken', chk: 'chicken', ckn: 'chicken', brst: 'breast',
  bnls: 'boneless', sknls: 'skinless', thgh: 'thigh', grnd: 'ground',
  grd: 'ground', bf: 'beef', prk: 'pork', sausg: 'sausage', bcn: 'bacon',
  shrmp: 'shrimp', slmn: 'salmon', tky: 'turkey', turke: 'turkey',
  mlk: 'milk', chz: 'cheese', chs: 'cheese', chse: 'cheese', chdr: 'cheddar',
  mozz: 'mozzarella', parm: 'parmesan', shrd: 'shredded', crm: 'cream',
  btr: 'butter', bttr: 'butter', yog: 'yogurt', yogrt: 'yogurt', egg: 'eggs',
  brd: 'bread', brea: 'bread', tort: 'tortilla', tortlla: 'tortilla',
  crkr: 'cracker', ckie: 'cookie', cky: 'cookie', spght: 'spaghetti',
  ptato: 'potato', pototo: 'potato', potatoe: 'potato', tomto: 'tomato',
  onn: 'onion', lett: 'lettuce', brocc: 'broccoli', broc: 'broccoli',
  carr: 'carrot', bnna: 'banana', bnana: 'banana', aplle: 'apple',
  spnch: 'spinach', avo: 'avocado', mshrm: 'mushroom',
  jce: 'juice', juc: 'juice', wtr: 'water', cofe: 'coffee',
  frzn: 'frozen', frz: 'frozen', org: 'organic', veg: 'vegetable',
  sld: 'salad', drsg: 'dressing', sce: 'sauce', sau: 'sauce',
  pnt: 'peanut', slcd: 'sliced', smkd: 'smoked', rstd: 'roasted',
  sthrn: 'southern', rootbeer: 'root beer', baco: 'bacon',
  applew: 'applewood', breastl: 'breast', florets: 'floret',
  strawberrie: 'strawberries', rnds: 'rounds', sug: 'sugar', pwdr: 'powdered',
  sou: 'soup', frnch: 'french', garlc: 'garlic', swt: 'sweet',
  vinega: 'vinegar', evrythn: 'everything', bnlsbrs: 'boneless breast',
  hwc: 'heavy whipping cream', qkr: 'quaker', grnla: 'granola',
  phily: 'philadelphia', tripl: 'triple', berrie: 'berries', smthie: 'smoothie',
  // label noise that expands to nothing
  hl: '', abf: '', pkg: '', bulk: '', bg: '', sk: '', ms: '', pd: '', hf: '',
}

/**
 * The food, with the brand and the packaging words taken off.
 *
 * THREE STAGES, because stripping can leave nothing: "GV WHOLE GA" lost its
 * brand and its packaging word and came back as "ga". If the full strip
 * leaves a stub, less is taken off; if that still leaves a stub the printed
 * line is used as-is. A clumsy name beats a meaningless one.
 */
export function cleanName(body: string): string {
  const full = strip(body, true, true)
  if (!isStub(full)) return full
  const lighter = strip(body, false, true)
  if (!isStub(lighter)) return lighter
  return strip(body, false, false) || lighter || full
}

const isStub = (n: string) => (n ?? '').length <= 3

function strip(body: string, packaging: boolean, brands: boolean): string {
  let s = (body ?? '').toLowerCase()
  s = s.replace(/\(.*?\)/g, ' ')
  if (brands) for (const b of BRANDS) s = s.split(b).join(' ')
  s = s.split(',')[0]
  s = s.replace(new RegExp(SIZE.source, 'gi'), ' ')
  s = s.replace(LABEL, ' ')
  if (brands) s = s.replace(TILL_ABBR, ' ')
  if (packaging) s = s.replace(PACKAGING, ' ')
  s = s.replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim()
  // An abbreviation can expand to nothing, so drop the empties or the name
  // comes back with a leading space.
  const words = s.split(' ').filter((w) => w && !/^\d+$/.test(w))
    .map((w) => (w in ABBREV ? ABBREV[w] : w)).filter(Boolean)
  return words.filter((w, i) => i === 0 || w !== words[i - 1]).join(' ')
}

// --- category and shelf life ----------------------------------------------

const CATS: [string[], Category][] = [
  // FIRST, deliberately: the category decides which unit a thing is stored
  // in, and frozen broccoli lives in the freezer rather than with the salad.
  [['frozen', 'ice cream', 'popsicle', 'pizza roll'], 'frozen'],
  [['milk', 'cream', 'yogurt', 'yoghurt', 'cheese', 'cheddar', 'mozzarella',
    'butter', 'egg', 'sour cream', 'cottage', 'brie', 'feta', 'parmesan',
    'provolone', 'ricotta', 'gouda', 'yog'], 'dairy'],
  [['chicken', 'beef', 'steak', 'pork', 'bacon', 'sausage', 'turkey', 'ham',
    'fish', 'salmon', 'tuna', 'shrimp', 'ground', 'breast', 'thigh', 'tilapia',
    'cod', 'brisket', 'ribs', 'pepperoni', 'salami', 'turke', 'meatball',
    'bratwurst', 'hot dog'], 'meat'],
  [['lettuce', 'spinach', 'kale', 'tomato', 'potato', 'onion', 'garlic',
    'carrot', 'broccoli', 'pepper', 'cucumber', 'apple', 'banana', 'orange',
    'berry', 'berries', 'grape', 'melon', 'avocado', 'lemon', 'lime',
    'mushroom', 'celery', 'salad', 'iceberg', 'romaine', 'cilantro', 'parsley',
    'strawberr', 'blueberr', 'raspberr', 'pumpkin', 'squash', 'zucchini',
    'cabbage', 'cauliflower', 'asparagus', 'floret', 'greens', 'herb',
    'scallion', 'leek', 'radish', 'beet', 'cherr', 'peach', 'plum', 'pear',
    'kiwi', 'mango'], 'produce'],
  [['juice', 'soda', 'cola', 'water', 'coffee', 'tea', 'beer', 'wine',
    'lemonade'], 'drinks'],
  // LAST, and only for things it recognises. Reaching the end of this list
  // without a match is what earns the short "I don't know what this is" shelf
  // life below, so a tin of soup must land HERE rather than in the fallback.
  [['soup', 'sugar', 'flour', 'pasta', 'spaghetti', 'noodle', 'rice',
    'vinegar', 'oil', 'cereal', 'granola', 'oat', 'bean', 'lentil', 'sauce',
    'pesto', 'salsa', 'cracker', 'cookie', 'chip', 'popcorn', 'honey', 'syrup',
    'jam', 'jelly', 'peanut butter', 'bread', 'bun', 'ciabatta', 'baguette',
    'focaccia', 'naan', 'pita', 'tortilla', 'bagel', 'muffin', 'crouton',
    'spice', 'seasoning', 'broth', 'stock', 'canned', 'tuna'], 'pantry'],
]

/** [category, did_we_actually_recognise_it] — the second value drives shelf life. */
export function guessCategory(text: string): [Category, boolean] {
  const low = (text ?? '').toLowerCase()
  for (const [words, cat] of CATS) if (words.some((w) => low.includes(w))) return [cat, true]
  return ['pantry', false]
}

// Days from buying it until it is likely off. A guess, shown to be corrected.
// Specific before general: "green onion" must be found before "onion".
const LIFE_WORD: [string, number][] = [
  ['green onion', 7], ['scallion', 7], ['spring onion', 7],
  ['milk', 7], ['cream', 10], ['yogurt', 14], ['cheese', 21], ['butter', 60],
  ['egg', 21], ['chicken', 2], ['ground', 2], ['beef', 4], ['steak', 4],
  ['pork', 4], ['fish', 2], ['salmon', 2], ['shrimp', 2], ['bacon', 7],
  ['sausage', 5], ['pepperoni', 14], ['lettuce', 6], ['spinach', 5],
  ['salad', 5], ['berry', 4], ['berries', 4], ['banana', 5], ['avocado', 4],
  ['tomato', 7], ['bread', 5], ['ciabatta', 4], ['bagel', 7], ['tortilla', 14],
  ['apple', 21], ['orange', 14], ['potato', 30], ['onion', 30], ['carrot', 21],
  ['iceberg', 7], ['cilantro', 7], ['strawberr', 4], ['pumpkin', 30],
  ['floret', 7], ['cherr', 5], ['blackberr', 4], ['raspberr', 4],
  ['blueberr', 7], ['parmesan', 30], ['granola', 120], ['pesto', 14],
  ['coffee', 180], ['crouton', 120],
]
const LIFE_CAT: Record<Category, number> = {
  produce: 7, dairy: 10, meat: 3, frozen: 180, drinks: 30, pantry: 365, other: 90,
}

/**
 * How long it probably lasts. A GUESS — the review page says so.
 *
 * An UNRECOGNISED item does not get the pantry's year. A till receipt is full
 * of names nothing can decode, and calling those shelf-stable for twelve
 * months is the one error this app must not make: it is the error that lets
 * food rot unnoticed. Six weeks instead — wrong for tinned goods, but wrong
 * in the direction that asks rather than the direction that hides.
 */
export function guessDays(name: string, category: Category, categorySure = true): number {
  const low = (name ?? '').toLowerCase()
  for (const [word, days] of LIFE_WORD) if (low.includes(word)) return days
  if (!categorySure) return 42
  return LIFE_CAT[category] ?? 90
}

/**
 * The real UPC-A behind what the till printed, or null.
 *
 * WHAT THE TILL PRINTS IS NOT A UPC. Walmart pads to twelve digits with a
 * leading zero and drops the CHECK DIGIT, so every number on the receipt
 * fails validation as-is — "002100061223" is not a barcode, but
 * "021000612239" is, and its 021000 prefix is Kraft, who make the
 * Philadelphia cream cheese on that line.
 */
export function upcCheckDigit(d11: string): number {
  let odd = 0, even = 0
  for (let i = 0; i < 11; i++) (i % 2 === 0 ? (odd += +d11[i]) : (even += +d11[i]))
  return (10 - ((3 * odd + even) % 10)) % 10
}

export function upcFull(printed: string | null | undefined): string | null {
  const d = (printed ?? '').replace(/\D/g, '')
  if (d.length === 12 && +d[11] === upcCheckDigit(d.slice(0, 11))) return d
  if (d.length === 12 && d[0] === '0') return d.slice(1) + upcCheckDigit(d.slice(1))
  if (d.length === 11) return d + upcCheckDigit(d)
  return null
}
