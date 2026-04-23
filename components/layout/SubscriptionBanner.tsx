'use client'
import { useState, useEffect } from 'react'
import { X, AlertTriangle, Clock } from 'lucide-react'
import { useAuthContext } from '@/contexts/AuthContext'

const WA_LINK = 'https://wa.me/5493438445203'
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
  const [visible, setVisible] = useState(false)

  const sub = user?.business?.subscription
  const status = sub?.status

  useEffect(() => {
    if (!sub) return
    if (status === 'active' || status === 'canceled') return

    if (status === 'trialing') {
      const days = daysUntil(sub.trial_ends_at)
      if (days <= 3) setVisible(true)
      return
    }

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

  // === BANNER: trial por vencer (≤ 3 días) ===
  if (status === 'trialing') {
    const days = daysUntil(sub.trial_ends_at)
    return (
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-3 px-4 py-2.5 bg-amber-500/90 backdrop-blur-sm text-white text-sm">
        <div className="flex items-center gap-2">
          <Clock size={15} className="shrink-0" />
          <span>
            Tu período de prueba vence en <strong>{days === 0 ? 'hoy' : `${days} día${days !== 1 ? 's' : ''}`}</strong>.{' '}
            <a href={WA_LINK} target="_blank" rel="noopener noreferrer" className="underline font-semibold">
              Contactanos para continuar
            </a>
          </span>
        </div>
        <button onClick={handleClose} className="shrink-0 opacity-80 hover:opacity-100">
          <X size={15} />
        </button>
      </div>
    )
  }

  // === MODAL: grace o past_due ===
  const isGrace = status === 'grace'
  const daysLeft = isGrace ? daysUntil(sub.grace_ends_at) : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#1a1a18] p-8 shadow-2xl text-center">
        {isGrace && (
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 text-white/40 hover:text-white/70 transition-colors"
          >
            <X size={18} />
          </button>
        )}

        <div className={`inline-flex items-center justify-center w-14 h-14 rounded-full mb-5 ${isGrace ? 'bg-amber-500/15' : 'bg-red-500/15'}`}>
          <AlertTriangle size={26} className={isGrace ? 'text-amber-400' : 'text-red-400'} />
        </div>

        <h2 className="text-white text-xl font-bold mb-2">
          {isGrace ? 'Tu período de prueba venció' : 'Tu sistema está pausado'}
        </h2>

        <p className="text-white/55 text-sm leading-relaxed mb-6">
          {isGrace
            ? <>Tenés <strong className="text-amber-400">{daysLeft} día{daysLeft !== 1 ? 's' : ''}</strong> para seguir usando StockOS. Contactanos para activar tu suscripción y no perder el acceso.</>
            : <>Reactivá tu cuenta y seguí vendiendo sin interrupciones.</>
          }
        </p>

        <a
          href={WA_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#16a34a] hover:bg-[#15803d] text-white font-semibold text-sm transition-colors mb-3"
        >
          Contactar por WhatsApp
        </a>

        {isGrace && (
          <button
            onClick={handleClose}
            className="text-white/35 hover:text-white/55 text-sm transition-colors"
          >
            Ahora no
          </button>
        )}
      </div>
    </div>
  )
}
