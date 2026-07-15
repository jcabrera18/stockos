'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { HelpBanner } from '@/components/ui/HelpBanner'
import { Button } from '@/components/ui/Button'
import { MoneyInput } from '@/components/ui/MoneyInput'
import { Badge } from '@/components/ui/Badge'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyState } from '@/components/ui/EmptyState'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { api } from '@/lib/api'
import { formatCurrency, formatDateTime, getPaymentMethodLabel, getPeriodDates } from '@/lib/utils'
import type { Sale, PaginatedResponse, Pagination as PaginationType } from '@/types'
import { Plus, ShoppingCart } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { SaleDetailModal } from '@/components/modules/SaleDetailModal'
import { useAuth } from '@/hooks/useAuth'
import { isRestrictedRole } from '@/lib/roles'

type Period = 'today' | 'week' | 'month' | 'all'

export default function SalesPage() {
  const { user } = useAuth()
  const restricted = isRestrictedRole(user?.role)
  const [data, setData] = useState<Sale[]>([])
  const [pagination, setPagination] = useState<PaginationType>({ total: 0, page: 1, limit: 20, pages: 0 })
  const [period, setPeriod] = useState<Period>('today')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [detailSaleId, setDetailSaleId] = useState<string | null>(null)
  const [detailModal, setDetailModal] = useState(false)
  const [paymentFilter, setPaymentFilter] = useState('')
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')
  const [debouncedMin, setDebouncedMin] = useState('')
  const [debouncedMax, setDebouncedMax] = useState('')
  const [ticketSearch, setTicketSearch] = useState('')
  const [debouncedTicket, setDebouncedTicket] = useState('')
  const [customerFilter, setCustomerFilter] = useState<{ id: string; full_name: string } | null>(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerOptions, setCustomerOptions] = useState<{ id: string; full_name: string }[]>([])
  const [searchingCustomers, setSearchingCustomers] = useState(false)
  const [periodRevenue, setPeriodRevenue] = useState(0)

  // Refs para evitar loops en useCallback
  const periodRef = useRef(period)
  const paymentRef = useRef(paymentFilter)
  const minAmountRef = useRef(minAmount)
  const maxAmountRef = useRef(maxAmount)
  const ticketRef = useRef(debouncedTicket)
  const customerRef = useRef(customerFilter)
  const pageRef = useRef(page)
  const restrictedRef = useRef(restricted)

  useEffect(() => { restrictedRef.current = restricted }, [restricted])
  useEffect(() => { periodRef.current = period }, [period])
  useEffect(() => { paymentRef.current = paymentFilter }, [paymentFilter])
  useEffect(() => {
    const t = setTimeout(() => setDebouncedMin(minAmount), minAmount ? 500 : 0)
    return () => clearTimeout(t)
  }, [minAmount])
  useEffect(() => {
    const t = setTimeout(() => setDebouncedMax(maxAmount), maxAmount ? 500 : 0)
    return () => clearTimeout(t)
  }, [maxAmount])
  useEffect(() => { minAmountRef.current = debouncedMin }, [debouncedMin])
  useEffect(() => { maxAmountRef.current = debouncedMax }, [debouncedMax])
  useEffect(() => {
    const t = setTimeout(() => setDebouncedTicket(ticketSearch), ticketSearch ? 400 : 0)
    return () => clearTimeout(t)
  }, [ticketSearch])
  useEffect(() => { ticketRef.current = debouncedTicket }, [debouncedTicket])
  useEffect(() => { customerRef.current = customerFilter }, [customerFilter])

  const fetchSales = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number | undefined> = {
        page: pageRef.current,
        limit: 20,
      }
      if (periodRef.current !== 'all') {
        const { from, to } = getPeriodDates(periodRef.current)
        params.from = from
        params.to = to
      }
      if (paymentRef.current) params.payment_method = paymentRef.current
      if (minAmountRef.current) params.min_amount = Number(minAmountRef.current)
      if (maxAmountRef.current) params.max_amount = Number(maxAmountRef.current)
      if (ticketRef.current) params.ticket = ticketRef.current
      if (customerRef.current) params.customer_id = customerRef.current.id

      // Total del período: reutiliza /api/finances/summary (suma server-side de
      // todas las ventas del rango, no solo la página). Solo soporta from/to,
      // así que el método de pago se deriva del breakdown by_payment.
      const summaryParams: Record<string, string> = {}
      if (params.from) summaryParams.from = String(params.from)
      if (params.to) summaryParams.to = String(params.to)

      // /api/finances/summary suma ventas de TODO el negocio y es admin-only.
      // Para roles restringidos lo omitimos (no deben ver el total del negocio):
      // solo se muestra el conteo de sus ventas de hoy.
      const [res, summary] = await Promise.all([
        api.get<PaginatedResponse<Sale>>('/api/sales', params),
        restrictedRef.current
          ? Promise.resolve(null)
          : api.get<{ revenue: number; by_payment: Record<string, number> }>(
              '/api/finances/summary', summaryParams
            ),
      ])
      setData(res.data)
      setPagination(res.pagination)
      if (summary) {
        const pm = paymentRef.current
        setPeriodRevenue(pm ? (summary.by_payment[pm] ?? 0) : summary.revenue)
      }
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [])

  // Al cambiar filtros: resetear página y fetchear una sola vez
  useEffect(() => {
    pageRef.current = 1
    setPage(1)
    fetchSales()
  }, [period, paymentFilter, debouncedMin, debouncedMax, debouncedTicket, customerFilter, restricted, fetchSales])

  // Cambio de página desde el componente Pagination
  const handlePageChange = useCallback((newPage: number) => {
    pageRef.current = newPage
    setPage(newPage)
    fetchSales()
  }, [fetchSales])

  // Búsqueda de clientes con debounce
  useEffect(() => {
    if (!customerSearch.trim() || customerSearch.length < 2) { setCustomerOptions([]); return }
    const timer = setTimeout(async () => {
      setSearchingCustomers(true)
      try {
        const data = await api.get<{ id: string; full_name: string }[]>(
          `/api/customers/search?q=${encodeURIComponent(customerSearch)}`
        )
        setCustomerOptions(data)
      } catch { setCustomerOptions([]) }
      finally { setSearchingCustomers(false) }
    }, 300)
    return () => clearTimeout(timer)
  }, [customerSearch])

  const totalRevenue = periodRevenue

  const periods: { key: Period; label: string }[] = [
    { key: 'today', label: 'Hoy' },
    { key: 'week', label: 'Semana' },
    { key: 'month', label: 'Mes' },
    { key: 'all', label: 'Todas' },
  ]

  const router = useRouter()

  return (
    <AppShell>
      <PageHeader
        title="Ventas"
        description={loading ? '...' : restricted ? `${pagination.total} ventas hoy` : `${pagination.total} ventas · ${formatCurrency(totalRevenue)}`}
        action={
          <Button onClick={() => router.push('/pos')}>
            <Plus size={15} /> Nueva venta
          </Button>
        }
      />

      <div className="p-5 space-y-4">
        <HelpBanner id="sales" title="Historial de ventas">
          <p>Consultá todas las ventas con filtros por fecha, sucursal, caja y forma de pago. Tocá una venta para ver el detalle de los productos y, si corresponde, generar su comprobante.</p>
        </HelpBanner>
        {/* Filtros */}
        <div className="flex flex-wrap gap-2 items-center">

          {/* Período — los roles restringidos quedan fijados a "hoy" (el backend lo fuerza) */}
          {!restricted && periods.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors ${period === p.key ? 'bg-[var(--accent)] text-white' : 'bg-[var(--surface2)] text-[var(--text2)] hover:bg-[var(--surface3)]'
                }`}>
              {p.label}
            </button>
          ))}

          {/* Separador */}
          {!restricted && <div className="w-px h-5 bg-[var(--border)]" />}

          {/* Método de pago */}
          <select
            value={paymentFilter}
            onChange={e => setPaymentFilter(e.target.value)}
            className="text-xs px-3 py-1.5 rounded-full bg-[var(--surface2)] border border-[var(--border)] text-[var(--text2)] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
          >
            <option value="">Todos los métodos</option>
            <option value="efectivo">Efectivo</option>
            <option value="debito">Débito</option>
            <option value="credito">Crédito</option>
            <option value="transferencia">Transferencia</option>
            <option value="qr">QR</option>
            <option value="cuenta_corriente">Cta. Cte.</option>
          </select>

          {/* N° Ticket */}
          <input
            value={ticketSearch}
            onChange={e => setTicketSearch(e.target.value.toUpperCase().replace(/[^A-F0-9]/g, '').slice(0, 8))}
            placeholder="N° Ticket..."
            className="text-xs px-3 py-1.5 rounded-full bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)] w-28 font-mono uppercase"
          />

          {/* Filtro por cliente */}
          {customerFilter ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--accent-subtle)] border border-[var(--accent)] text-xs">
              <span className="text-[var(--accent)] font-medium">{customerFilter.full_name}</span>
              <button onClick={() => { setCustomerFilter(null); setCustomerSearch('') }}
                className="text-[var(--accent)] hover:text-[var(--danger)]">✕</button>
            </div>
          ) : (
            <div className="relative">
              <input
                value={customerSearch}
                onChange={e => setCustomerSearch(e.target.value)}
                placeholder="Filtrar por cliente..."
                className="text-xs px-3 py-1.5 rounded-full bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)] w-40"
              />
              {searchingCustomers && (
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 border border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />
              )}
              {customerOptions.length > 0 && (
                <div className="absolute top-full left-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-lg z-10 min-w-48 overflow-hidden">
                  {customerOptions.map(c => (
                    <button key={c.id}
                      onClick={() => { setCustomerFilter(c); setCustomerSearch(''); setCustomerOptions([]) }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--surface2)] transition-colors border-b border-[var(--border)] last:border-0">
                      {c.full_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Monto mínimo */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-[var(--text3)]">Desde $</span>
            <MoneyInput
              unstyled
              placeholder="0"
              value={minAmount}
              onChange={v => setMinAmount(v)}
              className="w-24 text-xs px-2 py-1.5 rounded-full bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          {/* Monto máximo */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-[var(--text3)]">Hasta $</span>
            <MoneyInput
              unstyled
              placeholder="∞"
              value={maxAmount}
              onChange={v => setMaxAmount(v)}
              className="w-24 text-xs px-2 py-1.5 rounded-full bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          {/* Limpiar filtros */}
          {(paymentFilter || minAmount || maxAmount || ticketSearch) && (
            <button
              onClick={() => { setPaymentFilter(''); setMinAmount(''); setMaxAmount(''); setTicketSearch(''); setCustomerFilter(null); setCustomerSearch('') }} className="text-xs text-[var(--danger)] hover:underline"
            >
              Limpiar
            </button>
          )}

          {/* Total filtrado */}
          {!loading && (
            <span className="sm:ml-auto w-full sm:w-auto text-xs text-[var(--text3)]">
              {restricted ? `${pagination.total} ventas hoy` : `${pagination.total} ventas · ${formatCurrency(totalRevenue)}`}
            </span>
          )}
        </div>

        {loading ? <TableSkeleton rows={10} /> : data.length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title="Sin ventas"
            description="Registrá tu primera venta con el botón Nueva venta."
          />
        ) : (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)]">Fecha</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden sm:table-cell">N° Ticket</th>
                    {!restricted && <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden md:table-cell">Vendedor</th>}
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden lg:table-cell">Sucursal / Caja</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-[var(--text3)]">Método</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)] hidden sm:table-cell">Descuento</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)]">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {data.map(sale => (
                    <tr
                      key={sale.id}
                      onClick={() => { setDetailSaleId(sale.id); setDetailModal(true) }}
                      className="hover:bg-[var(--surface2)] transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3 text-[var(--text2)] text-xs mono">
                        {formatDateTime(sale.created_at)}
                      </td>
                      <td className="px-4 py-3 text-xs mono text-[var(--text3)] hidden sm:table-cell">
                        #{sale.id.slice(-8).toUpperCase()}
                      </td>
                      {!restricted && (
                        <td className="px-4 py-3 text-[var(--text2)] hidden md:table-cell">
                          {(sale.users as { full_name: string } | undefined)?.full_name ?? '—'}
                        </td>
                      )}
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <p className="text-sm text-[var(--text)]">
                          {(sale.branches as { name: string } | undefined)?.name ?? '—'}
                        </p>
                        <p className="text-xs text-[var(--text3)]">
                          {(sale.registers as { name: string } | undefined)?.name ?? ''}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant="default">{getPaymentMethodLabel(sale.payment_method)}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right mono text-[var(--text3)] hidden sm:table-cell">
                        {sale.discount > 0 ? `- ${formatCurrency(sale.discount)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right mono font-semibold text-[var(--text)]">
                        {formatCurrency(sale.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination pagination={pagination} onPageChange={handlePageChange} />
          </div>
        )}

        <SaleDetailModal
          open={detailModal}
          onClose={() => { setDetailModal(false); setDetailSaleId(null) }}
          saleId={detailSaleId}
        />

      </div>
    </AppShell>
  )
}
