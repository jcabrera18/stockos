'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoader } from '@/components/ui/Spinner'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { CustomerModal } from '@/components/modules/CustomerModal'
import { PaymentModal } from '@/components/modules/PaymentModal'
import { CustomerDetailModal } from '@/components/modules/CustomerDetailModal'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import type { PaginatedResponse, Pagination as PaginationType } from '@/types'
import { Plus, Users, Search, CreditCard, Eye, Pencil, Trash2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

export interface CustomerSummary {
  id: string
  business_id: string
  full_name: string
  document?: string
  phone?: string
  email?: string
  credit_limit: number
  current_balance: number
  available_credit: number | null
  credit_status: 'ok' | 'limite_proximo' | 'limite_alcanzado' | 'sin_limite'
  is_active: boolean
  notes?: string
  created_at: string
}

const creditStatusConfig = {
  ok: { label: 'OK', variant: 'success' as const },
  sin_limite: { label: 'Sin límite', variant: 'default' as const },
  limite_proximo: { label: 'Límite próximo', variant: 'warning' as const },
  limite_alcanzado: { label: 'Límite alcanzado', variant: 'danger' as const },
}

type FilterTab = 'all' | 'with_balance' | 'limite_proximo' | 'limite_alcanzado'

export default function CustomersPage() {
  const [data, setData] = useState<CustomerSummary[]>([])
  const [pagination, setPagination] = useState<PaginationType>({ total: 0, page: 1, limit: 20, pages: 0 })
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterTab>('all')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  // Modales
  const [customerModal, setCustomerModal] = useState(false)
  const [editCustomer, setEditCustomer] = useState<CustomerSummary | null>(null)
  const [paymentModal, setPaymentModal] = useState(false)
  const [paymentCustomer, setPaymentCustomer] = useState<CustomerSummary | null>(null)
  const [detailModal, setDetailModal] = useState(false)
  const [detailCustomer, setDetailCustomer] = useState<CustomerSummary | null>(null)
  const [deleteModal, setDeleteModal] = useState(false)
  const [deleteCustomer, setDeleteCustomer] = useState<CustomerSummary | null>(null)
  const [deleting, setDeleting] = useState(false)

  const searchRef = useRef(search)
  const filterRef = useRef(filter)
  const pageRef = useRef(page)
  useEffect(() => { searchRef.current = search }, [search])
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
  }, [search, filter, fetchCustomers])

  const handlePageChange = useCallback((newPage: number) => {
    pageRef.current = newPage
    setPage(newPage)
    fetchCustomers()
  }, [fetchCustomers])

  const handleDelete = async () => {
    if (!deleteCustomer) return
    setDeleting(true)
    try {
      await api.delete(`/api/customers/${deleteCustomer.id}`)
      toast.success('Cliente eliminado')
      setDeleteModal(false)
      setDeleteCustomer(null)
      fetchCustomers()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    } finally { setDeleting(false) }
  }

  // Total deuda de clientes mostrados
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
        action={
          <Button onClick={() => { setEditCustomer(null); setCustomerModal(true) }}>
            <Plus size={15} /> Nuevo cliente
          </Button>
        }
      />

      <div className="p-5 space-y-4">
        {/* Filtros + búsqueda */}
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
          <div className="relative ml-auto">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar cliente..."
              className="pl-7 pr-3 py-1.5 text-xs rounded-full bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
        </div>

        {loading ? <PageLoader /> : data.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Sin clientes"
            description="Agregá clientes para gestionar sus cuentas corrientes."
            action={<Button onClick={() => { setEditCustomer(null); setCustomerModal(true) }}><Plus size={15} /> Nuevo cliente</Button>}
          />
        ) : (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)]">Cliente</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden md:table-cell">Documento</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden md:table-cell">Teléfono</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)]">Saldo deudor</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)] hidden sm:table-cell">Límite</th>
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
                      <td className="px-4 py-3 mono text-[var(--text2)] text-xs hidden md:table-cell">
                        {customer.document ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-[var(--text2)] hidden md:table-cell">
                        {customer.phone ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`mono font-bold ${Number(customer.current_balance) > 0 ? 'text-[var(--danger)]' : 'text-[var(--text3)]'}`}>
                          {formatCurrency(customer.current_balance)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right mono text-[var(--text2)] hidden sm:table-cell">
                        {customer.credit_limit > 0 ? formatCurrency(customer.credit_limit) : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={sc.variant}>{sc.label}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* Ver movimientos */}
                          <button onClick={() => { setDetailCustomer(customer); setDetailModal(true) }}
                            title="Ver cuenta" className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface3)] transition-colors">
                            <Eye size={14} />
                          </button>
                          {/* Registrar pago */}
                          {Number(customer.current_balance) > 0 && (
                            <button onClick={() => { setPaymentCustomer(customer); setPaymentModal(true) }}
                              title="Registrar pago" className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-colors">
                              <CreditCard size={14} />
                            </button>
                          )}
                          {/* Editar */}
                          <button onClick={() => { setEditCustomer(customer); setCustomerModal(true) }}
                            title="Editar" className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface3)] transition-colors">
                            <Pencil size={14} />
                          </button>
                          {/* Eliminar */}
                          <button onClick={() => { setDeleteCustomer(customer); setDeleteModal(true) }}
                            title="Eliminar" className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--danger)] hover:bg-[var(--danger-subtle)] transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <Pagination pagination={pagination} onPageChange={handlePageChange} />
          </div>
        )}
      </div>

      <CustomerModal
        open={customerModal}
        onClose={() => { setCustomerModal(false); setEditCustomer(null) }}
        onSaved={fetchCustomers}
        customer={editCustomer}
      />

      <PaymentModal
        open={paymentModal}
        onClose={() => { setPaymentModal(false); setPaymentCustomer(null) }}
        onSaved={() => {
          fetchCustomers()
          // Si venía del detalle, reabrir con datos frescos
          if (detailCustomer) {
            api.get<CustomerSummary>(`/api/customers/${detailCustomer.id}`)
              .then(updated => {
                setDetailCustomer(updated)
                setDetailModal(true)
              }).catch(() => { })
          }
        }}
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

      <ConfirmDialog
        open={deleteModal}
        onClose={() => { setDeleteModal(false); setDeleteCustomer(null) }}
        onConfirm={handleDelete}
        title="Eliminar cliente"
        message={`¿Eliminás a "${deleteCustomer?.full_name}"? ${Number(deleteCustomer?.current_balance) > 0 ? `Tiene un saldo pendiente de ${formatCurrency(deleteCustomer?.current_balance ?? 0)}.` : ''}`}
        confirmLabel="Eliminar"
        loading={deleting}
        danger
      />
    </AppShell>
  )
}
