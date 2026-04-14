'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyState } from '@/components/ui/EmptyState'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { PaymentModal } from '@/components/modules/PaymentModal'
import { CustomerDetailModal } from '@/components/modules/CustomerDetailModal'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import type { PaginatedResponse, Pagination as PaginationType } from '@/types'
import { Wallet, Search, CreditCard, Eye, AlertTriangle } from 'lucide-react'
import type { CustomerSummary } from '@/app/customers/page'

const creditStatusConfig = {
  ok: { label: 'OK', variant: 'success' as const },
  sin_limite: { label: 'Sin límite', variant: 'default' as const },
  limite_proximo: { label: 'Límite próximo', variant: 'warning' as const },
  limite_alcanzado: { label: 'Límite alcanzado', variant: 'danger' as const },
}

type FilterTab = 'all' | 'with_balance' | 'limite_proximo' | 'limite_alcanzado'

export default function AccountsPage() {
  const [data, setData] = useState<CustomerSummary[]>([])
  const [pagination, setPagination] = useState<PaginationType>({ total: 0, page: 1, limit: 20, pages: 0 })
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filter, setFilter] = useState<FilterTab>('all')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const [paymentModal, setPaymentModal] = useState(false)
  const [paymentCustomer, setPaymentCustomer] = useState<CustomerSummary | null>(null)
  const [detailModal, setDetailModal] = useState(false)
  const [detailCustomer, setDetailCustomer] = useState<CustomerSummary | null>(null)

  const searchRef = useRef(debouncedSearch)
  const filterRef = useRef(filter)
  const pageRef = useRef(page)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), search ? 300 : 0)
    return () => clearTimeout(t)
  }, [search])
  useEffect(() => { searchRef.current = debouncedSearch }, [debouncedSearch])
  useEffect(() => { filterRef.current = filter }, [filter])

  const fetchCustomers = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number | boolean | undefined> = {
        search: searchRef.current || undefined,
        page: pageRef.current,
        limit: 20,
      }
      if (filterRef.current === 'with_balance') params.with_balance = true
      if (filterRef.current === 'limite_proximo') params.credit_status = 'limite_proximo'
      if (filterRef.current === 'limite_alcanzado') params.credit_status = 'limite_alcanzado'

      const res = await api.get<PaginatedResponse<CustomerSummary>>('/api/customers', params)
      setData(res.data)
      setPagination(res.pagination)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    pageRef.current = 1
    setPage(1)
    fetchCustomers()
  }, [debouncedSearch, filter, fetchCustomers])

  const handlePageChange = useCallback((newPage: number) => {
    pageRef.current = newPage
    setPage(newPage)
    fetchCustomers()
  }, [fetchCustomers])

  const totalDebt = data.reduce((a, c) => a + Number(c.current_balance), 0)

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'with_balance', label: 'Con saldo' },
    { key: 'limite_proximo', label: 'Límite próximo' },
    { key: 'limite_alcanzado', label: 'Límite alcanzado' },
  ]

  return (
    <AppShell>
      <PageHeader
        title="Cuentas corrientes"
        description={`${pagination.total} clientes · Deuda total: ${formatCurrency(totalDebt)}`}
      />

      <div className="p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setFilter(t.key)}
              className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors ${filter === t.key
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--surface2)] text-[var(--text2)] hover:bg-[var(--surface3)]'
                }`}>
              {t.label}
            </button>
          ))}
          <div className="relative ml-auto min-w-[130px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar cliente..."
              className="w-full pl-7 pr-3 py-1.5 text-xs rounded-full bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
        </div>

        {loading ? <TableSkeleton rows={10} /> : data.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="Sin cuentas corrientes"
            description="Los clientes con cuenta corriente aparecerán aquí."
          />
        ) : (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)]">Cliente</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)]">Saldo deudor</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)] hidden sm:table-cell">Límite</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)] hidden md:table-cell">Disponible</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-[var(--text3)]">Estado</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {data.map(customer => {
                    const sc = creditStatusConfig[customer.credit_status]
                    return (
                      <tr
                        key={customer.id}
                        onClick={() => { setDetailCustomer(customer); setDetailModal(true) }}
                        className="hover:bg-[var(--surface2)] transition-colors cursor-pointer group"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {customer.credit_status === 'limite_alcanzado' && (
                              <AlertTriangle size={13} className="text-[var(--danger)] flex-shrink-0" />
                            )}
                            <div>
                              <p className="font-medium text-[var(--text)]">{customer.full_name}</p>
                              {customer.email && <p className="text-xs text-[var(--text3)]">{customer.email}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`mono font-bold ${Number(customer.current_balance) > 0 ? 'text-[var(--danger)]' : 'text-[var(--text3)]'}`}>
                            {formatCurrency(customer.current_balance)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right mono text-[var(--text2)] hidden sm:table-cell">
                          {customer.credit_limit > 0 ? formatCurrency(customer.credit_limit) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right mono text-[var(--text2)] hidden md:table-cell">
                          {customer.available_credit !== null ? formatCurrency(customer.available_credit) : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={sc.variant}>{sc.label}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => { setDetailCustomer(customer); setDetailModal(true) }}
                              title="Ver cuenta"
                              className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface3)] transition-colors"
                            >
                              <Eye size={14} />
                            </button>
                            {Number(customer.current_balance) > 0 && (
                              <button
                                onClick={e => { e.stopPropagation(); setPaymentCustomer(customer); setPaymentModal(true) }}
                                title="Registrar pago"
                                className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-colors"
                              >
                                <CreditCard size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pagination pagination={pagination} onPageChange={handlePageChange} />
          </div>
        )}
      </div>

      <PaymentModal
        open={paymentModal}
        onClose={() => {
          setPaymentModal(false)
          setPaymentCustomer(null)
          if (detailCustomer) {
            api.get<CustomerSummary>(`/api/customers/${detailCustomer.id}`)
              .then(updated => {
                setDetailCustomer(updated)
                setDetailModal(true)
              }).catch(() => { })
          }
        }}
        onSaved={fetchCustomers}
        customer={paymentCustomer}
      />

      <CustomerDetailModal
        open={detailModal}
        onClose={() => { setDetailModal(false); setDetailCustomer(null) }}
        customer={detailCustomer}
        onPayment={() => {
          setDetailModal(false)
          setPaymentCustomer(detailCustomer)
          setPaymentModal(true)
        }}
      />
    </AppShell>
  )
}
