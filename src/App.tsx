import { useEffect, useState } from 'react'
import Shelf from './pages/Shelf'
import Recipes from './pages/Recipes'
import Cook from './pages/Cook'
import Shopping from './pages/Shopping'
import Receipt from './pages/Receipt'

/**
 * Hash routing, so the phone's back gesture works and a pinned home-screen
 * app reopens where you left it. Five tabs for five pages.
 */
const TABS = [
  { id: 'shelf', art: '🧺', label: 'Shelf', title: 'Pantry' },
  { id: 'recipes', art: '📖', label: 'Recipes', title: 'Recipes' },
  { id: 'cook', art: '🍳', label: 'Cook', title: 'Cook' },
  { id: 'shopping', art: '🛒', label: 'Shop', title: 'Shopping' },
  { id: 'receipt', art: '📷', label: 'Receipt', title: 'Receipt' },
] as const

type TabId = (typeof TABS)[number]['id']

const readHash = (): TabId => {
  const h = window.location.hash.replace('#/', '').replace('#', '')
  return (TABS.find((t) => t.id === h)?.id ?? 'shelf') as TabId
}

export default function App() {
  const [tab, setTab] = useState<TabId>(readHash)

  useEffect(() => {
    const onHash = () => setTab(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const current = TABS.find((t) => t.id === tab)!

  return (
    <>
      <header>
        <span className="brand">{current.title}</span>
      </header>

      <main>
        {tab === 'shelf' && <Shelf />}
        {tab === 'recipes' && <Recipes />}
        {tab === 'cook' && <Cook />}
        {tab === 'shopping' && <Shopping />}
        {tab === 'receipt' && <Receipt />}
      </main>

      <nav className="tabs">
        {TABS.map((t) => (
          <a key={t.id} href={`#/${t.id}`} className={t.id === tab ? 'on' : ''}>
            <span className="art">{t.art}</span>
            <span className="lbl">{t.label}</span>
          </a>
        ))}
      </nav>
    </>
  )
}
