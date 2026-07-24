'use client'
import { useEffect, useState, useCallback } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Toggle } from '@/components/ui/Toggle'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { api } from '@/lib/api'
import { Plus, Copy, Trash2, ExternalLink, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import type { PriceList } from '@/app/price-lists/page'

interface Catalog {
  id: string
  slug: string
  name: string
  price_list_id: string | null
  only_in_stock: boolean
  warehouse_id: string | null
  whatsapp_phone: string | null
  accept_orders: boolean
  is_active: boolean
  price_lists?: { name: string } | null
  warehouses?: { name: string } | null
}

interface WarehouseItem { id: string; name: string }

interface Props {
  open: boolean
  onClose: () => void
  lists: PriceList[]
}

const emptyForm = {
  name: '',
  price_list_id: '',
  only_in_stock: false,
  warehouse_id: '',
  whatsapp_phone: '',
  accept_orders: false,
}

function catalogUrl(slug: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/c/${slug}`
}

export function ShareCatalogModal({ open, onClose, lists }: Props) {
  const [catalogs, setCatalogs] = useState<Catalog[]>([])
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyForm)
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cats, whs] = await Promise.all([
        api.get<Catalog[]>('/api/catalogs'),
        api.get<WarehouseItem[]>('/api/warehouses').catch(() => [] as WarehouseItem[]),
      ])
      setCatalogs(cats)
      setWarehouses(whs)
    } catch {
      toast.error('No se pudieron cargar los catálogos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) { load(); setShowForm(false); setForm(emptyForm) }
  }, [open, load])

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error('Poné un nombre al catálogo'); return }
    setCreating(true)
    try {
      const created = await api.post<Catalog>('/api/catalogs', {
        name: form.name.trim(),
        price_list_id: form.price_list_id || null,
        only_in_stock: form.only_in_stock,
        warehouse_id: form.only_in_stock && form.warehouse_id ? form.warehouse_id : null,
        whatsapp_phone: form.whatsapp_phone.trim() || null,
        accept_orders: form.accept_orders,
      })
      setCatalogs(prev => [created, ...prev])
      setForm(emptyForm)
      setShowForm(false)
      copyLink(created.slug)
      toast.success('Catálogo creado — link copiado al portapapeles')
    } catch {
      toast.error('No se pudo crear el catálogo')
    } finally {
      setCreating(false)
    }
  }

  const toggleActive = async (cat: Catalog) => {
    try {
      const updated = await api.patch<Catalog>(`/api/catalogs/${cat.id}`, { is_active: !cat.is_active })
      setCatalogs(prev => prev.map(c => (c.id === cat.id ? { ...c, ...updated } : c)))
    } catch {
      toast.error('No se pudo actualizar')
    }
  }

  const toggleAcceptOrders = async (cat: Catalog) => {
    try {
      const updated = await api.patch<Catalog>(`/api/catalogs/${cat.id}`, { accept_orders: !cat.accept_orders })
      setCatalogs(prev => prev.map(c => (c.id === cat.id ? { ...c, ...updated } : c)))
      toast.success(!cat.accept_orders ? 'Pedidos online activados' : 'Pedidos online desactivados')
    } catch {
      toast.error('No se pudo actualizar')
    }
  }

  const remove = async (cat: Catalog) => {
    if (!confirm(`¿Eliminar el catálogo "${cat.name}"? El link dejará de funcionar.`)) return
    try {
      await api.delete(`/api/catalogs/${cat.id}`)
      setCatalogs(prev => prev.filter(c => c.id !== cat.id))
      toast.success('Catálogo eliminado')
    } catch {
      toast.error('No se pudo eliminar')
    }
  }

  const copyLink = (slug: string) => {
    navigator.clipboard.writeText(catalogUrl(slug))
      .then(() => toast.success('Link copiado'))
      .catch(() => toast.error('No se pudo copiar'))
  }

  const listOptions = [
    { value: '', label: 'Precio de venta (base)' },
    ...lists.map(l => ({ value: l.id, label: `${l.name} (+${l.margin_pct}%)` })),
  ]
  const warehouseOptions = [
    { value: '', label: 'Todos los depósitos' },
    ...warehouses.map(w => ({ value: w.id, label: w.name })),
  ]

  return (
    <Modal open={open} onClose={onClose} title="Compartir catálogo" size="lg">
      <div className="space-y-4">
        <p className="text-sm text-[var(--text2)]">
          Generá un link público reutilizable con tus productos y precios. Cualquiera puede abrirlo,
          armar un carrito y copiarte el pedido por WhatsApp.
        </p>

        {loading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : (
          <>
            {/* Lista de catálogos existentes */}
            {catalogs.length > 0 && (
              <div className="space-y-2">
                {catalogs.map(cat => (
                  <div key={cat.id} className="rounded-lg border border-[var(--border)] p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-[var(--text)] truncate">{cat.name}</span>
                          {cat.is_active
                            ? <Badge variant="success">Activo</Badge>
                            : <Badge variant="default">Pausado</Badge>}
                        </div>
                        <div className="text-xs text-[var(--text2)] mt-0.5">
                          {cat.price_lists?.name ?? 'Precio de venta'}
                          {cat.only_in_stock && ` · Solo con stock${cat.warehouses?.name ? ` (${cat.warehouses.name})` : ''}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Toggle checked={cat.is_active} onChange={() => toggleActive(cat)} />
                        <Button variant="ghost" size="sm" onClick={() => remove(cat)} aria-label="Eliminar">
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <code className="flex-1 min-w-0 truncate text-xs bg-[var(--surface2)] rounded px-2 py-1.5 text-[var(--text2)]">
                        {catalogUrl(cat.slug)}
                      </code>
                      <Button variant="secondary" size="sm" onClick={() => copyLink(cat.slug)}>
                        <Copy size={14} /> Copiar
                      </Button>
                      <a href={catalogUrl(cat.slug)} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="sm" aria-label="Abrir"><ExternalLink size={15} /></Button>
                      </a>
                    </div>
                    <label className="flex items-center justify-between gap-2 pt-1 cursor-pointer">
                      <span className="text-xs text-[var(--text2)]">
                        Recibir pedidos online
                        {cat.accept_orders && <Badge variant="success" className="ml-2">Activo</Badge>}
                      </span>
                      <Toggle checked={cat.accept_orders} onChange={() => toggleAcceptOrders(cat)} />
                    </label>
                  </div>
                ))}
              </div>
            )}

            {/* Form nuevo catálogo */}
            {showForm ? (
              <div className="rounded-lg border border-[var(--border)] p-3 space-y-3">
                <Input
                  label="Nombre del catálogo"
                  placeholder="Ej. Lista Mayorista Julio"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                />
                <Select
                  label="Lista de precio"
                  options={listOptions}
                  value={form.price_list_id}
                  onChange={e => setForm({ ...form, price_list_id: e.target.value })}
                />
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-[var(--text)]">Solo productos con stock</div>
                    <div className="text-xs text-[var(--text2)]">Si está apagado, muestra todo lo que vendés</div>
                  </div>
                  <Toggle checked={form.only_in_stock} onChange={v => setForm({ ...form, only_in_stock: v })} />
                </div>
                {form.only_in_stock && (
                  <Select
                    label="Depósito para el stock"
                    options={warehouseOptions}
                    value={form.warehouse_id}
                    onChange={e => setForm({ ...form, warehouse_id: e.target.value })}
                  />
                )}
                <div className="flex items-center justify-between">
                  <div className="pr-3">
                    <div className="text-sm font-medium text-[var(--text)]">Recibir pedidos online</div>
                    <div className="text-xs text-[var(--text2)]">El cliente puede enviar el pedido y entra a Pedidos como pendiente</div>
                  </div>
                  <Toggle checked={form.accept_orders} onChange={v => setForm({ ...form, accept_orders: v })} />
                </div>
                <Input
                  label="WhatsApp para recibir pedidos (opcional)"
                  placeholder="Ej. 5493401555123"
                  value={form.whatsapp_phone}
                  onChange={e => setForm({ ...form, whatsapp_phone: e.target.value })}
                />
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="secondary" onClick={() => setShowForm(false)} disabled={creating}>Cancelar</Button>
                  <Button onClick={handleCreate} loading={creating}><Link2 size={15} /> Generar link</Button>
                </div>
              </div>
            ) : (
              <Button variant="secondary" onClick={() => setShowForm(true)} className="w-full">
                <Plus size={15} /> Nuevo catálogo
              </Button>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
