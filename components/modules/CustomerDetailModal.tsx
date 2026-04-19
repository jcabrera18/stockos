'use client'
import { useEffect, useState, useRef } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Pagination } from '@/components/ui/Pagination'
import { api } from '@/lib/api'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import type { CustomerSummary } from '@/app/customers/page'
import type { Pagination as PaginationType } from '@/types'
import { CreditCard, TrendingUp, TrendingDown, SlidersHorizontal, MapPin, Calendar, Printer } from 'lucide-react'
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

interface CustomerDetailModalProps {
  open: boolean
  onClose: () => void
  customer: CustomerSummary | null
  onPayment: () => void
}

const movementConfig = {
  sale: { label: 'Venta', icon: TrendingUp, color: 'text-[var(--danger)]' },
  payment: { label: 'Pago', icon: TrendingDown, color: 'text-[var(--accent)]' },
  adjustment: { label: 'Ajuste', icon: SlidersHorizontal, color: 'text-[var(--warning)]' },
}

export function CustomerDetailModal({ open, onClose, customer, onPayment }: CustomerDetailModalProps) {
  const { user } = useAuth()
  const printRef = useRef<HTMLDivElement>(null)
  const [movements, setMovements] = useState<Movement[]>([])
  const [pagination, setPagination] = useState<PaginationType>({ total: 0, page: 1, limit: 30, pages: 0 })
  const [page, setPage] = useState(1)
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

  const handlePrint = () => {
    const content = printRef.current
    if (!content) return

    const win = window.open('', '_blank', 'width=350,height=800')
    if (!win) return

    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Recibo</title>
  <style>
    @page { size: 80mm auto; margin: 2mm 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 80mm; background: #fff; }
    body { font-family: 'Courier New', Courier, monospace; font-size: 11px; color: #000; }
  </style>
</head>
<body>${content.innerHTML}</body>
</html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 400)
  }

  const sep: React.CSSProperties = { borderTop: '1px dashed #999', margin: '8px 0' }
  const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }

  if (!customer) return null

  return (
    <Modal open={open} onClose={onClose} title={`Cuenta — ${customer.full_name}`} size="lg">
      <div className="space-y-4 pb-4">

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
                <p className="text-xs text-[var(--text3)]">{customer.document_type ?? 'Documento'}</p>
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

        {/* Botones */}
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={onPayment} className="w-full">
            <CreditCard size={15} />
            Registrar pago
          </Button>
          <Button variant="secondary" onClick={handlePrint} className="w-full">
            <Printer size={15} />
            Imprimir recibo
          </Button>
        </div>

        {/* Recibo térmico oculto (solo para impresión) */}
        <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '302px' }}>
          <div
            ref={printRef}
            style={{
              fontFamily: "'Courier New', Courier, monospace",
              fontSize: '11px',
              color: '#000',
              background: '#fff',
              width: '302px',
              padding: '12px 10px',
            }}
          >
            {/* Encabezado negocio */}
            <div style={{ textAlign: 'center', marginBottom: '2px' }}>
              <div style={{ fontSize: '15px', fontWeight: 'bold', letterSpacing: '0.04em' }}>
                {user?.business?.name ?? ''}
              </div>
              {user?.business?.cuit && (
                <div style={{ marginTop: '2px' }}>CUIT: {user.business.cuit}</div>
              )}
              {user?.business?.address && (
                <div style={{ fontSize: '10px', marginTop: '1px' }}>{user.business.address}</div>
              )}
              {user?.business?.phone && (
                <div style={{ fontSize: '10px' }}>Tel: {user.business.phone}</div>
              )}
            </div>

            <div style={sep} />

            {/* Tipo de documento */}
            <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '13px', letterSpacing: '0.04em' }}>
              ESTADO DE CUENTA CORRIENTE
            </div>
            <div style={{ textAlign: 'center', fontSize: '10px', marginTop: '2px' }}>
              Fecha: {new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })} {new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
            </div>

            <div style={sep} />

            {/* Datos del cliente */}
            <div style={{ lineHeight: '1.6' }}>
              <div style={{ fontWeight: 'bold' }}>{customer.full_name}</div>
              {customer.document && (
                <div>{customer.document_type ?? 'Doc'}: {customer.document}</div>
              )}
              {customer.phone && <div>Tel: {customer.phone}</div>}
              {customer.address && <div style={{ fontSize: '10px' }}>{customer.address}</div>}
            </div>

            <div style={sep} />

            {/* Saldo */}
            <div style={{ ...row, fontWeight: 'bold', fontSize: '14px' }}>
              <span>SALDO DEUDOR</span>
              <span>{formatCurrency(customer.current_balance)}</span>
            </div>
            {customer.credit_limit > 0 && (
              <div style={{ fontSize: '10px', marginTop: '4px', lineHeight: '1.5' }}>
                <div style={row}>
                  <span>Límite de crédito</span>
                  <span>{formatCurrency(customer.credit_limit)}</span>
                </div>
                <div style={row}>
                  <span>Disponible</span>
                  <span>{formatCurrency(Math.max(0, customer.credit_limit - Number(customer.current_balance)))}</span>
                </div>
              </div>
            )}

            <div style={sep} />

            {/* Movimientos */}
            <div style={{ fontWeight: 'bold', fontSize: '10px', marginBottom: '4px' }}>
              ÚLTIMOS MOVIMIENTOS
            </div>
            {movements.slice(0, 10).map((mov) => (
              <div key={mov.id} style={{ marginBottom: '5px', fontSize: '10px' }}>
                <div style={row}>
                  <span style={{ flex: 1, paddingRight: '6px', wordBreak: 'break-word' }}>
                    {mov.type === 'sale' ? 'Venta' : mov.type === 'payment' ? 'Pago' : 'Ajuste'} — {mov.description}
                  </span>
                  <span style={{ flexShrink: 0, fontWeight: 'bold' }}>
                    {Number(mov.amount) > 0 ? '+' : ''}{formatCurrency(mov.amount)}
                  </span>
                </div>
                <div style={{ color: '#555' }}>
                  {formatDateTime(mov.created_at)} · Saldo: {formatCurrency(mov.balance_after)}
                </div>
              </div>
            ))}
            {movements.length > 10 && (
              <div style={{ textAlign: 'center', fontSize: '10px', color: '#888', marginTop: '2px' }}>
                ... {movements.length - 10} movimientos anteriores no mostrados
              </div>
            )}

            <div style={sep} />

            {/* Footer */}
            <div style={{ textAlign: 'center', fontSize: '10px', lineHeight: '1.6' }}>
              <div>¡Gracias por su confianza!</div>
              <div style={{ color: '#888' }}>Powered by StockOS</div>
            </div>
          </div>
        </div>

        {/* Historial de movimientos */}
        <div className="pb-4">
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
