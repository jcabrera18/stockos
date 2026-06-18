'use client'
import { Crown, MessageCircle } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { upgradeWhatsappLink } from '@/lib/plans'

/**
 * Banner que avisa que el negocio llegó al límite de su plan y enlaza a WhatsApp
 * con un mensaje predefinido (nombre + ID del negocio) para pedir el upgrade.
 */
export function PlanLimitBanner({
  title,
  subtitle = 'Actualizá tu plan para sumar más.',
}: {
  title: string
  subtitle?: string
}) {
  const { user } = useAuth()
  const link = upgradeWhatsappLink(user?.business?.name, user?.business_id)

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-[var(--radius-md)] border border-[var(--accent)]/25 bg-[var(--accent)]/8 px-4 py-3">
      <div className="flex items-start gap-2.5 flex-1">
        <Crown size={16} className="text-[var(--accent)] shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-[var(--text)]">{title}</p>
          <p className="text-xs text-[var(--text3)] mt-0.5">{subtitle}</p>
        </div>
      </div>
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 shrink-0 px-4 py-2 rounded-[var(--radius-md)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold transition-colors"
      >
        <MessageCircle size={14} />
        Actualizá tu plan
      </a>
    </div>
  )
}
