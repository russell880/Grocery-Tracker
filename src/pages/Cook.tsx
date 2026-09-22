import { useMemo } from 'react'
import { useStore } from '../state/store'
import { buildHave, matchRecipe } from '../lib/match'
import { iconFor } from '../lib/food'
import { Empty } from '../components/ui'

/**
 * Sorted by how close you are, then by what it would use up: a recipe that
 * clears something expiring in two days is worth cooking before one that
 * doesn't, so it sorts first among the makeable ones.
 */
export default function Cook() {
  const { data } = useStore()

  const { ready, almost, nope } = useMemo(() => {
    const have = buildHave(data.items)
    const all = data.recipes.map((recipe) => {
      const match = matchRecipe(recipe, have)
      const usesSoon = [...new Set(
        match.lines.filter((l) => l.item?.state === 'soon').map((l) => l.item!.name),
      )].sort()
      return { recipe, match, usesSoon }
    })
    return {
      ready: all.filter((r) => r.match.makeable)
        .sort((a, b) => b.usesSoon.length - a.usesSoon.length
          || a.recipe.name.localeCompare(b.recipe.name)),
      almost: all.filter((r) => !r.match.makeable && r.match.short <= 2)
        .sort((a, b) => a.match.short - b.match.short
          || a.recipe.name.localeCompare(b.recipe.name)),
      nope: all.filter((r) => !r.match.makeable && r.match.short > 2)
        .sort((a, b) => a.match.short - b.match.short),
    }
  }, [data])

  if (!data.recipes.length) {
    return (
      <>
        <h1>What can I make right now</h1>
        <Empty>No recipes yet — <a href="#/recipes">type in the first one</a>. The meals
          you cook most often are the ones worth adding.</Empty>
      </>
    )
  }

  return (
    <>
      <h1>What can I make right now</h1>

      <h2 className="sec ok">Ready to cook ({ready.length})</h2>
      {ready.length ? (
        <div className="grid">
          {ready.map(({ recipe, usesSoon }) => (
            <div className="card can" key={recipe.id}>
              <div className="art">{iconFor(recipe.name)}</div>
              <div className="what">
                <b>{recipe.name}</b>
                <span className="sub">{recipe.minutes ? `${recipe.minutes} min` : ' '}</span>
                {usesSoon.length > 0 && (
                  <span className="pill soon">uses up {usesSoon.join(', ')}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : <Empty>Nothing you can make with everything on hand.</Empty>}

      {almost.length > 0 && (
        <>
          <h2 className="sec soon">One or two things short ({almost.length})</h2>
          <div className="grid">
            {almost.map(({ recipe, match }) => (
              <div className="card soon" key={recipe.id}>
                <div className="art">{iconFor(recipe.name)}</div>
                <div className="what">
                  <b>{recipe.name}</b>
                  <span className="sub">need: {match.lines.filter((l) => !l.have).map((l) =>
                    l.name + (l.why === 'expired' ? ' (expired)'
                      : l.why === 'short' ? ` (${l.gap} more)` : '')).join(', ')}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {nope.length > 0 && (
        <>
          <h2 className="sec">Not this week ({nope.length})</h2>
          <ul className="thin">
            {nope.map(({ recipe, match }) => (
              <li key={recipe.id}>{recipe.name} <span className="sub">{match.short} short</span></li>
            ))}
          </ul>
        </>
      )}

      <p className="shopbtn"><a className="btn" href="#/shopping">🛒 Shopping list</a></p>
    </>
  )
}
