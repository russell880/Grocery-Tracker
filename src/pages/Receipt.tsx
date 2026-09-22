import { useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { readReceipt } from '../lib/ocr'
import {
  guessDays, itemsSold, parseText, upcFull, type ParsedLine,
} from '../lib/receipts'
import { normalize, suggestName } from '../lib/names'
import { knownNames } from '../lib/match'
import { plusDays } from '../lib/food'
import { CATEGORIES, type Category } from '../types'
import { Fold } from '../components/ui'

interface Row {
  keep: boolean
  name: string
  parsedName: string
  parsedCategory: Category
  qty: string
  category: Category
  expires: string
  raw: string
  upc: string
  aliasKey: string
  learned: boolean
  onShelf: boolean
  why: ParsedLine['why']
  confident: boolean
}

export default function Receipt() {
  const { data, addItems, learn } = useStore()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [sold, setSold] = useState<number | null>(null)
  const [busy, setBusy] = useState<{ stage: string; pct: number } | null>(null)
  const [error, setError] = useState('')
  const [pasted, setPasted] = useState('')

  const known = useMemo(() => knownNames(data.items, data.recipes), [data])

  const build = (text: string) => {
    const found = parseText(text)
    if (!found.length) {
      setError("Nothing on that looked like a receipt. Try a clearer photo, or paste the text.")
      return
    }
    setSold(itemsSold(text))
    setRows(found.map((it) => {
      const upc12 = upcFull(it.upc) ?? ''
      // The barcode is the better key when there is one: it is the same next
      // year, where the printed text is only as stable as the till's spelling.
      const key = upc12 || normalize(it.raw || it.name)
      const alias = data.aliases.find((a) => a.key === key)
      const name = alias ? alias.name : suggestName(it.name, known)
      const category = alias ? alias.category : it.category
      const sure = alias ? true : it.categorySure
      return {
        keep: it.confident, name, parsedName: name, parsedCategory: category,
        qty: it.qty, category, expires: plusDays(guessDays(name, category, sure)),
        raw: it.raw, upc: upc12, aliasKey: key, learned: Boolean(alias),
        onShelf: known.has(normalize(name)), why: it.why, confident: it.confident,
      }
    }))
    setError('')
  }

  const onFile = async (file: File) => {
    setError(''); setRows(null)
    setBusy({ stage: 'starting', pct: 0.02 })
    try {
      const text = file.type === 'application/pdf'
        ? await Promise.reject(new Error('pdf'))
        : await readReceipt(file, (stage, pct) => setBusy({ stage, pct }))
      build(text)
    } catch (e) {
      setError(
        (e as Error).message === 'pdf'
          ? "PDFs aren't read on the phone — take a photo of the receipt, or paste the text."
          : "Couldn't read that image. A flatter, brighter photo usually fixes it.",
      )
    } finally {
      setBusy(null)
    }
  }

  const putAway = () => {
    if (!rows) return
    const keep = rows.filter((r) => r.keep && r.name.trim())
    addItems(keep.map((r) => ({
      name: r.name.trim(), norm: normalize(r.name), category: r.category,
      qty: r.qty.trim(), expiresOn: r.expires || null, addedOn: plusDays(0),
    })))
    // Learn only from a correction — storing every row would fill the table
    // with rows that say what the parser already worked out.
    for (const r of keep) {
      if (r.aliasKey && (r.name.trim() !== r.parsedName || r.category !== r.parsedCategory)) {
        learn({ key: r.aliasKey, name: r.name.trim(), category: r.category, learnedOn: plusDays(0) })
      }
    }
    setRows(null); setSold(null)
    window.location.hash = '#/shelf'
  }

  if (busy) {
    return (
      <>
        <h1>Reading the receipt</h1>
        <div className="progress"><div style={{ width: `${Math.round(busy.pct * 100)}%` }} /></div>
        <p className="sub">{busy.stage}… this runs on your phone, so a big shop
          takes a few seconds. The first time also downloads the reader (about
          6MB); after that it works with no signal at all.</p>
      </>
    )
  }

  if (rows) {
    const setRow = (i: number, patch: Partial<Row>) =>
      setRows((rs) => rs!.map((r, j) => (j === i ? { ...r, ...patch } : r)))
    const agree = sold === null || sold === rows.length
    return (
      <>
        <h1>What the receipt said</h1>
        {sold !== null && (
          <p className={`alert ${agree ? '' : 'bad'}`}>
            {agree
              ? <><b>{sold} items on the receipt, {rows.length} read.</b> They agree.</>
              : <><b>The receipt says {sold} item{sold === 1 ? '' : 's'}, and {rows.length} were
                  read off it.</b> Check the list against the paper.</>}
          </p>
        )}
        <p className="alert">{rows.length} line{rows.length === 1 ? '' : 's'} found. Untick
          anything you don't want. <b>The dates are guesses</b> — a receipt doesn't
          say when food goes off — so correct any that matter.</p>

        <datalist id="known">
          {[...new Set([...data.items.map((i) => i.name),
            ...data.recipes.flatMap((r) => r.ingredients.map((g) => g.name))])]
            .sort().map((n) => <option key={n} value={n} />)}
        </datalist>

        <table className="review"><tbody>
          {rows.map((r, i) => (
            <tr key={i} className={r.confident ? '' : 'unsure'}>
              <td><input type="checkbox" checked={r.keep}
                         onChange={(e) => setRow(i, { keep: e.target.checked })} /></td>
              <td>
                <input value={r.name} list="known"
                       onChange={(e) => setRow(i, { name: e.target.value })} />
                <div className="from">{r.raw}</div>
                <div className="flags">
                  {r.learned && <span className="pill ok">remembered{r.upc && ' by barcode'}</span>}
                  {r.onShelf && <span className="pill">already have some</span>}
                  {r.why === 'not_food' && <span className="pill">not food — the receipt didn't flag it</span>}
                  {r.why === 'after_total' && <span className="pill soon">below the order total — probably not yours</span>}
                  {r.why === 'unread' && <span className="pill gone">couldn't read this one</span>}
                </div>
              </td>
              <td><input value={r.qty} onChange={(e) => setRow(i, { qty: e.target.value })} /></td>
              <td>
                <select value={r.category}
                        onChange={(e) => setRow(i, { category: e.target.value as Category })}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </td>
              <td><input type="date" value={r.expires}
                         onChange={(e) => setRow(i, { expires: e.target.value })} /></td>
            </tr>
          ))}
        </tbody></table>

        <button className="go" onClick={putAway}>Put it all away</button>
        <button className="link" onClick={() => { setRows(null); setSold(null) }}>Start over</button>
        <p className="sub">A name you change here is remembered against its barcode,
          so the next receipt with that line won't ask again.</p>
      </>
    )
  }

  return (
    <>
      <h1>Put a shop away</h1>
      {error && <p className="flash bad">{error}</p>}

      <label className="pick">
        <input type="file" accept="image/*" capture="environment"
               onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f) }} />
        <span className="art">📷</span>
        <b>Photograph the receipt</b>
        <span className="sub">or choose the Walmart app's export from your photos</span>
      </label>

      <p className="sub">It reads the receipt <b>on this phone</b> — the photo is never
        uploaded anywhere. Nothing reaches the shelf until you've seen what it found.</p>

      <Fold summary="Paste the text instead">
        <form className="rform" onSubmit={(e) => { e.preventDefault(); build(pasted) }}>
          <textarea rows={9} value={pasted} onChange={(e) => setPasted(e.target.value)}
                    placeholder={'ROOTBEER  001200000910 F  2.48\n...'} />
          <button className="go">Read it</button>
        </form>
      </Fold>
    </>
  )
}
