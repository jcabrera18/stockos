'use client'
import { useEffect, useState, useCallback } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoader } from '@/components/ui/Spinner'
import { Badge } from '@/components/ui/Badge'
import { api } from '@/lib/api'
import { Plus, Tag, Pencil, Trash2, Star, TrendingUp, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { PrintShelfLabelsModal } from '@/components/modules/PrintShelfLabelsModal'
import { BulkPriceModal } from '@/components/modules/BulkPriceModal'
import { PrintPriceListModal } from '@/components/modules/PrintPriceListModal'

export interface PriceList {
  id: string
  business_id: string
  name: string
  description?: string
  margin_pct: number
  min_quantity: number
  is_default: boolean
  is_active: boolean
  created_at: string
}

const PRESET_LISTS = [
  { name: 'Minorista', description: 'Precio de venta al público general', margin_pct: 40, is_default: true },
  { name: 'Mayorista', description: 'Precio para compras al por mayor', margin_pct: 20, is_default: false },
  { name: 'Especial / VIP', description: 'Precio preferencial para clientes VIP', margin_pct: 30, is_default: false },
]

const emptyForm = { name: '', description: '', margin_pct: '', min_quantity: '1', is_default: false }

export default function PriceListsPage() {
  const [lists, setLists] = useState<PriceList[]>([])
  const [loading, setLoading] = useState(true)

  // Modal crear/editar
  const [modal, setModal] = useState(false)
  const [editList, setEditList] = useState<PriceList | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Modal eliminar
  const [deleteModal, setDeleteModal] = useState(false)
  const [deleteList, setDeleteList] = useState<PriceList | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Modal presets (primera vez sin listas)
  const [presetsModal, setPresetsModal] = useState(false)
  const [creatingPresets, setCreatingPresets] = useState(false)

  // Modal imprimir etiquetas
  const [printModal, setPrintModal] = useState(false)

  // Modal lista de precios y actualizar precios
  const [priceListPrintModal, setPriceListPrintModal] = useState(false)
  const [bulkPriceModal, setBulkPriceModal] = useState(false)

  const fetchLists = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get<PriceList[]>('/api/price-lists')
      setLists(data)
      if (data.length === 0) setPresetsModal(true)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchLists() }, [fetchLists])

  const openCreate = () => {
    setEditList(null)
    setForm(emptyForm)
    setErrors({})
    setModal(true)
  }

  const openEdit = (list: PriceList) => {
    setEditList(list)
    setForm({
      name: list.name,
      description: list.description ?? '',
      margin_pct: String(list.margin_pct),
      is_default: list.is_default,
      min_quantity: String(list.min_quantity ?? 1),
    })
    setErrors({})
    setModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setErrors({ name: 'El nombre es obligatorio' }); return }
    if (form.margin_pct === '') { setErrors({ margin_pct: 'El margen es obligatorio' }); return }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        margin_pct: Number(form.margin_pct),
        is_default: form.is_default,
        min_quantity: Number(form.min_quantity) || 1,
      }
      if (editList) {
        await api.patch(`/api/price-lists/${editList.id}`, payload)
        toast.success('Lista actualizada')
      } else {
        await api.post('/api/price-lists', payload)
        toast.success('Lista creada')
      }
      setModal(false)
      fetchLists()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleteList) return
    setDeleting(true)
    try {
      await api.delete(`/api/price-lists/${deleteList.id}`)
      toast.success('Lista eliminada')
      setDeleteModal(false)
      setDeleteList(null)
      fetchLists()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    } finally { setDeleting(false) }
  }

  const handleCreatePresets = async () => {
    setCreatingPresets(true)
    try {
      for (const preset of PRESET_LISTS) {
        await api.post('/api/price-lists', preset)
      }
      toast.success('Listas creadas correctamente')
      setPresetsModal(false)
      fetchLists()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al crear listas')
    } finally { setCreatingPresets(false) }
  }

  // Calcular precio de ejemplo con $1000 de costo
  const examplePrice = (margin: number) =>
    Math.round(1000 * (1 + margin / 100))

  return (
    <AppShell>
      <PageHeader
        title="Listas de precio"
        description={`${lists.length} listas activas`}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setPriceListPrintModal(true)}>
              <Printer size={15} /> <span className="hidden sm:inline">Lista de precios</span>
            </Button>
            <Button variant="secondary" onClick={() => setBulkPriceModal(true)}>
              <TrendingUp size={15} /> <span className="hidden sm:inline">Actualizar precios</span>
            </Button>
            <Button variant="secondary" onClick={() => setPrintModal(true)} disabled={lists.length === 0}>
              <Printer size={15} /> Imprimir precios
            </Button>
            <Button onClick={openCreate}>
              <Plus size={15} /> Nueva lista
            </Button>
          </div>
        }
      />

      <div className="p-5 space-y-4">

        {/* Info explicativa */}
        <div className="px-4 py-3 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] text-sm text-[var(--text2)]">
          <p className="font-medium text-[var(--text)] mb-1">¿Cómo funcionan las listas de precio?</p>
          <p>Cada lista define un <strong>margen % sobre el costo</strong> del producto. El precio de venta se calcula como:</p>
          <p className="mono text-[var(--accent)] mt-1">Precio = Costo × (1 + Margen%)</p>
          <p className="mt-1 text-[var(--text3)]">En el POS podés elegir qué lista aplicar antes de cobrar. La lista por defecto se usa cuando no se elige ninguna.</p>
        </div>

        {loading ? <PageLoader /> : lists.length === 0 ? (
          <EmptyState
            icon={Tag}
            title="Sin listas de precio"
            description="Creá tus primeras listas o usá las presets."
            action={
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setPresetsModal(true)}>Usar presets</Button>
                <Button onClick={openCreate}><Plus size={15} /> Nueva lista</Button>
              </div>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {lists.map(list => (
              <div
                key={list.id}
                className={`bg-[var(--surface)] border rounded-[var(--radius-lg)] p-4 group transition-all hover:shadow-sm ${list.is_default
                  ? 'border-[var(--accent)]'
                  : 'border-[var(--border)]'
                  }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-[var(--text)]">{list.name}</h3>
                      {list.is_default && (
                        <Star size={13} className="text-[var(--accent)] fill-[var(--accent)]" />
                      )}
                    </div>
                    {list.description && (
                      <p className="text-xs text-[var(--text3)] mt-0.5">{list.description}</p>
                    )}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(list)}
                      className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors">
                      <Pencil size={13} />
                    </button>
                    {!list.is_default && (
                      <button onClick={() => { setDeleteList(list); setDeleteModal(true) }}
                        className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--danger)] hover:bg-[var(--danger-subtle)] transition-colors">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Margen grande */}
                <div className="flex items-end gap-2 mb-3">
                  <span className="text-4xl font-bold mono text-[var(--accent)]">
                    {list.margin_pct > 0 ? '+' : ''}{list.margin_pct}%
                  </span>
                  <span className="text-xs text-[var(--text3)] mb-1.5">margen sobre costo</span>
                </div>

                {/* Debajo del margen grande, antes del ejemplo */}
                <p className="text-xs text-[var(--text3)] -mt-2 mb-2">
                  Desde <span className="font-semibold text-[var(--text)]">{list.min_quantity}</span> {list.min_quantity === 1 ? 'unidad' : 'unidades'}
                </p>

                {/* Ejemplo */}
                <div className="px-3 py-2 bg-[var(--surface2)] rounded-[var(--radius-md)] text-xs">
                  <div className="flex justify-between text-[var(--text3)]">
                    <span>Ejemplo: costo $1.000</span>
                    <span className="flex items-center gap-1">
                      <TrendingUp size={11} />
                      venta: <span className="font-semibold mono text-[var(--text)]">${examplePrice(list.margin_pct).toLocaleString('es-AR')}</span>
                    </span>
                  </div>
                </div>

                {/* Badge default */}
                {list.is_default && (
                  <div className="mt-2">
                    <Badge variant="success">Lista por defecto</Badge>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal crear/editar */}
      <Modal open={modal} onClose={() => setModal(false)}
        title={editList ? 'Editar lista' : 'Nueva lista de precio'} size="sm">
        <div className="space-y-4">
          <Input
            label="Nombre *"
            value={form.name}
            onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setErrors(er => ({ ...er, name: '' })) }}
            placeholder="Ej: Mayorista, VIP, Revendedor..."
            error={errors.name}
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[var(--text2)]">Descripción</label>
            <input
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Descripción opcional..."
              className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div>
            <Input
              label="Margen % sobre costo *"
              type="number"
              step="0.5"
              value={form.margin_pct}
              onChange={e => { setForm(f => ({ ...f, margin_pct: e.target.value })); setErrors(er => ({ ...er, margin_pct: '' })) }}
              placeholder="Ej: 40 para 40%"
              error={errors.margin_pct}
              hint="Puede ser negativo para hacer descuentos"
            />
            <Input
              label="Cantidad mínima"
              type="number"
              min="1"
              step="1"
              value={form.min_quantity}
              onChange={e => setForm(f => ({ ...f, min_quantity: e.target.value }))}
              hint="Aplica esta lista cuando se venden X o más unidades del mismo producto"
            />
            {/* Preview en tiempo real */}
            {form.margin_pct !== '' && !isNaN(Number(form.margin_pct)) && (
              <div className="mt-2 px-3 py-2 bg-[var(--surface2)] rounded-[var(--radius-md)] text-xs">
                <div className="flex justify-between">
                  <span className="text-[var(--text3)]">Costo $1.000 →</span>
                  <span className="font-semibold mono text-[var(--accent)]">
                    Venta ${examplePrice(Number(form.margin_pct)).toLocaleString('es-AR')}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Default toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))}
              className="w-4 h-4 accent-[var(--accent)]"
            />
            <span className="text-sm text-[var(--text2)]">Usar como lista por defecto en el POS</span>
          </label>

          <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 mt-4 border-t border-[var(--border)]">
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setModal(false)} disabled={saving}>Cancelar</Button>
              <Button onClick={handleSave} loading={saving}>
                {editList ? 'Guardar cambios' : 'Crear lista'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal presets */}
      <Modal open={presetsModal} onClose={() => setPresetsModal(false)}
        title="Crear listas de precio" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-[var(--text2)]">
            ¿Querés crear las listas más comunes para empezar rápido?
          </p>
          <div className="space-y-2">
            {PRESET_LISTS.map(p => (
              <div key={p.name} className="flex items-center justify-between px-3 py-2.5 bg-[var(--surface2)] rounded-[var(--radius-md)]">
                <div>
                  <p className="text-sm font-medium text-[var(--text)]">{p.name}</p>
                  <p className="text-xs text-[var(--text3)]">{p.description}</p>
                </div>
                <span className="text-sm font-bold mono text-[var(--accent)]">+{p.margin_pct}%</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-[var(--text3)]">Podés modificar los márgenes después.</p>
          <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 mt-4 border-t border-[var(--border)]">
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPresetsModal(false)}>Omitir</Button>
              <Button onClick={handleCreatePresets} loading={creatingPresets}>Crear listas</Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Confirm eliminar */}
      <ConfirmDialog
        open={deleteModal}
        onClose={() => { setDeleteModal(false); setDeleteList(null) }}
        onConfirm={handleDelete}
        title="Eliminar lista"
        message={`¿Eliminás la lista "${deleteList?.name}"?`}
        confirmLabel="Eliminar"
        loading={deleting}
        danger
      />

      {/* Modal imprimir etiquetas */}
      <PrintShelfLabelsModal open={printModal} onClose={() => setPrintModal(false)} />

      <PrintPriceListModal open={priceListPrintModal} onClose={() => setPriceListPrintModal(false)} />
      <BulkPriceModal open={bulkPriceModal} onClose={() => setBulkPriceModal(false)} onApplied={() => {}} />
    </AppShell>
  )
}
