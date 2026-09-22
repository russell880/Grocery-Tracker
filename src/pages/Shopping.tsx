import { useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { buildHave, matchRecipe } from '../lib/match'
import { shoppingList, shoppingText } from '../lib/shopping'
import { isoDate, today } from '../lib/food'
import { Empty } from '../components/ui'

export default function Shopping() {
  const { data } = useStore()
  const [picked, setPicked] = useState<Set<string> | null>(null) // null = everything short

  const all = useMemo(() => {
    const have = buildHave(data.items)
    return data.recipes.map((recipe) => ({ recipe, match: matchRecipe(recipe, have) }))
  }, [data])

  const chosen = picked === null
    ? all.filter((r) => !r.match.makeable)
    : all.filter((r) => picked.has(r.recipe.id))

  const buy = useMemo(() => shoppingList(chosen), [chosen])
  const chosenIds = new Set(chosen.map((c) => c.recipe.id))

  const download = () => {
    const text = shoppingText(buy, chosen.map((c) => c.recipe.name), isoDate(today()))
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `shopping-${isoDate(today())}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <h1>Shopping list</h1>

      {buy.length ? (
        <>
          <ul className="buy">
            {buy.map((e) => (
              <li key={e.name}>
                <span className="box">☐</span>
                <b>{e.name}</b>
                {e.amount && <span className="amt">{e.amount}</span>}
                {e.why === 'expired' && <span className="pill gone">the one you have is expired</span>}
                <span className="sub">for {e.recipes.join(', ')}</span>
              </li>
            ))}
          </ul>
          <p className="sub">Amounts are what you're <em>short</em> — what the recipes
            ask for, less what's on the shelf and in date — added up across
            everything ticked below.</p>
          <p className="shopbtn"><button className="btn" onClick={download}>Download .txt</button></p>
        </>
      ) : (
        <Empty>
          {chosen.length
            ? 'Nothing to buy for the recipes you picked.'
            : 'Nothing to buy — everything you have typed in is makeable.'}
        </Empty>
      )}

      <h2 className="sec">Shopping for</h2>
      {!all.length && <Empty>No recipes yet.</Empty>}
      <div className="pick">
        {all.map(({ recipe, match }) => (
          <label key={recipe.id} className={match.makeable ? 'done' : ''}>
            <input
              type="checkbox"
              checked={chosenIds.has(recipe.id)}
              onChange={(e) => {
                const next = new Set(chosenIds)
                if (e.target.checked) next.add(recipe.id); else next.delete(recipe.id)
                setPicked(next)
              }}
            />
            {recipe.name}
            <span className="sub">{match.makeable ? ' — can make now' : ` — ${match.short} short`}</span>
          </label>
        ))}
      </div>
      {picked !== null && (
        <p><button className="link" onClick={() => setPicked(null)}>
          Reset to everything I can't make
        </button></p>
      )}
    </>
  )
}
