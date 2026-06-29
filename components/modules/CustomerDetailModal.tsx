'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Drawer } from '@/components/ui/Drawer'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Pagination } from '@/components/ui/Pagination'
import { api } from '@/lib/api'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import { printThermal, buildAccountReceiptHtml } from '@/lib/printTicket'
import { toast } from 'sonner'
import type { CustomerSummary } from '@/app/customers/page'
import type { Pagination as PaginationType } from '@/types'
import { CreditCard, TrendingUp, TrendingDown, SlidersHorizontal, MapPin, Calendar, Printer, MessageCircle } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

interface Movement {
  id: string
  type: 'sale' | 'payment' | 'adjustment'
  amount: number
  balance_after: number
  description: string
  payment_method?: string
  created_at: string
  users?: { full_name: string }
}

import type { SavedMovement } from '@/components/modules/PaymentModal'

interface CustomerDetailModalProps {
  open: boolean
  onClose: () => void
  customer: CustomerSummary | null
  onPayment: () => void
  /** Cambia tras registrar un movimiento → fuerza re-fetch de saldo + historial. */
  refreshKey?: number
  /** Movimiento recién registrado: se muestra al instante mientras llega el re-fetch. */
  seedMovement?: SavedMovement | null
}

const movementConfig = {
  sale: { label: 'Venta', icon: TrendingUp, color: 'text-[var(--danger)]' },
  payment: { label: 'Pago', icon: TrendingDown, color: 'text-[var(--accent)]' },
  adjustment: { label: 'Ajuste', icon: SlidersHorizontal, color: 'text-[var(--warning)]' },
}

// Mostramos pocos movimientos por página: clientes con mucho historial no
// disparan un request gigante y el drawer carga rápido.
const PAGE_SIZE = 10

export function CustomerDetailModal({ open, onClose, customer, onPayment, refreshKey = 0, seedMovement = null }: CustomerDetailModalProps) {
  const { user } = useAuth()
  const [movements, setMovements] = useState<Movement[]>([])
  const [pagination, setPagination] = useState<PaginationType>({ total: 0, page: 1, limit: PAGE_SIZE, pages: 0 })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  // Saldo propio: arranca del prop pero se actualiza con cada re-fetch y con el
  // movimiento optimista, así no depende de que el padre re-pase el cliente.
  const [balance, setBalance] = useState<number>(Number(customer?.current_balance ?? 0))

  const customerId = customer?.id

  // Movimiento recién registrado que el server podría no reflejar aún (la lectura
  // tras la escritura a veces llega "una atrás"). Lo mantenemos arriba hasta que
  // el listado del server lo incluya (match por balance_after, que es autoritativo
  // y lo calcula la RPC del backend).
  const [pendingSeed, setPendingSeed] = useState<SavedMovement | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryCountRef = useRef(0)

  const seedToMovement = useCallback((s: SavedMovement): Movement => ({
    id: `optimistic-${s.created_at}`,
    type: s.type,
    amount: s.amount,
    balance_after: s.balance_after,
    description: s.description,
    payment_method: s.payment_method,
    created_at: s.created_at,
    users: user?.full_name ? { full_name: user.full_name } : undefined,
  }), [user?.full_name])

  // Trae saldo + historial juntos. Mantiene el seed prependeado si el server aún
  // no lo devuelve, y reintenta una vez para reconciliar.
  const refresh = useCallback(async () => {
    if (!customerId) return
    setLoading(true)
    try {
      const [movRes, cust] = await Promise.all([
        api.get<{ data: Movement[]; pagination: PaginationType }>(`/api/customers/${customerId}/movements`, { page, limit: PAGE_SIZE }),
        api.get<{ current_balance: number }>(`/api/customers/${customerId}`).catch(() => null),
      ])
      let data = movRes.data
      if (pendingSeed) {
        const inServer = data.some(m =>
          Number(m.balance_after) === pendingSeed.balance_after && Number(m.amount) === pendingSeed.amount)
        if (inServer) {
          setPendingSeed(null)
          retryCountRef.current = 0
        } else {
          data = [seedToMovement(pendingSeed), ...data].slice(0, PAGE_SIZE)
          // El server todavía no lo refleja → reintentar unas pocas veces para
          // reconciliar (tope para no quedar polleando indefinidamente).
          if (retryCountRef.current < 4) {
            retryCountRef.current += 1
            if (retryRef.current) clearTimeout(retryRef.current)
            retryRef.current = setTimeout(() => { refresh() }, 1500)
          }
        }
      }
      setMovements(data)
      setPagination(movRes.pagination)
      if (cust) setBalance(Number(cust.current_balance))
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [customerId, page, pendingSeed, seedToMovement])

  useEffect(() => {
    if (!open || !customerId) return
    refresh()
  }, [open, customerId, page, refreshKey, refresh])

  // Al cambiar de cliente, resetear el saldo mostrado al del prop.
  useEffect(() => { setBalance(Number(customer?.current_balance ?? 0)) }, [customerId, customer?.current_balance])

  // Movimiento optimista: lo mostramos al instante (sin esperar el re-fetch).
  // Se aplica una sola vez por seed.
  const appliedSeedRef = useRef<SavedMovement | null>(null)
  useEffect(() => {
    if (!open || !seedMovement || seedMovement === appliedSeedRef.current) return
    appliedSeedRef.current = seedMovement
    retryCountRef.current = 0
    setPendingSeed(seedMovement)
    setMovements(prev => [seedToMovement(seedMovement), ...prev].slice(0, PAGE_SIZE))
    setBalance(seedMovement.balance_after)
  }, [open, seedMovement, seedToMovement])

  useEffect(() => {
    if (!open) {
      setPage(1); setMovements([]); setPendingSeed(null)
      if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null }
    }
  }, [open])

  // El saldo mostrado se deriva del movimiento más reciente (su balance_after es la
  // fuente de verdad y refleja el seed aunque el server llegue atrasado). Solo vale
  // en la página 1, donde el primer ítem es efectivamente el último movimiento; en
  // páginas siguientes usamos el saldo traído del cliente.
  const displayBalance = page === 1 && movements.length > 0 ? Number(movements[0].balance_after) : balance

  const handlePrint = () => {
    if (!customer) return
    const html = buildAccountReceiptHtml({
      customerName: customer.full_name,
      document: customer.document,
      documentType: customer.document_type,
      phone: customer.phone,
      address: customer.address,
      currentBalance: displayBalance,
      movements,
    }, {
      name: user?.business?.name,
      cuit: user?.business?.cuit,
      address: user?.business?.address,
      phone: user?.business?.phone,
    })
    printThermal('Estado de cuenta', html)
  }

  // Arma un resumen del estado de cuenta como texto estilo WhatsApp (negritas con *)
  // y lo copia al portapapeles para pegarlo en el chat del cliente. Mismo patrón que
  // "Copiar para WhatsApp" de presupuestos y pedidos.
  const copyAccountText = async () => {
    if (!customer) return
    const biz = user?.business
    const firstName = customer.full_name?.trim().split(/\s+/)[0] ?? ''

    const lines: string[] = []
    lines.push('*Estado de cuenta*')
    if (biz?.name) lines.push(biz.name)
    lines.push('')
    lines.push(firstName ? `Hola ${firstName}! Te paso el resumen de tu cuenta:` : 'Te paso el resumen de tu cuenta:')
    lines.push('')
    if (displayBalance > 0) lines.push(`*Saldo adeudado: ${formatCurrency(displayBalance)}*`)
    else if (displayBalance < 0) lines.push(`*Saldo a favor: ${formatCurrency(Math.abs(displayBalance))}*`)
    else lines.push('*Cuenta al día* ✅')

    if (movements.length > 0) {
      lines.push('')
      lines.push('Últimos movimientos:')
      for (const m of movements.slice(0, 8)) {
        const label = m.type === 'sale' ? 'Venta' : m.type === 'payment' ? 'Pago' : 'Ajuste'
        const amt = Number(m.amount)
        lines.push(`• ${formatDate(m.created_at)} — ${label} ${amt > 0 ? '+' : ''}${formatCurrency(amt)}`)
      }
    }
    lines.push('')
    lines.push(displayBalance > 0 ? 'Quedamos a disposición para coordinar el pago. ¡Gracias!' : '¡Gracias por tu confianza!')

    const text = lines.join('\n')
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copiado — pegalo en el chat del cliente')
    } catch {
      // Fallback para navegadores sin permiso de Clipboard API (o contexto no seguro).
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
        toast.success('Copiado — pegalo en el chat del cliente')
      } catch { toast.error('No se pudo copiar') }
      document.body.removeChild(ta)
    }
  }

  if (!customer) return null

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`Cuenta — ${customer.full_name}`}
      width="sm:max-w-[560px]"
      footer={
        <div className="space-y-2">
          <Button onClick={onPayment} className="w-full">
            <CreditCard size={15} />
            Registrar movimiento
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={handlePrint} className="w-full">
              <Printer size={15} />
              Imprimir recibo
            </Button>
            <Button variant="secondary" onClick={copyAccountText} className="w-full">
              <MessageCircle size={15} />
              Enviar por WhatsApp
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">

        {/* Header con saldo y datos */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2 px-4 py-3 bg-[var(--surface2)] rounded-[var(--radius-lg)] min-w-0">
            <p className="text-xs text-[var(--text3)] mb-1">Saldo deudor actual</p>
            <p className={`text-2xl sm:text-3xl font-bold mono break-words leading-tight ${displayBalance > 0 ? 'text-[var(--danger)]' : 'text-[var(--accent)]'}`}>
              {formatCurrency(displayBalance)}
            </p>
            {customer.credit_limit > 0 && (
              <div className="mt-2">
                <div className="flex justify-between text-xs text-[var(--text3)] mb-1">
                  <span>Crédito usado</span>
                  <span>{Math.round(displayBalance / customer.credit_limit * 100)}%</span>
                </div>
                <div className="h-1.5 bg-[var(--surface3)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(displayBalance / customer.credit_limit * 100, 100)}%`,
                      background: displayBalance >= customer.credit_limit
                        ? 'var(--danger)' : displayBalance >= customer.credit_limit * 0.8
                          ? 'var(--warning)' : 'var(--accent)',
                    }}
                  />
                </div>
                <p className="text-xs text-[var(--text3)] mt-1">
                  Disponible: {formatCurrency(Math.max(0, customer.credit_limit - displayBalance))} de {formatCurrency(customer.credit_limit)}
                </p>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-col">
            {customer.document && (
              <div className="px-3 py-2 bg-[var(--surface2)] rounded-[var(--radius-md)] min-w-0">
                <p className="text-xs text-[var(--text3)]">{customer.document_type ?? 'Documento'}</p>
                <p className="text-sm mono font-medium text-[var(--text)] truncate">{customer.document}</p>
              </div>
            )}
            {customer.phone && (
              <div className="px-3 py-2 bg-[var(--surface2)] rounded-[var(--radius-md)] min-w-0">
                <p className="text-xs text-[var(--text3)]">Teléfono</p>
                <p className="text-sm text-[var(--text)] truncate">{customer.phone}</p>
              </div>
            )}
          </div>
        </div>

        {/* Datos de contacto / ubicación */}
        {(customer.email || customer.address || customer.locality || customer.province || customer.birthdate) && (
          <div className="grid grid-cols-2 gap-2">
            {customer.email && (
              <div className="px-3 py-2 bg-[var(--surface2)] rounded-[var(--radius-md)] col-span-2">
                <p className="text-xs text-[var(--text3)]">Email</p>
                <p className="text-sm text-[var(--text)] truncate">{customer.email}</p>
              </div>
            )}
            {(customer.locality || customer.province) && (
              <div className="px-3 py-2 bg-[var(--surface2)] rounded-[var(--radius-md)] flex items-start gap-2">
                <MapPin size={13} className="text-[var(--text3)] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-[var(--text3)]">Ubicación</p>
                  <p className="text-sm text-[var(--text)]">
                    {[customer.locality, customer.province, customer.country].filter(Boolean).join(', ')}
                  </p>
                  {customer.postal_code && <p className="text-xs text-[var(--text3)]">CP {customer.postal_code}</p>}
                </div>
              </div>
            )}
            {customer.birthdate && (
              <div className="px-3 py-2 bg-[var(--surface2)] rounded-[var(--radius-md)] flex items-start gap-2">
                <Calendar size={13} className="text-[var(--text3)] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-[var(--text3)]">Nacimiento</p>
                  <p className="text-sm text-[var(--text)]">
                    {new Date(customer.birthdate + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Historial de movimientos */}
        <div className="pb-4">
          <p className="text-xs font-medium text-[var(--text3)] mb-2">Historial de movimientos</p>
          {loading && movements.length === 0 ? (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />
            </div>
          ) : movements.length === 0 ? (
            <p className="text-sm text-[var(--text3)] text-center py-6">Sin movimientos aún</p>
          ) : (
            <div className="bg-[var(--surface2)] rounded-[var(--radius-lg)] overflow-hidden">
              <div className="divide-y divide-[var(--border)]">
                {movements.map(mov => {
                  const cfg = movementConfig[mov.type]
                  const Icon = cfg.icon
                  return (
                    <div key={mov.id} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="w-7 h-7 rounded-full bg-[var(--surface3)] flex items-center justify-center flex-shrink-0">
                        <Icon size={13} className={cfg.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[var(--text)] truncate">{mov.description}</p>
                        <p className="text-xs text-[var(--text3)]">
                          {formatDateTime(mov.created_at)}
                          {mov.payment_method && ` · ${mov.payment_method}`}
                          {mov.users && ` · ${mov.users.full_name}`}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`text-sm font-bold mono ${Number(mov.amount) > 0 ? 'text-[var(--danger)]' : 'text-[var(--accent)]'}`}>
                          {Number(mov.amount) > 0 ? '+' : ''}{formatCurrency(mov.amount)}
                        </p>
                        <p className="text-xs mono text-[var(--text3)]">
                          Saldo: {formatCurrency(mov.balance_after)}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
              <Pagination pagination={pagination} onPageChange={setPage} />
            </div>
          )}
        </div>

      </div>
    </Drawer>
  )
}
