'use client'
import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Pagination } from '@/components/ui/Pagination'
import { api } from '@/lib/api'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import type { CustomerSummary } from '@/app/customers/page'
import type { Pagination as PaginationType } from '@/types'
import { CreditCard, TrendingUp, TrendingDown, SlidersHorizontal } from 'lucide-react'

interface Movement {
  id:             string
  type:           'sale' | 'payment' | 'adjustment'
  amount:         number
  balance_after:  number
  description:    string
  payment_method?: string
  created_at:     string
  users?:         { full_name: string }
}

interface CustomerDetailModalProps {
  open:      boolean
  onClose:   () => void
  customer:  CustomerSummary | null
  onPayment: () => void
}

const movementConfig = {
  sale:       { label: 'Venta',   icon: TrendingUp,   color: 'text-[var(--danger)]' },
  payment:    { label: 'Pago',    icon: TrendingDown, color: 'text-[var(--accent)]' },
  adjustment: { label: 'Ajuste', icon: SlidersHorizontal, color: 'text-[var(--warning)]' },
}

export function CustomerDetailModal({ open, onClose, customer, onPayment }: CustomerDetailModalProps) {
  const [movements, setMovements] = useState<Movement[]>([])
  const [pagination, setPagination] = useState<PaginationType>({ total: 0, page: 1, limit: 30, pages: 0 })
  const [page, setPage]   = useState(1)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !customer) return
    setLoading(true)
    api.get<{ data: Movement[]; pagination: PaginationType }>(
      `/api/customers/${customer.id}/movements`, { page, limit: 30 }
    ).then(res => {
      setMovements(res.data)
      setPagination(res.pagination)
    }).catch(console.error)
      .finally(() => setLoading(false))
  }, [open, customer, page])

  useEffect(() => { if (!open) { setPage(1); setMovements([]) } }, [open])

  if (!customer) return null

  return (
    <Modal open={open} onClose={onClose} title={`Cuenta — ${customer.full_name}`} size="lg">
      <div className="space-y-4">

        {/* Header con saldo y datos */}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 px-4 py-3 bg-[var(--surface2)] rounded-[var(--radius-lg)]">
            <p className="text-xs text-[var(--text3)] mb-1">Saldo deudor actual</p>
            <p className={`text-3xl font-bold mono ${Number(customer.current_balance) > 0 ? 'text-[var(--danger)]' : 'text-[var(--accent)]'}`}>
              {formatCurrency(customer.current_balance)}
            </p>
            {customer.credit_limit > 0 && (
              <div className="mt-2">
                <div className="flex justify-between text-xs text-[var(--text3)] mb-1">
                  <span>Crédito usado</span>
                  <span>{Math.round(Number(customer.current_balance) / customer.credit_limit * 100)}%</span>
                </div>
                <div className="h-1.5 bg-[var(--surface3)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(Number(customer.current_balance) / customer.credit_limit * 100, 100)}%`,
                      background: Number(customer.current_balance) >= customer.credit_limit
                        ? 'var(--danger)' : Number(customer.current_balance) >= customer.credit_limit * 0.8
                        ? 'var(--warning)' : 'var(--accent)',
                    }}
                  />
                </div>
                <p className="text-xs text-[var(--text3)] mt-1">
                  Disponible: {formatCurrency(Math.max(0, customer.credit_limit - Number(customer.current_balance)))} de {formatCurrency(customer.credit_limit)}
                </p>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {customer.document && (
              <div className="px-3 py-2 bg-[var(--surface2)] rounded-[var(--radius-md)]">
                <p className="text-xs text-[var(--text3)]">Documento</p>
                <p className="text-sm mono font-medium text-[var(--text)]">{customer.document}</p>
              </div>
            )}
            {customer.phone && (
              <div className="px-3 py-2 bg-[var(--surface2)] rounded-[var(--radius-md)]">
                <p className="text-xs text-[var(--text3)]">Teléfono</p>
                <p className="text-sm text-[var(--text)]">{customer.phone}</p>
              </div>
            )}
          </div>
        </div>

        {/* Botón pagar */}
        {Number(customer.current_balance) > 0 && (
          <Button onClick={onPayment} className="w-full">
            <CreditCard size={15} />
            Registrar pago de {formatCurrency(customer.current_balance)}
          </Button>
        )}

        {/* Historial de movimientos */}
        <div>
          <p className="text-xs font-medium text-[var(--text3)] mb-2">Historial de movimientos</p>
          {loading ? (
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
    </Modal>
  )
}
