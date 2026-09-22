/** The whole data model. All of it lives in the phone's own storage. */

export type Category = 'produce' | 'dairy' | 'meat' | 'pantry' | 'frozen' | 'drinks' | 'other'
export type Location = 'fridge' | 'freezer' | 'pantry'

export interface Item {
  id: string
  name: string
  norm: string // matching key, see names.ts
  category: Category
  qty: string
  expiresOn: string | null // YYYY-MM-DD, null = never/unknown
  addedOn: string
}

export interface Ingredient {
  name: string
  norm: string
  qty: string
  staple: boolean // something you assume you have; never blocks a recipe
}

export interface Recipe {
  id: string
  name: string
  minutes: number | null
  notes: string
  ingredients: Ingredient[]
  addedOn: string
}

/** What a receipt line turned out to be, once a person said so. */
export interface Alias {
  key: string // the barcode when there is one, else the normalised line
  name: string
  category: Category
  learnedOn: string
}

export interface Data {
  items: Item[]
  recipes: Recipe[]
  aliases: Alias[]
}

export const EMPTY: Data = { items: [], recipes: [], aliases: [] }

export const CATEGORIES: Category[] = [
  'produce', 'dairy', 'meat', 'pantry', 'frozen', 'drinks', 'other',
]
