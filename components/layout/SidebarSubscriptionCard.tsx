'use client'
import { useAuth } from '@/hooks/useAuth'
import { Clock, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

const WA_LINK = 'https://wa.me/5493438558913'

function daysUntil(dateStr: string | null): number {
  if (!dateStr) return 0
  const diff = new Date(dateStr).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function daysLabel(days: number): string {
  if (days <= 0) return 'hoy'
  return `${days} día${days !== 1 ? 's' : ''}`
}

type Tone = 'info' | 'warn' | 'danger'

const TONE: Record<Tone, { box: string; text: string; dot: string }> = {
  info:   { box: 'bg-[var(--accent-subtle)] border-[var(--accent)]/20', text: 'text-[var(--accent)]', dot: 'bg-[var(--accent)]' },
  warn:   { box: 'bg-amber-500/10 border-amber-500/25',                 text: 'text-amber-500',        dot: 'bg-amber-500' },
  danger: { box: 'bg-red-500/10 border-red-500/25',                     text: 'text-red-500',          dot: 'bg-red-500 animate-pulse' },
}

/**
 * Aviso persistente de suscripción en el sidebar con cuenta regresiva.
 * - trialing: muestra siempre cuántos días quedan de prueba (color escala con la urgencia).
 * - active: solo avisa cuando la renovación está cerca (≤ 7 días).
 * - grace: prueba vencida, días restantes antes del corte.
 * past_due / canceled se manejan con el modal bloqueante (SubscriptionBanner).
 */
export function SidebarSubscriptionCard({ collapsed = false, variant = 'sidebar' }: { collapsed?: boolean; variant?: 'sidebar' | 'mobile' }) {
  const { user } = useAuth()
  const sub = user?.business?.subscription
  if (!sub) return null

  let days: number
  let tone: Tone
  let title: string

  if (sub.status === 'trialing') {
    days = daysUntil(sub.trial_ends_at)
    tone = days <= 1 ? 'danger' : days <= 3 ? 'warn' : 'info'
    title = `Prueba: vence en ${daysLabel(days)}`
  } else if (sub.status === 'grace') {
    days = daysUntil(sub.grace_ends_at)
    tone = 'danger'
    title = `Prueba vencida · ${daysLabel(days)} restantes`
  } else if (sub.status === 'active') {
    days = daysUntil(sub.current_period_end)
    if (days > 7) return null // suscripción al día: no molestamos
    tone = days <= 2 ? 'danger' : 'warn'
    title = `Renueva en ${daysLabel(days)}`
  } else {
    // past_due / canceled → modal bloqueante, no va en el sidebar
    return null
  }

  const t = TONE[tone]
  const Icon = tone === 'info' ? Clock : AlertTriangle

  // Variante mobile: franja superior persistente (no descartable).
  if (variant === 'mobile') {
    return (
      <a
        href={WA_LINK}
        target="_blank"
        rel="noopener noreferrer"
        className={cn('flex items-center justify-center gap-2 px-4 py-2 border-b text-xs font-semibold', t.box, t.text)}
      >
        <Icon size={14} className="flex-shrink-0" />
        <span>{title}</span>
        <span className="underline opacity-80">Renovar</span>
      </a>
    )
  }

  if (collapsed) {
    return (
      <a
        href={WA_LINK}
        target="_blank"
        rel="noopener noreferrer"
        title={title}
        className={cn('relative flex items-center justify-center w-full py-2.5 rounded-[var(--radius-md)] border transition-colors', t.box, t.text)}
      >
        <Icon size={16} />
        <span className={cn('absolute top-1 right-1 w-2 h-2 rounded-full', t.dot)} />
      </a>
    )
  }

  return (
    <a
      href={WA_LINK}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('block px-3 py-2.5 rounded-[var(--radius-md)] border transition-colors hover:opacity-90', t.box)}
    >
      <div className={cn('flex items-center gap-2 text-xs font-semibold', t.text)}>
        <Icon size={14} className="flex-shrink-0" />
        <span className="leading-tight">{title}</span>
      </div>
      <p className="mt-1 text-[11px] text-[var(--text3)] leading-snug">
        Tocá para renovar por WhatsApp
      </p>
    </a>
  )
}
