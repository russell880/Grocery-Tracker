/** store.tsx — the app's data, held in React and mirrored to the phone. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Alias, Data, Item, Recipe } from '../types'
import { load, newId, save } from '../lib/storage'

interface Store {
  data: Data
  addItem: (item: Omit<Item, 'id'>) => void
  addItems: (items: Omit<Item, 'id'>[]) => void
  removeItem: (id: string) => void
  saveRecipe: (recipe: Omit<Recipe, 'id'> & { id?: string }) => void
  removeRecipe: (id: string) => void
  learn: (alias: Alias) => void
  replaceAll: (data: Data) => void
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data>(() => load())
  useEffect(() => { save(data) }, [data])

  const addItems = useCallback((items: Omit<Item, 'id'>[]) => {
    setData((d) => ({ ...d, items: [...d.items, ...items.map((i) => ({ ...i, id: newId() }))] }))
  }, [])

  const value = useMemo<Store>(() => ({
    data,
    addItem: (item) => addItems([item]),
    addItems,
    removeItem: (id) => setData((d) => ({ ...d, items: d.items.filter((i) => i.id !== id) })),
    saveRecipe: (recipe) => setData((d) => {
      if (recipe.id) {
        return { ...d, recipes: d.recipes.map((r) => (r.id === recipe.id ? { ...r, ...recipe, id: r.id } : r)) }
      }
      return { ...d, recipes: [...d.recipes, { ...recipe, id: newId() } as Recipe] }
    }),
    removeRecipe: (id) => setData((d) => ({ ...d, recipes: d.recipes.filter((r) => r.id !== id) })),
    // Learn only from a correction; storing every row would fill the table
    // with rows that say what the parser already worked out.
    learn: (alias) => setData((d) => ({
      ...d,
      aliases: [...d.aliases.filter((a) => a.key !== alias.key), alias],
    })),
    replaceAll: (next) => setData(next),
  }), [data, addItems])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside StoreProvider')
  return s
}
