'use client'
import { useState, useEffect } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import { useAuthContext } from '@/contexts/AuthContext'
import { usePlansPayment } from '@/contexts/PlansPaymentContext'

const WA_LINK = 'https://wa.me/5493438558913'
const DISMISS_KEY = 'sub_dismissed_date'

function daysUntil(dateStr: string | null): number {
  if (!dateStr) return 0
  const diff = new Date(dateStr).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function wasDismissedToday(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === new Date().toDateString()
  } catch { return false }
}

function dismissToday() {
  try { localStorage.setItem(DISMISS_KEY, new Date().toDateString()) } catch { }
}

export function SubscriptionBanner() {
  const { user } = useAuthContext()
  const { openPlansModal } = usePlansPayment()
  const [visible, setVisible] = useState(false)

  const sub = user?.business?.subscription
  const status = sub?.status

  useEffect(() => {
    if (!sub) return
    // trialing/active/canceled los maneja el aviso persistente del sidebar (SidebarSubscriptionCard).
    // Importante ocultar acá: si el pago pasa el estado a 'active', hay que bajar el banner
    // (si no, quedaba "Tu sistema está pausado" tapando todo tras acreditar el pago).
    if (status === 'active' || status === 'canceled' || status === 'trialing') { setVisible(false); return }

    // past_due: siempre mostrar, no se puede dismissear
    if (status === 'past_due') { setVisible(true); return }

    // grace: mostrar una vez por día
    if (!wasDismissedToday()) setVisible(true)
  }, [sub, status])

  if (!visible || !sub) return null

  const handleClose = () => {
    dismissToday()
    setVisible(false)
  }

  // === MODAL: grace o past_due ===
  const isGrace = status === 'grace'
  const daysLeft = isGrace ? daysUntil(sub.grace_ends_at) : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 shadow-2xl text-center">
        {isGrace && (
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 text-[var(--text3)] hover:text-[var(--text)] transition-colors"
          >
            <X size={18} />
          </button>
        )}

        <div className={`inline-flex items-center justify-center w-14 h-14 rounded-full mb-5 ${isGrace ? 'bg-amber-500/15' : 'bg-red-500/15'}`}>
          <AlertTriangle size={26} className={isGrace ? 'text-amber-500 dark:text-amber-400' : 'text-red-500 dark:text-red-400'} />
        </div>

        <h2 className="text-[var(--text)] text-xl font-bold mb-2">
          {isGrace ? 'Tu período de prueba venció' : 'Tu sistema está pausado'}
        </h2>

        <p className="text-[var(--text2)] text-sm leading-relaxed mb-6">
          {isGrace
            ? <>Tenés <strong className="text-amber-500 dark:text-amber-400">{daysLeft} día{daysLeft !== 1 ? 's' : ''}</strong> para seguir usando StockOS. Contactanos para activar tu suscripción y no perder el acceso.</>
            : <>Reactivá tu cuenta y seguí vendiendo sin interrupciones.</>
          }
        </p>

        <button
          onClick={() => { setVisible(false); openPlansModal() }}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold text-sm transition-colors mb-3"
        >
          {isGrace ? 'Activar suscripción' : 'Reactivar y pagar'}
        </button>

        <a
          href={WA_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-[var(--text3)] hover:text-[var(--text2)] text-xs transition-colors mb-1"
        >
          ¿Dudas? Escribinos por WhatsApp
        </a>

        {isGrace && (
          <button
            onClick={handleClose}
            className="text-[var(--text3)] hover:text-[var(--text2)] text-sm transition-colors"
          >
            Ahora no
          </button>
        )}
      </div>
    </div>
  )
}
