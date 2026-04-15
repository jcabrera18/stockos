'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyState } from '@/components/ui/EmptyState'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { CustomerModal } from '@/components/modules/CustomerModal'
import { api } from '@/lib/api'
import type { PaginatedResponse, Pagination as PaginationType } from '@/types'
import { Plus, Users, Search, Pencil, Trash2, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { toast } from 'sonner'

type StatusFilter = 'all' | 'active' | 'inactive'
type SortField = 'full_name' | 'customer_code' | 'is_active'
type SortDir = 'asc' | 'desc'

export interface CustomerSummary {
  id: string
  business_id: string
  customer_code?: string
  full_name: string
  document_type?: string
  document?: string
  phone?: string
  email?: string
  address?: string
  locality?: string
  province?: string
  postal_code?: string
  country?: string
  birthdate?: string
  credit_limit: number
  current_balance: number
  available_credit: number | null
  credit_status: 'ok' | 'limite_proximo' | 'limite_alcanzado' | 'sin_limite'
  is_active: boolean
  notes?: string
  created_at: string
}

export default function CustomersPage() {
  const [data, setData] = useState<CustomerSummary[]>([])
  const [pagination, setPagination] = useState<PaginationType>({ total: 0, page: 1, limit: 20, pages: 0 })
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sort, setSort] = useState<{ field: SortField; dir: SortDir }>({ field: 'full_name', dir: 'asc' })

  const [customerModal, setCustomerModal] = useState(false)
  const [editCustomer, setEditCustomer] = useState<CustomerSummary | null>(null)
  const [deleteModal, setDeleteModal] = useState(false)
  const [deleteCustomer, setDeleteCustomer] = useState<CustomerSummary | null>(null)
  const [deleting, setDeleting] = useState(false)

  const searchRef = useRef(debouncedSearch)
  const pageRef = useRef(page)
  const statusRef = useRef(statusFilter)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), search ? 300 : 0)
    return () => clearTimeout(t)
  }, [search])
  useEffect(() => { searchRef.current = debouncedSearch }, [debouncedSearch])
  useEffect(() => { statusRef.current = statusFilter }, [statusFilter])

  const fetchCustomers = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number | undefined> = {
        search: searchRef.current || undefined,
        page: pageRef.current,
        limit: 20,
        is_active: statusRef.current === 'all' ? undefined : statusRef.current === 'active' ? 1 : 0,
      }
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
  }, [debouncedSearch, statusFilter, fetchCustomers])

  const handlePageChange = useCallback((newPage: number) => {
    pageRef.current = newPage
    setPage(newPage)
    fetchCustomers()
  }, [fetchCustomers])

  const handleDeactivate = async () => {
    if (!deleteCustomer) return
    setDeleting(true)
    try {
      await api.delete(`/api/customers/${deleteCustomer.id}`)
      toast.success('Cliente desactivado')
      setDeleteModal(false)
      setDeleteCustomer(null)
      fetchCustomers()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al desactivar')
    } finally { setDeleting(false) }
  }

  const toggleSort = (field: SortField) => {
    setSort(s => s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' })
  }

  const sortedData = [...data].sort((a, b) => {
    const dir = sort.dir === 'asc' ? 1 : -1
    if (sort.field === 'full_name') return a.full_name.localeCompare(b.full_name) * dir
    if (sort.field === 'customer_code') return (a.customer_code ?? '').localeCompare(b.customer_code ?? '') * dir
    if (sort.field === 'is_active') return (Number(b.is_active) - Number(a.is_active)) * dir
    return 0
  })

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sort.field !== field) return <ChevronsUpDown size={11} className="ml-1 opacity-40" />
    return sort.dir === 'asc' ? <ChevronUp size={11} className="ml-1" /> : <ChevronDown size={11} className="ml-1" />
  }

  return (
    <AppShell>
      <PageHeader
        title="Clientes"
        description={`${pagination.total} clientes registrados`}
        action={
          <Button onClick={() => { setEditCustomer(null); setCustomerModal(true) }}>
            <Plus size={15} /> Nuevo cliente
          </Button>
        }
      />

      <div className="p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-full bg-[var(--surface2)] border border-[var(--border)] p-0.5">
            {(['all', 'active', 'inactive'] as StatusFilter[]).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${statusFilter === s ? 'bg-[var(--accent)] text-white' : 'text-[var(--text2)] hover:text-[var(--text)]'}`}
              >
                {s === 'all' ? 'Todos' : s === 'active' ? 'Activos' : 'Inactivos'}
              </button>
            ))}
          </div>
          <div className="relative ml-auto min-w-[130px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nombre, SKU..."
              className="w-full pl-7 pr-3 py-1.5 text-xs rounded-full bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
        </div>

        {loading ? <TableSkeleton rows={10} /> : data.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Sin clientes"
            description="Agregá clientes para gestionar sus datos y cuentas corrientes."
            action={<Button onClick={() => { setEditCustomer(null); setCustomerModal(true) }}><Plus size={15} /> Nuevo cliente</Button>}
          />
        ) : (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)]">
                      <button onClick={() => toggleSort('full_name')} className="flex items-center hover:text-[var(--text)] transition-colors">
                        Cliente <SortIcon field="full_name" />
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden sm:table-cell">
                      <button onClick={() => toggleSort('customer_code')} className="flex items-center hover:text-[var(--text)] transition-colors">
                        SKU <SortIcon field="customer_code" />
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden md:table-cell">Documento</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden md:table-cell">Teléfono</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden lg:table-cell">Email</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-[var(--text3)]">
                      <button onClick={() => toggleSort('is_active')} className="flex items-center mx-auto hover:text-[var(--text)] transition-colors">
                        Estado <SortIcon field="is_active" />
                      </button>
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {sortedData.map(customer => (
                    <tr
                      key={customer.id}
                      onClick={() => { setEditCustomer(customer); setCustomerModal(true) }}
                      className="hover:bg-[var(--surface2)] transition-colors group cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-[var(--text)]">{customer.full_name}</p>
                        {customer.notes && <p className="text-xs text-[var(--text3)] truncate max-w-[180px]">{customer.notes}</p>}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell mono text-xs text-[var(--text2)]">
                        {customer.customer_code ?? '—'}
                      </td>
                      <td className="px-4 py-3 mono text-[var(--text2)] text-xs hidden md:table-cell">
                        {customer.document ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-[var(--text2)] hidden md:table-cell">
                        {customer.phone ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-[var(--text2)] hidden lg:table-cell">
                        {customer.email ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={customer.is_active ? 'success' : 'default'}>
                          {customer.is_active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={e => { e.stopPropagation(); setEditCustomer(customer); setCustomerModal(true) }}
                            title="Editar"
                            className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface3)] transition-colors"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); setDeleteCustomer(customer); setDeleteModal(true) }}
                            title="Eliminar"
                            className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--danger)] hover:bg-[var(--danger-subtle)] transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

      <ConfirmDialog
        open={deleteModal}
        onClose={() => { setDeleteModal(false); setDeleteCustomer(null) }}
        onConfirm={handleDeactivate}
        title="Desactivar cliente"
        message={`¿Desactivás a "${deleteCustomer?.full_name}"? El cliente quedará inactivo pero no se eliminará.`}
        confirmLabel="Desactivar"
        loading={deleting}
        danger
      />
    </AppShell>
  )
}
