'use client'
import Link from 'next/link'
import { Check, Clock, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import type { MissionState } from '@/lib/onboarding/types'

// ─────────────────────────────────────────────────────────────
// Fila de una misión dentro de la lista de la etapa.
// hrefs "#..." disparan un panel inline (rubro/setup) vía onPanel.
// El asistente "hacelo por vos" (onWizard) se implementa en F3.
// ─────────────────────────────────────────────────────────────
export function MissionRow({
  m, onPanel, onWizard,
}: {
  m: MissionState
  onPanel?: (target: string) => void
  onWizard?: (m: MissionState) => void
}) {
  const isPanel = m.href.startsWith('#')

  const ActionButton = (
    <Button size="sm" variant={m.isNext ? 'primary' : 'secondary'}>{m.cta}</Button>
  )

  return (
    <div
      className={cn(
        'flex items-center gap-3 py-2 px-2.5 rounded-[var(--radius-md)] transition-colors',
        m.done ? 'opacity-60' : m.isNext ? 'bg-[var(--surface2)]' : 'hover:bg-[var(--surface2)]',
      )}
    >
      <span
        className={cn(
          'w-7 h-7 rounded-full grid place-items-center flex-shrink-0',
          m.done ? 'bg-[var(--accent-subtle)] text-[var(--accent)]' : 'bg-[var(--surface3)] text-[var(--text3)]',
        )}
      >
        {m.done ? <Check size={15} /> : <m.icon size={15} />}
      </span>

      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-medium leading-tight', m.done ? 'line-through text-[var(--text3)]' : 'text-[var(--text)]')}>
          {m.title}
        </p>
        {!m.done && <p className="text-xs text-[var(--text3)] truncate mt-0.5">{m.goal}</p>}
        {!m.done && m.wizard && onWizard && (
          <button
            onClick={() => onWizard(m)}
            className="text-xs text-[var(--accent)] hover:underline inline-flex items-center gap-1 mt-1"
          >
            <Sparkles size={11} /> ¿Lo hacemos por vos?
          </button>
        )}
      </div>

      {!m.done && (
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-[var(--text3)] hidden sm:flex items-center gap-1">
            <Clock size={12} /> {m.eta}
          </span>
          {isPanel
            ? <button onClick={() => onPanel?.(m.href.slice(1))}>{ActionButton}</button>
            : <Link href={m.href}>{ActionButton}</Link>}
        </div>
      )}
    </div>
  )
}
