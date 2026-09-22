/**
 * storage.ts — the whole database, in the phone's own storage.
 *
 * No server, no account, nothing leaves the device. Every read and write is
 * wrapped: localStorage throws in a private window and can come back empty
 * after a clear, and neither should crash a kitchen.
 */
import { EMPTY, type Data } from '../types'

const KEY = 'grocery-tracker/v1'

export function load(): Data {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<Data>
    return {
      items: parsed.items ?? [],
      recipes: parsed.recipes ?? [],
      aliases: parsed.aliases ?? [],
    }
  } catch {
    return EMPTY
  }
}

export function save(data: Data): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch (e) {
    // Quota, or a private window. Losing one save is survivable; crashing is not.
    console.warn('Could not save', e)
  }
}

export function clear(): void {
  try { localStorage.removeItem(KEY) } catch { /* nothing to do */ }
}

/** Everything, as a file you can keep. The only backup there is. */
export function exportJson(data: Data): string {
  return JSON.stringify(data, null, 2)
}

export function importJson(text: string): Data | null {
  try {
    const p = JSON.parse(text) as Partial<Data>
    if (!Array.isArray(p.items) || !Array.isArray(p.recipes)) return null
    return { items: p.items, recipes: p.recipes, aliases: p.aliases ?? [] }
  } catch {
    return null
  }
}

export const newId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
