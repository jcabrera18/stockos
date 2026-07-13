'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronUp, X, Clock, Store, Building2, CreditCard, Warehouse, ArrowRight, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useOnboarding } from '@/hooks/useOnboarding'
import { STAGES } from '@/lib/onboarding/missions'
import { Stocky } from './Stocky'
import { RubroPicker } from './RubroPicker'
import { MissionRow } from './MissionRow'

// ─────────────────────────────────────────────────────────────
// Tarjeta protagonista del onboarding en el Dashboard.
// Se auto-oculta cuando el onboarding se completa o el usuario la descarta.
// ─────────────────────────────────────────────────────────────
export function OnboardingCard() {
  const ob = useOnboarding()
  const [expanded, setExpanded] = useState(false)
  const [panel, setPanel] = useState<null | 'rubro' | 'setup'>(null)

  // No renderizar mientras carga, si terminó o si la descartaron
  if (ob.loading || ob.meta.dismissed || ob.complete) return null

  const openPanel = (target: string) => {
    if (target === 'rubro') setPanel('rubro')
    else if (target === 'setup') setPanel('setup')
  }

  // ── Estado "recién registrado": la bienvenida ────────────────
  if (ob.fresh) {
    return (
      <>
        <WelcomePanel
          onStart={() => { ob.actions.completeWizard('reviewed_setup'); setPanel('rubro') }}
          onDismiss={ob.actions.dismiss}
        />
        <RubroPicker
          open={panel === 'rubro'}
          current={ob.meta.rubro}
          onPick={ob.actions.setRubro}
          onClose={() => setPanel(null)}
        />
      </>
    )
  }

  const stage = STAGES[ob.activeStage - 1]
  const stageMissions = ob.missions.filter((m) => m.stage === ob.activeStage)

  return (
    <>
      <div className="relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5">
        {/* halo suave con el color de la etapa */}
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full opacity-[0.10] blur-2xl"
          style={{ background: stage.accent }}
        />

        {/* header: barra de progreso + % + ocultar */}
        <div className="relative flex items-center gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-[var(--text3)]">
                Etapa {ob.activeStage} · {stage.title}
              </span>
              <span className="text-sm font-bold" style={{ color: stage.accent }}>{ob.pct}%</span>
            </div>
            <ProgressBar pct={ob.pct} color={stage.accent} />
          </div>
          <button
            onClick={ob.actions.dismiss}
            title="Ocultar guía"
            className="p-1.5 rounded-md text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors flex-shrink-0"
          >
            <X size={15} />
          </button>
        </div>

        <div className="relative flex gap-4">
          <div className="flex-1 min-w-0">
            {/* spotlight de próxima misión */}
            {ob.next && (
              <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg)] p-3.5 mb-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text3)]">
                    Próxima misión
                  </span>
                  <span className="text-xs text-[var(--text3)] flex items-center gap-1">
                    <Clock size={11} /> {ob.next.eta}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className="w-9 h-9 rounded-full grid place-items-center flex-shrink-0"
                    style={{ background: stage.accent + '22', color: stage.accent }}
                  >
                    <ob.next.icon size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[var(--text)] leading-tight">{ob.next.title}</p>
                    <p className="text-xs text-[var(--text3)] truncate">{ob.next.goal}</p>
                  </div>
                  {ob.next.href.startsWith('#') ? (
                    <button onClick={() => openPanel(ob.next!.href.slice(1))}>
                      <Button size="sm">{ob.next.cta}</Button>
                    </button>
                  ) : (
                    <Link href={ob.next.href}>
                      <Button size="sm" className="gap-1">{ob.next.cta} <ArrowRight size={14} /></Button>
                    </Link>
                  )}
                </div>
              </div>
            )}

            {/* toggle lista de misiones de la etapa */}
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-[var(--text2)] hover:text-[var(--text)] transition-colors"
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {expanded ? 'Ocultar' : 'Ver'} las {stageMissions.length} misiones de esta etapa
            </button>

            {expanded && (
              <div className="mt-2 space-y-0.5">
                {stageMissions.map((m) => (
                  <MissionRow key={m.id} m={m} onPanel={openPanel} />
                ))}
              </div>
            )}

            {/* strip de logros */}
            {ob.achievements.length > 0 && (
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--border)]">
                <Trophy size={14} className="text-[var(--warning)]" />
                <div className="flex flex-wrap gap-1.5">
                  {ob.achievements.map((a) => (
                    <span
                      key={a.id}
                      title={a.description}
                      className="text-xs px-2 py-0.5 rounded-full bg-[var(--warning-subtle)] text-[var(--warning)] font-medium"
                    >
                      {a.emoji} {a.title}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Stocky + burbuja (desktop) */}
          <div className="hidden md:flex flex-col items-center w-52 flex-shrink-0 -my-1">
            <Stocky mood={ob.pct >= 80 ? 'excited' : 'wink'} size={168} />
            <div className="mt-2 text-xs text-[var(--text2)] text-center bg-[var(--surface2)] rounded-[var(--radius-md)] px-3 py-2 leading-snug">
              {ob.next
                ? <>Tu próximo paso: <span className="font-medium text-[var(--text)]">{ob.next.title.toLowerCase()}</span> 💪</>
                : <>¡Vas increíble! Ya casi terminás.</>}
            </div>
          </div>
        </div>
      </div>

      {/* setup review + rubro picker */}
      <SetupReviewModal
        open={panel === 'setup'}
        onClose={() => setPanel(null)}
        onAck={() => { ob.actions.completeWizard('reviewed_setup'); setPanel(null) }}
      />
      <RubroPicker
        open={panel === 'rubro'}
        current={ob.meta.rubro}
        onPick={ob.actions.setRubro}
        onClose={() => setPanel(null)}
      />
    </>
  )
}

// ─────────────────────────────────────────────────────────────
function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-2 rounded-full bg-[var(--surface3)] overflow-hidden">
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  )
}

// ─── Bienvenida "recién registrado" ──────────────────────────
const AUTO_ITEMS = [
  { label: 'Comercio creado',            icon: Store,     href: '/settings' },
  { label: 'Sucursal Principal creada',  icon: Building2, href: '/branches' },
  { label: 'Caja Principal creada',      icon: CreditCard, href: '/cash-register' },
  { label: 'Depósito Principal creado',  icon: Warehouse, href: '/warehouses' },
]

function WelcomePanel({ onStart, onDismiss }: { onStart: () => void; onDismiss: () => void }) {
  return (
    <div className="relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full opacity-[0.12] blur-2xl bg-[var(--accent)]" />
      <button
        onClick={onDismiss}
        title="Ocultar guía"
        className="absolute top-3 right-3 p-1.5 rounded-md text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors"
      >
        <X size={15} />
      </button>

      <div className="relative flex gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-[var(--text)] flex items-center gap-2">
            🎉 ¡Tu negocio ya está listo para empezar!
          </h2>
          <p className="text-sm text-[var(--text2)] mt-1">
            Mientras creabas tu cuenta, dejamos todo preparado por vos.
          </p>

          <div className="grid sm:grid-cols-2 gap-1.5 mt-4">
            {AUTO_ITEMS.map((it) => (
              <div key={it.label} className="flex items-center gap-2.5 py-1.5">
                <span className="w-6 h-6 rounded-full grid place-items-center bg-[var(--accent-subtle)] text-[var(--accent)] flex-shrink-0">
                  <it.icon size={13} />
                </span>
                <span className="text-sm text-[var(--text)] flex-1 min-w-0 truncate">{it.label}</span>
                <Link
                  href={it.href}
                  className="text-xs text-[var(--accent)] hover:underline font-medium flex-shrink-0"
                >
                  Ver
                </Link>
              </div>
            ))}
          </div>

          <p className="text-xs text-[var(--text3)] mt-3">
            Podrás crear más sucursales, cajas y depósitos cuando tu negocio crezca.
          </p>

          <div className="mt-4">
            <Button onClick={onStart} className="gap-1.5">
              Empezar <ArrowRight size={15} />
            </Button>
          </div>
        </div>

        <div className="hidden md:flex flex-col items-center w-52 flex-shrink-0 -my-1">
          <Stocky mood="wave" size={150} />
          <div className="mt-2 text-xs text-[var(--text2)] text-center bg-[var(--surface2)] rounded-[var(--radius-md)] px-3 py-2 leading-snug">
            ¡Hola! Soy <span className="font-semibold text-[var(--text)]">Stocky</span> y te acompaño en cada paso 🌱
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Modal "Conocé lo que ya dejamos listo" ──────────────────
function SetupReviewModal({ open, onClose, onAck }: { open: boolean; onClose: () => void; onAck: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Lo que ya dejamos listo por vos" size="md">
      <div className="flex items-start gap-3 mb-4">
        <Stocky mood="happy" size={60} className="flex-shrink-0" />
        <p className="text-sm text-[var(--text2)] pt-1">
          Ni bien creaste tu cuenta, StockOS preparó la base de tu negocio. Estos módulos ya
          están funcionando — entrá a conocerlos, sin necesidad de configurar nada.
        </p>
      </div>
      <div className="space-y-1.5">
        {AUTO_ITEMS.map((it) => (
          <div key={it.label} className="flex items-center gap-3 p-2.5 rounded-[var(--radius-md)] bg-[var(--surface2)]">
            <span className="w-8 h-8 rounded-full grid place-items-center bg-[var(--accent-subtle)] text-[var(--accent)] flex-shrink-0">
              <it.icon size={15} />
            </span>
            <span className="text-sm font-medium text-[var(--text)] flex-1">{it.label}</span>
            <Link href={it.href}><Button size="sm" variant="secondary">Ver</Button></Link>
          </div>
        ))}
      </div>
      <div className="flex justify-end mt-5">
        <Button onClick={onAck}>Entendido, seguir</Button>
      </div>
    </Modal>
  )
}
