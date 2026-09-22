/** Small shared pieces. Touch-sized, because this is only ever a phone. */
import type { ReactNode } from 'react'

export function Pill({ tone = '', children }: { tone?: string; children: ReactNode }) {
  return <span className={`pill ${tone}`}>{children}</span>
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>
}

export function Fold({ summary, children, open = false }:
  { summary: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="more" open={open}>
      <summary>{summary}</summary>
      {children}
    </details>
  )
}
