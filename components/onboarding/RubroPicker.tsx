'use client'
import { Modal } from '@/components/ui/Modal'
import { RUBROS, type Rubro } from '@/lib/onboarding/rubros'
import { Stocky } from './Stocky'

// ─────────────────────────────────────────────────────────────
// Selector de rubro (misión "Contanos qué vendés").
// Adapta las misiones de la Etapa 3 y los asistentes por rubro.
// ─────────────────────────────────────────────────────────────
export function RubroPicker({
  open, current, onPick, onClose,
}: {
  open: boolean
  current: Rubro | null
  onPick: (r: Rubro) => void
  onClose: () => void
}) {
  return (
    <Modal open={open} onClose={onClose} title="¿Qué vendés en tu comercio?" size="lg">
      <div className="flex items-start gap-3 mb-4">
        <Stocky mood="happy" size={60} className="flex-shrink-0" />
        <p className="text-sm text-[var(--text2)] pt-1">
          Elegí tu rubro y adaptamos StockOS a tu forma de trabajar: te sugerimos categorías,
          herramientas y los próximos pasos que más te sirven.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {RUBROS.map((r) => {
          const active = current === r.id
          return (
            <button
              key={r.id}
              onClick={() => { onPick(r.id); onClose() }}
              className={[
                'text-left p-3 rounded-[var(--radius-md)] border transition-all active:scale-[0.98]',
                active
                  ? 'border-[var(--accent)] bg-[var(--accent-subtle)]'
                  : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)] hover:bg-[var(--surface2)]',
              ].join(' ')}
            >
              <span className="text-2xl">{r.emoji}</span>
              <p className="text-sm font-semibold text-[var(--text)] mt-1.5 leading-tight">{r.label}</p>
              <p className="text-xs text-[var(--text3)] mt-0.5 leading-snug">{r.focus}</p>
            </button>
          )
        })}
      </div>
    </Modal>
  )
}
