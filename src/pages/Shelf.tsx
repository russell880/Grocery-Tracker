import { useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { CATEGORIES, type Category } from '../types'
import { expiryStatus, iconFor, LOCATIONS, plusDays, today, whereFor } from '../lib/food'
import { normalize } from '../lib/names'
import { Empty, Fold } from '../components/ui'

/**
 * The kitchen drawn where things actually are: a fridge, a freezer and a
 * wooden cupboard, with food standing on shelves. The category decides which
 * unit a thing lands in; the planks are a repeating stripe behind the rows, so
 * a unit grows a new shelf whenever the food wraps.
 */
export default function Shelf() {
  const { data, addItem, removeItem } = useStore()
  const now = today()

  const items = useMemo(() => {
    const withState = data.items.map((i) => ({ ...i, ...expiryStatus(i.expiresOn, now) }))
    // Soonest to die first; undated last, since those are the ones with
    // nothing to worry about.
    return withState.sort((a, b) => {
      const ad = a.days === null ? Infinity : a.days
      const bd = b.days === null ? Infinity : b.days
      return ad - bd || a.name.localeCompare(b.name)
    })
  }, [data.items, now])

  const gone = items.filter((i) => i.state === 'gone').length
  const soon = items.filter((i) => i.state === 'soon').length

  return (
    <>
      <h1>What's in the kitchen</h1>

      {(gone > 0 || soon > 0) && (
        <p className="alert">
          {gone > 0 && <><b>{gone}</b> expired</>}
          {gone > 0 && soon > 0 && ' · '}
          {soon > 0 && <><b>{soon}</b> to use up in the next few days</>}
        </p>
      )}

      <p className="shopbtn">
        <a className="btn" href="#/receipt">📷 Put a shop away</a>
      </p>

      <Fold summary="+ Add one thing by hand">
        <AddForm onAdd={addItem} />
      </Fold>

      {LOCATIONS.map(({ key, label }) => {
        const mine = items.filter((i) => whereFor(i.category) === key)
        const unitGone = mine.filter((i) => i.state === 'gone').length
        return (
          <section className={`unit ${key}`} key={key}>
            <div className="unit-label">
              {label}
              <span className="sub">
                {mine.length} item{mine.length === 1 ? '' : 's'}
                {unitGone > 0 && ` · ${unitGone} expired`}
              </span>
            </div>
            <div className="case">
              <div className="shelves">
                {mine.map((it) => (
                  <div
                    className={`thing ${it.state}`}
                    key={it.id}
                    title={`${it.name}${it.qty ? ` — ${it.qty}` : ''} — ${it.label}`}
                  >
                    <button className="x" onClick={() => removeItem(it.id)}
                            title="Used it up / throw it out">✕</button>
                    <span className="art">{iconFor(it.name, it.category)}</span>
                    <span className="nm">{it.name}</span>
                    {it.qty && <span className="qty">{it.qty}</span>}
                    <span className={`tag ${it.state}`}>{it.short}</span>
                  </div>
                ))}
                {!mine.length && <p className="bare">empty</p>}
              </div>
            </div>
          </section>
        )
      })}

      {!items.length && (
        <Empty>Nothing on any shelf yet. Put a shop away, or add one thing by hand.</Empty>
      )}
    </>
  )
}

function AddForm({ onAdd }: { onAdd: (i: Parameters<ReturnType<typeof useStore>['addItem']>[0]) => void }) {
  const [name, setName] = useState('')
  const [qty, setQty] = useState('')
  const [category, setCategory] = useState<Category>('produce')
  const [expires, setExpires] = useState('')

  return (
    <form
      className="addbar"
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim()) return
        onAdd({
          name: name.trim(), norm: normalize(name), category, qty: qty.trim(),
          expiresOn: expires || null, addedOn: plusDays(0),
        })
        setName(''); setQty(''); setExpires('')
      }}
    >
      <input value={name} onChange={(e) => setName(e.target.value)}
             placeholder="Item (eggs, chicken thighs…)" required />
      <input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="How much" />
      <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <label className="datefield">
        expires
        <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
      </label>
      <button className="go">Add</button>
    </form>
  )
}
