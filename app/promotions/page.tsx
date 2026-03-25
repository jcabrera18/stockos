'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoader } from '@/components/ui/Spinner'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { Percent, Plus, Pencil, Trash2, Tag, Calendar, CheckCircle, XCircle, Search } from 'lucide-react'
import { toast } from 'sonner'

interface Promotion {
  id:          string
  name:        string
  type:        'percentage' | 'nxm' | 'second_half' | 'fixed_price'
  scope:       'all' | 'product' | 'brand' | 'category' | 'supplier'
  scope_id?:   string | null
  config:      Record<string, unknown>
  active_from?: string | null
  active_to?:   string | null
  active_days?: number[] | null
  is_active:   boolean
}

interface ScopeOption { id: string; name: string }
interface CategoryOption extends ScopeOption { parent_id?: string | null }
interface CategoryWithChildren extends CategoryOption { children: CategoryWithChildren[] }

const TYPE_LABELS: Record<string, string> = {
  percentage:   '% Descuento',
  nxm:          'NxM',
  second_half:  '2do a mitad',
  fixed_price:  'Precio fijo',
}

const TYPE_COLORS: Record<string, string> = {
  percentage:  'success',
  nxm:         'warning',
  second_half: 'default',
  fixed_price: 'danger',
}

const SCOPE_LABELS: Record<string, string> = {
  all:      'Todos los productos',
  product:  'Producto específico',
  brand:    'Marca',
  category: 'Categoría',
  supplier: 'Proveedor',
}

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function promoSummary(promo: Promotion): string {
  if (promo.type === 'percentage')  return `${promo.config.discount_pct}% de descuento`
  if (promo.type === 'nxm')         return `${promo.config.get}x${promo.config.pay}`
  if (promo.type === 'second_half') return `2do al ${promo.config.discount_pct ?? 50}%`
  if (promo.type === 'fixed_price') return `${promo.config.qty} por ${formatCurrency(Number(promo.config.price))}`
  return ''
}

const defaultForm = {
  name:        '',
  type:        'percentage' as Promotion['type'],
  scope:       'all' as Promotion['scope'],
  scope_id:    '',
  active_from: '',
  active_to:   '',
  active_days: [] as number[],
  is_active:   true,
  // config fields
  discount_pct: '20',
  pay:          '2',
  get:          '3',
  qty:          '3',
  price:        '',
}

export default function PromotionsPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [loading, setLoading]       = useState(true)

  // Opciones para scope (todos excepto producto)
  const [brands,     setBrands]     = useState<ScopeOption[]>([])
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [suppliers,  setSuppliers]  = useState<ScopeOption[]>([])

  // Buscador de producto
  const [productQuery,     setProductQuery]     = useState('')
  const [productResults,   setProductResults]   = useState<ScopeOption[]>([])
  const [productSearching, setProductSearching] = useState(false)
  const [selectedProductName, setSelectedProductName] = useState('')
  const productDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Modal
  const [modal, setModal]       = useState(false)
  const [editPromo, setEditPromo] = useState<Promotion | null>(null)
  const [form, setForm]         = useState(defaultForm)
  const [saving, setSaving]     = useState(false)

  // Delete
  const [deleteModal, setDeleteModal] = useState(false)
  const [deletePromo, setDeletePromo] = useState<Promotion | null>(null)
  const [deleting, setDeleting]       = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [promos, brnds, cats, sups] = await Promise.all([
        api.get<Promotion[]>('/api/promotions'),
        api.get<ScopeOption[]>('/api/brands'),
        api.get<CategoryOption[]>('/api/products/categories'),
        api.get<ScopeOption[]>('/api/purchases/suppliers'),
      ])
      setPromotions(promos)
      setBrands(brnds)
      setCategories(cats)
      setSuppliers(sups)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [])

  // Búsqueda debounced de productos
  useEffect(() => {
    if (form.scope !== 'product') return
    if (!productQuery.trim()) { setProductResults([]); return }
    if (productDebounceRef.current) clearTimeout(productDebounceRef.current)
    productDebounceRef.current = setTimeout(async () => {
      setProductSearching(true)
      try {
        const res = await api.get<{ data: ScopeOption[] }>('/api/products', { search: productQuery.trim(), limit: 10 })
        setProductResults(res.data)
      } catch { setProductResults([]) }
      finally { setProductSearching(false) }
    }, 300)
    return () => { if (productDebounceRef.current) clearTimeout(productDebounceRef.current) }
  }, [productQuery, form.scope])

  useEffect(() => { fetchAll() }, [fetchAll])

  const openCreate = () => {
    setEditPromo(null)
    setForm(defaultForm)
    setProductQuery('')
    setProductResults([])
    setSelectedProductName('')
    setModal(true)
  }

  const openEdit = async (p: Promotion) => {
    setEditPromo(p)
    setForm({
      name:         p.name,
      type:         p.type,
      scope:        p.scope,
      scope_id:     p.scope_id ?? '',
      active_from:  p.active_from ?? '',
      active_to:    p.active_to   ?? '',
      active_days:  p.active_days ?? [],
      is_active:    p.is_active,
      discount_pct: String(p.config.discount_pct ?? 20),
      pay:          String(p.config.pay           ?? 2),
      get:          String(p.config.get           ?? 3),
      qty:          String(p.config.qty           ?? 3),
      price:        String(p.config.price         ?? ''),
    })
    setProductQuery('')
    setProductResults([])
    // Si es scope producto, cargar el nombre del producto seleccionado
    if (p.scope === 'product' && p.scope_id) {
      try {
        const prod = await api.get<{ name: string }>(`/api/products/${p.scope_id}`)
        setSelectedProductName(prod.name)
      } catch { setSelectedProductName('') }
    } else {
      setSelectedProductName('')
    }
    setModal(true)
  }

  const buildConfig = () => {
    if (form.type === 'percentage')  return { discount_pct: Number(form.discount_pct) }
    if (form.type === 'nxm')         return { pay: Number(form.pay), get: Number(form.get) }
    if (form.type === 'second_half') return { discount_pct: Number(form.discount_pct) }
    if (form.type === 'fixed_price') return { qty: Number(form.qty), price: Number(form.price) }
    return {}
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('El nombre es obligatorio'); return }
    if (form.scope !== 'all' && !form.scope_id) {
      toast.error('Seleccioná el alcance de la promoción'); return
    }

    setSaving(true)
    try {
      const payload = {
        name:        form.name.trim(),
        type:        form.type,
        scope:       form.scope,
        scope_id:    form.scope !== 'all' ? form.scope_id : null,
        config:      buildConfig(),
        active_from: form.active_from || null,
        active_to:   form.active_to   || null,
        active_days: form.active_days.length > 0 ? form.active_days : null,
        is_active:   form.is_active,
      }

      if (editPromo) {
        await api.patch(`/api/promotions/${editPromo.id}`, payload)
        toast.success('Promoción actualizada')
      } else {
        await api.post('/api/promotions', payload)
        toast.success('Promoción creada')
      }
      setModal(false)
      fetchAll()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deletePromo) return
    setDeleting(true)
    try {
      await api.delete(`/api/promotions/${deletePromo.id}`)
      toast.success('Promoción desactivada')
      setDeleteModal(false)
      fetchAll()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error')
    } finally { setDeleting(false) }
  }

  const toggleDay = (day: number) => {
    setForm(f => ({
      ...f,
      active_days: f.active_days.includes(day)
        ? f.active_days.filter(d => d !== day)
        : [...f.active_days, day]
    }))
  }

  const scopeOptions: Record<string, ScopeOption[]> = {
    brand:    brands,
    supplier: suppliers,
  }

  // Árbol de categorías en cascada (igual que ProductModal)
  function buildCategoryTree(cats: CategoryOption[]): CategoryWithChildren[] {
    const map = new Map<string, CategoryWithChildren>()
    const roots: CategoryWithChildren[] = []
    cats.forEach(c => map.set(c.id, { ...c, children: [] }))
    cats.forEach(c => {
      const node = map.get(c.id)!
      if (c.parent_id && map.has(c.parent_id)) map.get(c.parent_id)!.children.push(node)
      else roots.push(node)
    })
    return roots
  }

  const categoryMap = new Map(categories.map(c => [c.id, c]))
  const l1Tree = buildCategoryTree(categories)

  let catL1 = '', catL2 = '', catL3 = ''
  if (form.scope === 'category' && form.scope_id) {
    const cat = categoryMap.get(form.scope_id)
    if (cat) {
      if (!cat.parent_id) {
        catL1 = form.scope_id
      } else {
        const parent = categoryMap.get(cat.parent_id)
        if (parent) {
          if (!parent.parent_id) {
            catL1 = parent.id; catL2 = form.scope_id
          } else {
            const grandparent = categoryMap.get(parent.parent_id)
            if (grandparent) { catL1 = grandparent.id; catL2 = parent.id; catL3 = form.scope_id }
          }
        }
      }
    }
  }

  const l2Options = catL1 ? (l1Tree.find(c => c.id === catL1)?.children ?? []) : []
  const l2Node    = l2Options.find(c => c.id === catL2)
  const l3Options = catL2 ? (l2Node?.children ?? []) : []

  const selectClass = 'w-full px-2 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed'

  const active   = promotions.filter(p => p.is_active)
  const inactive = promotions.filter(p => !p.is_active)

  return (
    <AppShell>
      <PageHeader
        title="Promociones"
        description={`${active.length} activas`}
        action={<Button onClick={openCreate}><Plus size={15} /> Nueva promoción</Button>}
      />

      <div className="p-5 space-y-5">
        {loading ? <PageLoader /> : promotions.length === 0 ? (
          <EmptyState icon={Percent}
            title="Sin promociones"
            description="Creá tu primera promoción para que se aplique automáticamente en el POS."
            action={<Button onClick={openCreate}><Plus size={15} /> Nueva promoción</Button>}
          />
        ) : (
          <>
            {/* Activas */}
            {active.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-[var(--text)]">Activas</h2>
                {active.map(p => (
                  <PromotionCard key={p.id} promo={p}
                    onEdit={() => openEdit(p)}
                    onDelete={() => { setDeletePromo(p); setDeleteModal(true) }}
                  />
                ))}
              </div>
            )}

            {/* Inactivas */}
            {inactive.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-[var(--text3)]">Inactivas</h2>
                {inactive.map(p => (
                  <PromotionCard key={p.id} promo={p}
                    onEdit={() => openEdit(p)}
                    onDelete={() => { setDeletePromo(p); setDeleteModal(true) }}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Modal crear/editar ── */}
      <Modal open={modal} onClose={() => setModal(false)}
        title={editPromo ? 'Editar promoción' : 'Nueva promoción'} size="md">
        <div className="space-y-4">

          {/* Nombre */}
          <Input label="Nombre *" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Ej: 3x2 Bebidas, 20% OFF Limpieza..." autoFocus />

          {/* Tipo */}
          <div>
            <label className="text-sm font-medium text-[var(--text2)] block mb-2">Tipo de promoción *</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['percentage', 'nxm', 'second_half', 'fixed_price'] as const).map(t => (
                <button key={t} onClick={() => setForm(f => ({ ...f, type: t }))}
                  className={`px-3 py-2.5 text-xs rounded-[var(--radius-md)] border font-medium transition-all text-center ${
                    form.type === t
                      ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]'
                      : 'border-[var(--border)] bg-[var(--surface2)] text-[var(--text2)] hover:border-[var(--accent)]'
                  }`}>
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Config según tipo */}
          {form.type === 'percentage' && (
            <Input label="% de descuento *" type="number" min="1" max="100"
              value={form.discount_pct}
              onChange={e => setForm(f => ({ ...f, discount_pct: e.target.value }))}
              placeholder="20" hint="Ej: 20 para 20% de descuento" />
          )}

          {form.type === 'nxm' && (
            <div className="grid grid-cols-2 gap-3">
              <Input label="Llevan *" type="number" min="2"
                value={form.get}
                onChange={e => setForm(f => ({ ...f, get: e.target.value }))}
                placeholder="3" hint="Cantidad que se llevan" />
              <Input label="Pagan *" type="number" min="1"
                value={form.pay}
                onChange={e => setForm(f => ({ ...f, pay: e.target.value }))}
                placeholder="2" hint="Cantidad que pagan" />
            </div>
          )}

          {form.type === 'second_half' && (
            <Input label="% de descuento en el 2do *" type="number" min="1" max="100"
              value={form.discount_pct}
              onChange={e => setForm(f => ({ ...f, discount_pct: e.target.value }))}
              placeholder="50" hint="Normalmente 50%" />
          )}

          {form.type === 'fixed_price' && (
            <div className="grid grid-cols-2 gap-3">
              <Input label="Cantidad *" type="number" min="2"
                value={form.qty}
                onChange={e => setForm(f => ({ ...f, qty: e.target.value }))}
                placeholder="3" hint="Ej: 3 unidades" />
              <Input label="Precio total *" type="number" min="0"
                value={form.price}
                onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                placeholder="1000" hint="Precio por el lote" />
            </div>
          )}

          {/* Alcance */}
          <div>
            <label className="text-sm font-medium text-[var(--text2)] block mb-1">Aplica a *</label>
            <select value={form.scope}
              onChange={e => setForm(f => ({ ...f, scope: e.target.value as Promotion['scope'], scope_id: '' }))}
              className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]">
              {Object.entries(SCOPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          {form.scope === 'product' && (
            <div>
              <label className="text-sm font-medium text-[var(--text2)] block mb-1">Producto *</label>
              {form.scope_id && selectedProductName ? (
                // Producto seleccionado — mostrar chip con opción de cambiar
                <div className="flex items-center gap-2 px-3 py-2 bg-[var(--accent-subtle)] border border-[var(--accent)] rounded-[var(--radius-md)]">
                  <span className="text-sm text-[var(--accent)] font-medium flex-1 truncate">{selectedProductName}</span>
                  <button
                    onClick={() => { setForm(f => ({ ...f, scope_id: '' })); setSelectedProductName(''); setProductQuery('') }}
                    className="text-xs text-[var(--accent)] underline flex-shrink-0"
                  >
                    Cambiar
                  </button>
                </div>
              ) : (
                // Buscador
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
                  {productSearching && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />
                  )}
                  <input
                    value={productQuery}
                    onChange={e => setProductQuery(e.target.value)}
                    placeholder="Buscar producto por nombre o código..."
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)]"
                  />
                  {productResults.length > 0 && (
                    <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-lg overflow-hidden">
                      {productResults.map(p => (
                        <button key={p.id}
                          onClick={() => {
                            setForm(f => ({ ...f, scope_id: p.id }))
                            setSelectedProductName(p.name)
                            setProductQuery('')
                            setProductResults([])
                          }}
                          className="w-full text-left px-3 py-2.5 text-sm text-[var(--text)] hover:bg-[var(--surface2)] transition-colors border-b border-[var(--border)] last:border-0"
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {form.scope === 'category' && (
            <div>
              <label className="text-sm font-medium text-[var(--text2)] block mb-1">Categoría *</label>
              <div className="grid grid-cols-3 gap-2">
                <select value={catL1}
                  onChange={e => setForm(f => ({ ...f, scope_id: e.target.value }))}
                  className={selectClass}>
                  <option value="">Sin categoría</option>
                  {l1Tree.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select value={catL2} disabled={l2Options.length === 0}
                  onChange={e => setForm(f => ({ ...f, scope_id: e.target.value || catL1 }))}
                  className={selectClass}>
                  <option value="">{catL1 ? 'General' : '—'}</option>
                  {l2Options.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select value={catL3} disabled={l3Options.length === 0}
                  onChange={e => setForm(f => ({ ...f, scope_id: e.target.value || catL2 }))}
                  className={selectClass}>
                  <option value="">{catL2 ? 'General' : '—'}</option>
                  {l3Options.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
          )}

          {(form.scope === 'brand' || form.scope === 'supplier') && (
            <div>
              <label className="text-sm font-medium text-[var(--text2)] block mb-1">
                {SCOPE_LABELS[form.scope]} *
              </label>
              <select value={form.scope_id}
                onChange={e => setForm(f => ({ ...f, scope_id: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]">
                <option value="">Seleccionar...</option>
                {(scopeOptions[form.scope] ?? []).map(o => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-3">
            <Input label="Desde" type="date"
              value={form.active_from}
              onChange={e => setForm(f => ({ ...f, active_from: e.target.value }))}
              hint="Vacío = sin límite" />
            <Input label="Hasta" type="date"
              value={form.active_to}
              onChange={e => setForm(f => ({ ...f, active_to: e.target.value }))}
              hint="Vacío = sin límite" />
          </div>

          {/* Días de la semana */}
          <div>
            <label className="text-sm font-medium text-[var(--text2)] block mb-2">
              Días activos <span className="text-[var(--text3)] font-normal">(vacío = todos los días)</span>
            </label>
            <div className="flex gap-2">
              {DAYS.map((day, i) => (
                <button key={i} onClick={() => toggleDay(i)}
                  className={`flex-1 py-1.5 text-xs rounded-[var(--radius-md)] border font-medium transition-all ${
                    form.active_days.includes(i)
                      ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]'
                      : 'border-[var(--border)] bg-[var(--surface2)] text-[var(--text3)]'
                  }`}>
                  {day}
                </button>
              ))}
            </div>
          </div>

          {/* Estado */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_active}
              onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
              className="w-4 h-4 accent-[var(--accent)]" />
            <span className="text-sm text-[var(--text2)]">Promoción activa</span>
          </label>

          <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 border-t border-[var(--border)]">
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setModal(false)} disabled={saving}>Cancelar</Button>
              <Button onClick={handleSave} loading={saving}>
                {editPromo ? 'Guardar' : 'Crear promoción'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteModal}
        onClose={() => { setDeleteModal(false); setDeletePromo(null) }}
        onConfirm={handleDelete}
        title="Desactivar promoción"
        message={`¿Desactivás "${deletePromo?.name}"? Se dejará de aplicar en el POS.`}
        confirmLabel="Desactivar"
        loading={deleting}
        danger
      />
    </AppShell>
  )
}

// ── Card de promoción ──────────────────────────────────────
function PromotionCard({ promo, onEdit, onDelete }: {
  promo:    Promotion
  onEdit:   () => void
  onDelete: () => void
}) {
  const today     = new Date()
  const todayStr  = today.toISOString().split('T')[0]
  const todayDay  = today.getDay()

  const isExpired  = promo.active_to   ? todayStr > promo.active_to   : false
  const isUpcoming = promo.active_from ? todayStr < promo.active_from  : false
  const wrongDay   = promo.active_days && promo.active_days.length > 0
    ? !promo.active_days.includes(todayDay) : false

  const statusLabel = isExpired  ? 'Vencida' :
                      isUpcoming ? 'Programada' :
                      wrongDay   ? 'Fuera de horario' : 'Activa hoy'

  const statusColor = isExpired || wrongDay ? 'text-[var(--danger)]' :
                      isUpcoming ? 'text-[var(--warning)]' : 'text-[var(--accent)]'

  return (
    <div className={`bg-[var(--surface)] border rounded-[var(--radius-lg)] p-4 ${
      promo.is_active ? 'border-[var(--border)]' : 'border-[var(--border)] opacity-60'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-[var(--text)]">{promo.name}</span>
            <Badge variant={TYPE_COLORS[promo.type] as 'success' | 'warning' | 'default' | 'danger'}>
              {TYPE_LABELS[promo.type]}
            </Badge>
            {promo.is_active && (
              <span className={`text-xs font-medium flex items-center gap-1 ${statusColor}`}>
                {isExpired || wrongDay ? <XCircle size={11} /> : <CheckCircle size={11} />}
                {statusLabel}
              </span>
            )}
          </div>

          <p className="text-sm text-[var(--accent)] font-medium mt-1">
            {promoSummary(promo as Promotion)}
          </p>

          <div className="flex flex-wrap gap-3 mt-2 text-xs text-[var(--text3)]">
            <span className="flex items-center gap-1">
              <Tag size={11} />
              {SCOPE_LABELS[promo.scope]}
            </span>
            {(promo.active_from || promo.active_to) && (
              <span className="flex items-center gap-1">
                <Calendar size={11} />
                {promo.active_from ?? '∞'} → {promo.active_to ?? '∞'}
              </span>
            )}
            {promo.active_days && promo.active_days.length > 0 && (
              <span>
                {promo.active_days.map(d => ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][d]).join(', ')}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={onEdit}
            className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors">
            <Pencil size={13} />
          </button>
          <button onClick={onDelete}
            className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--danger)] hover:bg-[var(--danger-subtle)] transition-colors">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}
