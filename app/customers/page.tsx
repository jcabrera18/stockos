'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyState } from '@/components/ui/EmptyState'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { CustomerModal } from '@/components/modules/CustomerModal'
import { PageLoader } from '@/components/ui/Spinner'
import { api } from '@/lib/api'
import type { PaginatedResponse, Pagination as PaginationType } from '@/types'
import { Plus, Users, Search, Pencil, Trash2, ChevronUp, ChevronDown, ChevronsUpDown, MapPin, Tag, Printer } from 'lucide-react'
import { toast } from 'sonner'

type TabId = 'customers' | 'zones' | 'categories'
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
  delivery_zone_id?: string | null
  delivery_zone_name?: string | null
  delivery_zone_color?: string | null
  client_category_id?: string | null
  client_category_name?: string | null
}

export interface DeliveryZone {
  id: string
  name: string
  description?: string | null
  color?: string | null
  active: boolean
  sort_order: number
}

export interface ClientCategory {
  id: string
  name: string
  description?: string | null
  active: boolean
  sort_order: number
}

// ─── Zonas de entrega ABM ─────────────────────────────────────────────────────

const emptyZone = { name: '', description: '', color: '', sort_order: '', active: true }

function DeliveryZonesTab() {
  const [zones, setZones] = useState<DeliveryZone[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  const [modal, setModal] = useState(false)
  const [editZone, setEditZone] = useState<DeliveryZone | null>(null)
  const [form, setForm] = useState(emptyZone)
  const [saving, setSaving] = useState(false)

  const [deleteModal, setDeleteModal] = useState(false)
  const [deleteZone, setDeleteZone] = useState<DeliveryZone | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchZones = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number | boolean> = {}
      if (search) params.search = search
      if (showInactive) params.inactive = true
      const data = await api.get<DeliveryZone[]>('/api/delivery-zones', params)
      setZones(data)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [search, showInactive])

  useEffect(() => { fetchZones() }, [fetchZones])

  const openCreate = () => {
    setEditZone(null)
    setForm(emptyZone)
    setModal(true)
  }

  const openEdit = (zone: DeliveryZone) => {
    setEditZone(zone)
    setForm({
      name: zone.name,
      description: zone.description ?? '',
      color: zone.color ?? '',
      sort_order: String(zone.sort_order),
      active: zone.active,
    })
    setModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('El nombre es obligatorio'); return }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        color: form.color.trim() || null,
        sort_order: Number(form.sort_order) || 0,
        active: form.active,
      }
      if (editZone) {
        await api.patch(`/api/delivery-zones/${editZone.id}`, payload)
        toast.success('Zona actualizada')
      } else {
        await api.post('/api/delivery-zones', payload)
        toast.success('Zona creada')
      }
      setModal(false)
      fetchZones()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleteZone) return
    setDeleting(true)
    try {
      await api.delete(`/api/delivery-zones/${deleteZone.id}`)
      toast.success('Zona eliminada')
      setDeleteModal(false)
      setDeleteZone(null)
      fetchZones()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    } finally { setDeleting(false) }
  }

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--text2)]">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
            className="w-3.5 h-3.5 accent-[var(--accent)] cursor-pointer"
          />
          Mostrar inactivos
        </label>
        <div className="relative ml-auto min-w-[130px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar zona..."
            className="w-full pl-7 pr-3 py-1.5 text-xs rounded-full bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>
        <Button onClick={openCreate} size="sm"><Plus size={13} /> Nueva zona</Button>
      </div>

      {loading ? <PageLoader /> : zones.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="Sin zonas de entrega"
          description="Creá zonas para segmentar a tus clientes por área geográfica."
          action={<Button onClick={openCreate}><Plus size={15} /> Nueva zona</Button>}
        />
      ) : (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)]">Zona</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden md:table-cell">Descripción</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-[var(--text3)]">Orden</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-[var(--text3)]">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {zones.map(zone => (
                <tr key={zone.id} className="hover:bg-[var(--surface2)] transition-colors group">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0 border border-black/10"
                        style={{ backgroundColor: zone.color ?? 'var(--text3)' }}
                      />
                      <span className="font-medium text-[var(--text)]">{zone.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--text2)] text-xs hidden md:table-cell">
                    {zone.description ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-[var(--text2)]">{zone.sort_order}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={zone.active ? 'success' : 'default'}>
                      {zone.active ? 'Activa' : 'Inactiva'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => openEdit(zone)}
                        className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface3)] transition-colors"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => { setDeleteZone(zone); setDeleteModal(true) }}
                        className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--danger)] hover:bg-[var(--danger-subtle)] transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editZone ? 'Editar zona' : 'Nueva zona de entrega'} size="sm">
        <div className="space-y-4">
          <Input
            label="Nombre *"
            value={form.name}
            onChange={set('name')}
            placeholder="Ej: Zona Norte, Centro, Ruta 12"
            autoFocus
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[var(--text2)]">Descripción</label>
            <textarea
              value={form.description}
              onChange={set('description')}
              rows={2}
              placeholder="Opcional..."
              className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)] resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-[var(--text2)]">Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.color || '#6366f1'}
                  onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                  className="w-9 h-9 rounded-[var(--radius-md)] cursor-pointer border border-[var(--border)] p-0.5 bg-transparent flex-shrink-0"
                />
                <input
                  value={form.color}
                  onChange={set('color')}
                  placeholder="#6366f1"
                  className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>
            <Input
              label="Orden"
              type="number"
              min="0"
              value={form.sort_order}
              onChange={set('sort_order')}
              placeholder="0"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.active}
              onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
              className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
            />
            <span className="text-sm text-[var(--text)]">Activa</span>
          </label>
          <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 mt-4 border-t border-[var(--border)]">
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setModal(false)} disabled={saving}>Cancelar</Button>
              <Button onClick={handleSave} loading={saving}>{editZone ? 'Guardar cambios' : 'Crear zona'}</Button>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteModal}
        onClose={() => { setDeleteModal(false); setDeleteZone(null) }}
        onConfirm={handleDelete}
        title="Eliminar zona"
        message={`¿Eliminás "${deleteZone?.name}"?`}
        confirmLabel="Eliminar"
        loading={deleting}
        danger
      />
    </div>
  )
}

// ─── Categorías de clientes ABM ───────────────────────────────────────────────

const emptyCategory = { name: '', description: '', sort_order: '', active: true }

function ClientCategoriesTab() {
  const [categories, setCategories] = useState<ClientCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  const [modal, setModal] = useState(false)
  const [editCategory, setEditCategory] = useState<ClientCategory | null>(null)
  const [form, setForm] = useState(emptyCategory)
  const [saving, setSaving] = useState(false)

  const [deleteModal, setDeleteModal] = useState(false)
  const [deleteCategory, setDeleteCategory] = useState<ClientCategory | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchCategories = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number | boolean> = {}
      if (search) params.search = search
      if (showInactive) params.inactive = true
      const data = await api.get<ClientCategory[]>('/api/client-categories', params)
      setCategories(data)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [search, showInactive])

  useEffect(() => { fetchCategories() }, [fetchCategories])

  const openCreate = () => {
    setEditCategory(null)
    setForm(emptyCategory)
    setModal(true)
  }

  const openEdit = (cat: ClientCategory) => {
    setEditCategory(cat)
    setForm({
      name: cat.name,
      description: cat.description ?? '',
      sort_order: String(cat.sort_order),
      active: cat.active,
    })
    setModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('El nombre es obligatorio'); return }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        sort_order: Number(form.sort_order) || 0,
        active: form.active,
      }
      if (editCategory) {
        await api.patch(`/api/client-categories/${editCategory.id}`, payload)
        toast.success('Categoría actualizada')
      } else {
        await api.post('/api/client-categories', payload)
        toast.success('Categoría creada')
      }
      setModal(false)
      fetchCategories()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleteCategory) return
    setDeleting(true)
    try {
      await api.delete(`/api/client-categories/${deleteCategory.id}`)
      toast.success('Categoría eliminada')
      setDeleteModal(false)
      setDeleteCategory(null)
      fetchCategories()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    } finally { setDeleting(false) }
  }

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--text2)]">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
            className="w-3.5 h-3.5 accent-[var(--accent)] cursor-pointer"
          />
          Mostrar inactivos
        </label>
        <div className="relative ml-auto min-w-[130px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar categoría..."
            className="w-full pl-7 pr-3 py-1.5 text-xs rounded-full bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>
        <Button onClick={openCreate} size="sm"><Plus size={13} /> Nueva categoría</Button>
      </div>

      {loading ? <PageLoader /> : categories.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="Sin categorías"
          description="Creá categorías para clasificar a tus clientes por tipo de negocio."
          action={<Button onClick={openCreate}><Plus size={15} /> Nueva categoría</Button>}
        />
      ) : (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)]">Categoría</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden md:table-cell">Descripción</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-[var(--text3)]">Orden</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-[var(--text3)]">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {categories.map(cat => (
                <tr key={cat.id} className="hover:bg-[var(--surface2)] transition-colors group">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-md bg-[var(--surface2)] flex items-center justify-center flex-shrink-0 group-hover:bg-[var(--accent-subtle)]">
                        <Tag size={13} className="text-[var(--text3)] group-hover:text-[var(--accent)]" />
                      </div>
                      <span className="font-medium text-[var(--text)]">{cat.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--text2)] text-xs hidden md:table-cell">
                    {cat.description ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-[var(--text2)]">{cat.sort_order}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={cat.active ? 'success' : 'default'}>
                      {cat.active ? 'Activa' : 'Inactiva'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => openEdit(cat)}
                        className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface3)] transition-colors"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => { setDeleteCategory(cat); setDeleteModal(true) }}
                        className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--danger)] hover:bg-[var(--danger-subtle)] transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editCategory ? 'Editar categoría' : 'Nueva categoría'} size="sm">
        <div className="space-y-4">
          <Input
            label="Nombre *"
            value={form.name}
            onChange={set('name')}
            placeholder="Ej: Verdulería, Carnicería, Kiosco"
            autoFocus
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[var(--text2)]">Descripción</label>
            <textarea
              value={form.description}
              onChange={set('description')}
              rows={2}
              placeholder="Opcional..."
              className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)] resize-none"
            />
          </div>
          <Input
            label="Orden"
            type="number"
            min="0"
            value={form.sort_order}
            onChange={set('sort_order')}
            placeholder="0"
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.active}
              onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
              className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
            />
            <span className="text-sm text-[var(--text)]">Activa</span>
          </label>
          <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 mt-4 border-t border-[var(--border)]">
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setModal(false)} disabled={saving}>Cancelar</Button>
              <Button onClick={handleSave} loading={saving}>{editCategory ? 'Guardar cambios' : 'Crear categoría'}</Button>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteModal}
        onClose={() => { setDeleteModal(false); setDeleteCategory(null) }}
        onConfirm={handleDelete}
        title="Eliminar categoría"
        message={`¿Eliminás "${deleteCategory?.name}"?`}
        confirmLabel="Eliminar"
        loading={deleting}
        danger
      />
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string }[] = [
  { id: 'customers',  label: 'Clientes' },
  { id: 'zones',      label: 'Zonas de entrega' },
  { id: 'categories', label: 'Categorías' },
]

export default function CustomersPage() {
  const [activeTab, setActiveTab] = useState<TabId>('customers')

  // ── Clientes state ──
  const [data, setData] = useState<CustomerSummary[]>([])
  const [pagination, setPagination] = useState<PaginationType>({ total: 0, page: 1, limit: 20, pages: 0 })
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [zoneFilter, setZoneFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [sort, setSort] = useState<{ field: SortField; dir: SortDir }>({ field: 'full_name', dir: 'asc' })

  const [filterZones, setFilterZones] = useState<DeliveryZone[]>([])
  const [filterCategories, setFilterCategories] = useState<ClientCategory[]>([])

  const [customerModal, setCustomerModal] = useState(false)
  const [editCustomer, setEditCustomer] = useState<CustomerSummary | null>(null)
  const [deleteModal, setDeleteModal] = useState(false)
  const [deleteCustomer, setDeleteCustomer] = useState<CustomerSummary | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [printModal, setPrintModal] = useState(false)
  const [printFields, setPrintFields] = useState<string[]>(['full_name', 'document', 'phone', 'email', 'address', 'locality', 'delivery_zone_name', 'client_category_name'])
  const [printLoading, setPrintLoading] = useState(false)

  const searchRef = useRef(debouncedSearch)
  const pageRef = useRef(page)
  const statusRef = useRef(statusFilter)
  const zoneRef = useRef(zoneFilter)
  const categoryRef = useRef(categoryFilter)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), search ? 300 : 0)
    return () => clearTimeout(t)
  }, [search])
  useEffect(() => { searchRef.current = debouncedSearch }, [debouncedSearch])
  useEffect(() => { statusRef.current = statusFilter }, [statusFilter])
  useEffect(() => { zoneRef.current = zoneFilter }, [zoneFilter])
  useEffect(() => { categoryRef.current = categoryFilter }, [categoryFilter])

  useEffect(() => {
    api.get<DeliveryZone[]>('/api/delivery-zones').then(setFilterZones).catch(() => {})
    api.get<ClientCategory[]>('/api/client-categories').then(setFilterCategories).catch(() => {})
  }, [])

  const openCreateModal = useCallback(() => {
    setEditCustomer(null)
    setCustomerModal(true)
  }, [])

  const fetchCustomers = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number | undefined> = {
        search: searchRef.current || undefined,
        page: pageRef.current,
        limit: 20,
        is_active: statusRef.current === 'all' ? undefined : statusRef.current === 'active' ? 1 : 0,
        delivery_zone_id: zoneRef.current || undefined,
        client_category_id: categoryRef.current || undefined,
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
  }, [debouncedSearch, statusFilter, zoneFilter, categoryFilter, fetchCustomers])

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

  const PRINT_FIELDS: { key: string; label: string }[] = [
    { key: 'customer_code', label: 'Código' },
    { key: 'full_name', label: 'Nombre' },
    { key: 'document', label: 'Documento' },
    { key: 'phone', label: 'Teléfono' },
    { key: 'email', label: 'Email' },
    { key: 'address', label: 'Dirección' },
    { key: 'locality', label: 'Localidad' },
    { key: 'province', label: 'Provincia' },
    { key: 'postal_code', label: 'Código postal' },
    { key: 'delivery_zone_name', label: 'Zona de entrega' },
    { key: 'client_category_name', label: 'Categoría' },
    { key: 'current_balance', label: 'Saldo' },
    { key: 'credit_limit', label: 'Límite de crédito' },
    { key: 'birthdate', label: 'Fecha de nacimiento' },
    { key: 'is_active', label: 'Estado' },
    { key: 'notes', label: 'Notas' },
  ]

  const togglePrintField = (key: string) => {
    setPrintFields(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  const handlePrint = async () => {
    setPrintLoading(true)
    try {
      const baseParams: Record<string, string | number | undefined> = {
        search: debouncedSearch || undefined,
        limit: 100,
        is_active: statusFilter === 'all' ? undefined : statusFilter === 'active' ? 1 : 0,
        delivery_zone_id: zoneFilter || undefined,
        client_category_id: categoryFilter || undefined,
      }
      const customers: CustomerSummary[] = []
      let currentPage = 1
      let totalPages = 1
      do {
        const res = await api.get<PaginatedResponse<CustomerSummary>>('/api/customers', { ...baseParams, page: currentPage })
        customers.push(...res.data)
        totalPages = res.pagination.pages
        currentPage++
      } while (currentPage <= totalPages)

      const selected = PRINT_FIELDS.filter(f => printFields.includes(f.key))

      const formatCell = (customer: CustomerSummary, key: string): string => {
        const val = (customer as unknown as Record<string, unknown>)[key]
        if (val === null || val === undefined || val === '') return '—'
        if (key === 'is_active') return val ? 'Activo' : 'Inactivo'
        if (key === 'current_balance' || key === 'credit_limit') {
          return `$${Number(val).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
        }
        if (key === 'birthdate') return String(val).split('T')[0]
        return String(val)
      }

      const headerRow = selected.map(f => `<th>${f.label}</th>`).join('')
      const bodyRows = customers.map(c =>
        `<tr>${selected.map(f => `<td>${formatCell(c, f.key)}</td>`).join('')}</tr>`
      ).join('')

      const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>Listado de Clientes</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 10px; color: #111; background: #fff; padding: 16mm 14mm; }
  h1 { font-size: 14px; font-weight: 700; margin-bottom: 4px; }
  .meta { font-size: 9px; color: #666; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f0f0f0; text-align: left; padding: 5px 6px; font-size: 9px; font-weight: 600; border: 1px solid #ccc; white-space: nowrap; }
  td { padding: 4px 6px; border: 1px solid #ddd; vertical-align: top; word-break: break-word; max-width: 160px; }
  tr:nth-child(even) td { background: #fafafa; }
  @media print {
    body { padding: 10mm 10mm; }
    @page { size: A4 landscape; margin: 10mm; }
  }
</style>
</head>
<body>
<h1>Listado de Clientes</h1>
<p class="meta">Generado el ${new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })} — ${customers.length} cliente${customers.length !== 1 ? 's' : ''}${debouncedSearch ? ` · Búsqueda: "${debouncedSearch}"` : ''}${statusFilter !== 'all' ? ` · ${statusFilter === 'active' ? 'Activos' : 'Inactivos'}` : ''}</p>
<table>
<thead><tr>${headerRow}</tr></thead>
<tbody>${bodyRows}</tbody>
</table>
</body>
</html>`

      const win = window.open('', '_blank')
      if (win) {
        win.document.write(html)
        win.document.close()
        win.focus()
        setTimeout(() => { win.print() }, 400)
      }
      setPrintModal(false)
    } catch {
      toast.error('Error al generar el listado')
    } finally {
      setPrintLoading(false)
    }
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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'n' || !e.altKey || customerModal || activeTab !== 'customers') return
      const target = e.target as HTMLElement | null
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        !!target?.closest('[contenteditable="true"]')
      if (isTypingTarget) return
      e.preventDefault()
      openCreateModal()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [customerModal, openCreateModal, activeTab])

  return (
    <AppShell>
      <PageHeader
        title="Clientes"
        description={activeTab === 'customers' ? `${pagination.total} clientes registrados` : activeTab === 'zones' ? 'Zonas de entrega' : 'Categorías de clientes'}
        action={
          activeTab === 'customers'
            ? (
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => setPrintModal(true)}><Printer size={15} /> Imprimir clientes</Button>
                <Button onClick={openCreateModal}><Plus size={15} /> Nuevo cliente</Button>
              </div>
            )
            : undefined
        }
      />

      <div className="px-5 pt-4 pb-0">
        <div className="flex gap-1 border-b border-[var(--border)]">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-transparent text-[var(--text2)] hover:text-[var(--text)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5 space-y-4">

        {/* Tab: Clientes */}
        {activeTab === 'customers' && (
          <>
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

              {filterZones.length > 0 && (
                <select
                  value={zoneFilter}
                  onChange={e => setZoneFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs rounded-full bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
                >
                  <option value="">Todas las zonas</option>
                  {filterZones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              )}

              {filterCategories.length > 0 && (
                <select
                  value={categoryFilter}
                  onChange={e => setCategoryFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs rounded-full bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] cursor-pointer"
                >
                  <option value="">Todas las categorías</option>
                  {filterCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}

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
                action={<Button onClick={openCreateModal}><Plus size={15} /> Nuevo cliente</Button>}
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
                            <div className="flex items-center gap-2 mt-0.5">
                              {customer.delivery_zone_name && (
                                <span className="flex items-center gap-1 text-xs text-[var(--text3)]">
                                  <span
                                    className="w-2 h-2 rounded-full inline-block flex-shrink-0"
                                    style={{ backgroundColor: customer.delivery_zone_color ?? 'var(--text3)' }}
                                  />
                                  {customer.delivery_zone_name}
                                </span>
                              )}
                              {customer.client_category_name && (
                                <span className="text-xs text-[var(--text3)]">{customer.client_category_name}</span>
                              )}
                            </div>
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
          </>
        )}

        {/* Tab: Zonas de entrega */}
        {activeTab === 'zones' && <DeliveryZonesTab />}

        {/* Tab: Categorías */}
        {activeTab === 'categories' && <ClientCategoriesTab />}

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

      <Modal open={printModal} onClose={() => setPrintModal(false)} title="Imprimir listado de clientes" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-[var(--text2)]">Elegí qué columnas incluir en el listado impreso.</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {PRINT_FIELDS.map(f => (
              <label key={f.key} className="flex items-center gap-2 cursor-pointer text-sm text-[var(--text)]">
                <input
                  type="checkbox"
                  checked={printFields.includes(f.key)}
                  onChange={() => togglePrintField(f.key)}
                  className="w-4 h-4 accent-[var(--accent)] cursor-pointer"
                />
                {f.label}
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
            <Button variant="secondary" onClick={() => setPrintModal(false)} disabled={printLoading}>Cancelar</Button>
            <Button onClick={handlePrint} loading={printLoading} disabled={printFields.length === 0}>
              <Printer size={14} /> Imprimir
            </Button>
          </div>
        </div>
      </Modal>
    </AppShell>
  )
}
