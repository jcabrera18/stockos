'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Bell, BellRing, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWebOrderNotifications, useBrowserPushPermission } from '@/hooks/useWebOrderNotifications'

const PANEL_WIDTH = 320 // w-80

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'recién'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  return `hace ${d} d`
}

interface NotificationBellProps {
  // Alineación del panel respecto del botón.
  align?:     'left' | 'right'
  // Dirección en la que se abre el panel (útil en barras inferiores).
  direction?: 'down' | 'up'
  className?: string
}

interface PanelPos { top?: number; bottom?: number; left: number }

export function NotificationBell({ align = 'right', direction = 'down', className }: NotificationBellProps) {
  const router = useRouter()
  const { count, orders, isAudience } = useWebOrderNotifications()
  const { granted, supported, request } = useBrowserPushPermission()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<PanelPos | null>(null)

  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Calcula la posición fija del panel a partir del rect del botón. Se rendea en
  // un portal a <body> para aparecer por encima de cualquier componente (escapa de
  // los stacking contexts del sidebar/main y del overflow).
  const computePos = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const margin = 8
    const maxLeft = window.innerWidth - PANEL_WIDTH - margin
    const left = align === 'left'
      ? Math.min(r.left, maxLeft)
      : Math.min(Math.max(margin, r.right - PANEL_WIDTH), maxLeft)
    const next: PanelPos = { left: Math.max(margin, left) }
    if (direction === 'down') next.top = r.bottom + margin
    else next.bottom = window.innerHeight - r.top + margin
    setPos(next)
  }, [align, direction])

  useEffect(() => {
    if (!open) return
    computePos()
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onReflow = () => computePos()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onReflow)
    window.addEventListener('scroll', onReflow, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onReflow)
      window.removeEventListener('scroll', onReflow, true)
    }
  }, [open, computePos])

  if (!isAudience) return null

  const goToOrder = (id: string) => { setOpen(false); router.push(`/orders?open=${id}`) }

  const panel = open && pos && typeof document !== 'undefined' ? createPortal(
    <div
      ref={panelRef}
      style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, width: PANEL_WIDTH, zIndex: 2147483000 }}
      className="max-w-[calc(100vw-1rem)] rounded-[var(--radius-lg)] bg-[var(--surface)] border border-[var(--border)] shadow-2xl overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--text)]">Pedidos web</p>
          <p className="text-xs text-[var(--text3)]">
            {count > 0 ? `${count} sin confirmar` : 'Todo al día'}
          </p>
        </div>
        <button onClick={() => setOpen(false)} className="p-1 rounded text-[var(--text3)] hover:text-[var(--text)] cursor-pointer">
          <X size={16} />
        </button>
      </div>

      <div className="max-h-80 overflow-y-auto">
        {orders.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <Bell size={22} className="mx-auto mb-2 text-[var(--text3)]" />
            <p className="text-sm text-[var(--text2)]">No hay pedidos web pendientes</p>
            <p className="text-xs text-[var(--text3)] mt-0.5">Cuando un cliente pida desde tu catálogo, te avisamos acá.</p>
          </div>
        ) : (
          orders.map(o => (
            <button
              key={o.id}
              onClick={() => goToOrder(o.id)}
              className="w-full flex items-start gap-3 px-4 py-3 text-left border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--surface2)] transition-colors cursor-pointer"
            >
              <span className="mt-0.5 w-8 h-8 flex-shrink-0 rounded-full bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center">
                <BellRing size={15} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-[var(--text)] truncate">
                  {o.customer_name || 'Cliente sin nombre'}
                </span>
                <span className="block text-xs text-[var(--text3)]">
                  Pedido #{o.id.slice(0, 8)} · {timeAgo(o.created_at)}
                </span>
              </span>
              <span className="text-sm font-semibold text-[var(--text)] whitespace-nowrap">
                ${o.total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
              </span>
            </button>
          ))
        )}
      </div>

      {count > 0 && (
        <button
          onClick={() => { setOpen(false); router.push('/orders?status=pending') }}
          className="w-full px-4 py-2.5 text-sm font-medium text-[var(--accent)] hover:bg-[var(--surface2)] border-t border-[var(--border)] transition-colors cursor-pointer"
        >
          Ver todos los pedidos
        </button>
      )}

      {supported && !granted && (
        <button
          onClick={request}
          className="w-full px-4 py-2.5 text-xs text-[var(--text3)] hover:bg-[var(--surface2)] border-t border-[var(--border)] transition-colors cursor-pointer"
        >
          🔔 Activar avisos del navegador
        </button>
      )}
    </div>,
    document.body,
  ) : null

  return (
    <div className={cn('relative', className)}>
      <button
        ref={btnRef}
        onClick={() => setOpen(o => !o)}
        aria-label={count > 0 ? `${count} pedidos web sin confirmar` : 'Notificaciones'}
        title={count > 0 ? `${count} pedidos web sin confirmar` : 'Notificaciones'}
        className={cn(
          'relative flex items-center justify-center w-9 h-9 rounded-full text-[var(--text2)] hover:bg-[var(--surface2)] hover:text-[var(--text)] transition-colors cursor-pointer',
          count > 0 && 'text-[var(--accent)]'
        )}
      >
        {count > 0 ? <BellRing size={18} /> : <Bell size={18} />}
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-[var(--danger)] text-white text-[10px] font-bold shadow ring-2 ring-[var(--surface)]">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      {panel}
    </div>
  )
}
