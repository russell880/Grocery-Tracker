import { useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { buildHave, ingredient, matchRecipe } from '../lib/match'
import { iconFor, plusDays } from '../lib/food'
import type { Recipe } from '../types'
import { Empty } from '../components/ui'

export default function Recipes() {
  const { data, saveRecipe, removeRecipe } = useStore()
  const [editing, setEditing] = useState<Recipe | 'new' | null>(null)

  const matched = useMemo(() => {
    const have = buildHave(data.items)
    return [...data.recipes]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((recipe) => ({ recipe, match: matchRecipe(recipe, have) }))
  }, [data])

  if (editing) {
    return (
      <RecipeForm
        recipe={editing === 'new' ? null : editing}
        onCancel={() => setEditing(null)}
        onSave={(r) => { saveRecipe(r); setEditing(null) }}
      />
    )
  }

  return (
    <>
      <h1>Recipes</h1>
      <p className="shopbtn">
        <button className="btn" onClick={() => setEditing('new')}>+ New recipe</button>
      </p>

      {!matched.length && (
        <Empty>No recipes yet. Type in the ones you cook most often — those are
          what the shelf gets matched against.</Empty>
      )}

      <div className="rlist">
        {matched.map(({ recipe, match }) => (
          <article className={`recipe ${match.makeable ? 'can' : ''}`} key={recipe.id}>
            <header>
              <h2>{iconFor(recipe.name)} {recipe.name}</h2>
              <span className="sub">
                {recipe.minutes ? `${recipe.minutes} min · ` : ''}
                {recipe.ingredients.length} ingredients
              </span>{' '}
              {match.makeable
                ? <span className="pill ok">can make now</span>
                : <span className="pill soon">{match.short} short</span>}
            </header>
            <ul className="ings">
              {match.lines.map((l, i) => (
                <li className={l.why} key={i}>
                  <span className="tick">{l.have ? '✓' : '✗'}</span>
                  {l.name}{l.qty && <span className="sub"> {l.qty}</span>}
                  {l.why === 'staple' && <span className="sub"> (staple)</span>}
                  {l.why === 'expired' && <span className="sub"> on the shelf but expired</span>}
                  {l.why === 'short' && <span className="sub"> only {l.got} — {l.gap} short</span>}
                </li>
              ))}
            </ul>
            {recipe.notes && <p className="notes">{recipe.notes}</p>}
            <footer>
              <button className="link" onClick={() => setEditing(recipe)}>Edit</button>
              <button className="link" onClick={() => {
                if (confirm(`Delete ${recipe.name}?`)) removeRecipe(recipe.id)
              }}>Delete</button>
            </footer>
          </article>
        ))}
      </div>
    </>
  )
}

interface Row { name: string; qty: string; staple: boolean }

function RecipeForm({ recipe, onSave, onCancel }: {
  recipe: Recipe | null
  onSave: (r: Omit<Recipe, 'id'> & { id?: string }) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(recipe?.name ?? '')
  const [minutes, setMinutes] = useState(recipe?.minutes ? String(recipe.minutes) : '')
  const [notes, setNotes] = useState(recipe?.notes ?? '')
  const [rows, setRows] = useState<Row[]>(() => {
    const existing = (recipe?.ingredients ?? []).map((i) => ({ name: i.name, qty: i.qty, staple: i.staple }))
    return [...existing, ...Array.from({ length: 4 }, () => ({ name: '', qty: '', staple: false }))]
  })

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  return (
    <form className="rform" onSubmit={(e) => {
      e.preventDefault()
      const lines = rows.filter((r) => r.name.trim())
      if (!name.trim() || !lines.length) return
      onSave({
        id: recipe?.id,
        name: name.trim(),
        minutes: minutes ? Number(minutes) : null,
        notes: notes.trim(),
        ingredients: lines.map((r) => ingredient(r.name.trim(), r.qty.trim(), r.staple)),
        addedOn: recipe?.addedOn ?? plusDays(0),
      })
    }}>
      <h1>{recipe ? `Edit “${recipe.name}”` : 'New recipe'}</h1>

      <label>Name
        <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      </label>
      <label className="mins">Minutes
        <input type="number" min="0" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
      </label>

      <h3>Ingredients</h3>
      <p className="sub">Tick <b>staple</b> for things you always have (salt, oil,
        water) — they never count against you on the Cook page.</p>

      <div>
        {rows.map((r, i) => (
          <div className="irow" key={i}>
            <input value={r.name} placeholder="Ingredient"
                   onChange={(e) => setRow(i, { name: e.target.value })} />
            <input value={r.qty} placeholder="How much"
                   onChange={(e) => setRow(i, { qty: e.target.value })} />
            <label className="stap">
              <input type="checkbox" checked={r.staple}
                     onChange={(e) => setRow(i, { staple: e.target.checked })} /> staple
            </label>
          </div>
        ))}
      </div>
      <button type="button" className="link"
              onClick={() => setRows((rs) => [...rs, { name: '', qty: '', staple: false }])}>
        + another ingredient
      </button>

      <label>Notes
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="How you make it" />
      </label>

      <button className="go">Save recipe</button>
      <button type="button" className="link" onClick={onCancel}>Cancel</button>
    </form>
  )
}
