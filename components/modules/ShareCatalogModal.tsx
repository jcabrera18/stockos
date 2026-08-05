'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Toggle } from '@/components/ui/Toggle'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { api } from '@/lib/api'
import { Plus, Copy, Trash2, ExternalLink, Link2, ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import type { PriceList } from '@/app/price-lists/page'

const MAX_BANNERS = 5

interface Banner { id: string; image_url: string; is_active: boolean; sort_order: number }

// Comprime una imagen en el cliente antes de subirla: redimensiona al lado más
// largo <= 1400px y la exporta a WebP. Los flyers tienen texto/precios, así que
// no se apreta de más (calidad 0.82). Devuelve un data URL.
function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const MAX = 1400
      let { width, height } = img
      if (width > MAX || height > MAX) {
        const scale = MAX / Math.max(width, height)
        width = Math.round(width * scale)
        height = Math.round(height * scale)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('no canvas'))
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/webp', 0.82))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('no image')) }
    img.src = url
  })
}

// Gestión de banners (flyers promocionales) de un catálogo: subir, activar/
// desactivar y borrar. La subida va mediada por el backend con compresión previa.
function BannerManager({ catalogId }: { catalogId: string }) {
  const [banners, setBanners] = useState<Banner[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [confirmBanner, setConfirmBanner] = useState<Banner | null>(null)
  const [deleting, setDeleting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await api.get<Banner[]>(`/api/catalogs/${catalogId}/banners`)
        if (!cancelled) setBanners(data)
      } catch {
        if (!cancelled) toast.error('No se pudieron cargar las imágenes')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [catalogId])

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (fileRef.current) fileRef.current.value = '' // permite re-subir el mismo archivo
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Elegí un archivo de imagen'); return }
    if (banners.length >= MAX_BANNERS) { toast.error(`Máximo ${MAX_BANNERS} imágenes`); return }
    setUploading(true)
    try {
      const image = await compressImage(file)
      const created = await api.post<Banner>(`/api/catalogs/${catalogId}/banners`, { image })
      setBanners(prev => [...prev, created])
      toast.success('Imagen agregada')
    } catch {
      toast.error('No se pudo subir la imagen')
    } finally {
      setUploading(false)
    }
  }

  const toggle = async (b: Banner) => {
    try {
      const updated = await api.patch<Banner>(`/api/catalogs/${catalogId}/banners/${b.id}`, { is_active: !b.is_active })
      setBanners(prev => prev.map(x => (x.id === b.id ? { ...x, ...updated } : x)))
    } catch {
      toast.error('No se pudo actualizar')
    }
  }

  const remove = async () => {
    const b = confirmBanner
    if (!b) return
    setDeleting(true)
    try {
      await api.delete(`/api/catalogs/${catalogId}/banners/${b.id}`)
      setBanners(prev => prev.filter(x => x.id !== b.id))
      toast.success('Imagen borrada')
      setConfirmBanner(null)
    } catch {
      toast.error('No se pudo borrar')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="rounded-lg bg-[var(--surface2)] p-3 space-y-3">
      <p className="text-xs text-[var(--text2)]">
        Subí flyers o imágenes de oferta para mostrarlas en un carrusel arriba del catálogo.
        Hasta {MAX_BANNERS} imágenes.
      </p>

      {loading ? (
        <div className="flex justify-center py-4"><Spinner /></div>
      ) : (
        <>
          {banners.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {banners.map(b => (
                <div key={b.id} className="relative group rounded-lg overflow-hidden border border-[var(--border)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={b.image_url}
                    alt=""
                    className={`w-full h-24 object-cover ${b.is_active ? '' : 'opacity-40'}`}
                  />
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/55 px-1.5 py-1">
                    <label className="flex items-center gap-1 cursor-pointer">
                      <Toggle checked={b.is_active} onChange={() => toggle(b)} />
                    </label>
                    <button
                      onClick={() => setConfirmBanner(b)}
                      aria-label="Borrar imagen"
                      className="text-white/90 hover:text-white"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            loading={uploading}
            disabled={banners.length >= MAX_BANNERS}
            onClick={() => fileRef.current?.click()}
          >
            <Plus size={14} /> {banners.length >= MAX_BANNERS ? `Máximo ${MAX_BANNERS} imágenes` : 'Agregar imagen'}
          </Button>
        </>
      )}

      <ConfirmDialog
        open={confirmBanner !== null}
        onClose={() => setConfirmBanner(null)}
        onConfirm={remove}
        title="Borrar imagen"
        message="¿Borrar esta imagen del catálogo? No se puede deshacer."
        confirmLabel="Borrar"
        loading={deleting}
        danger
      />
    </div>
  )
}

interface Catalog {
  id: string
  slug: string
  name: string
  pricing_mode: 'base' | 'list' | 'quantity'
  price_list_id: string | null
  only_in_stock: boolean
  warehouse_id: string | null
  whatsapp_phone: string | null
  accept_orders: boolean
  is_active: boolean
  price_lists?: { name: string } | null
  warehouses?: { name: string } | null
}

// Valor especial del selector de precio para el modo "escalera por cantidad".
const QTY_MODE = '__qty__'

interface WarehouseItem { id: string; name: string }

interface Props {
  open: boolean
  onClose: () => void
  // Listas de precio para el selector. El padre puede pasarlas, pero el modal
  // también las carga por su cuenta al abrir (en /orders llegan lazy y vacías).
  lists?: PriceList[]
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

export function ShareCatalogModal({ open, onClose, lists: listsProp }: Props) {
  const [catalogs, setCatalogs] = useState<Catalog[]>([])
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([])
  const [lists, setLists] = useState<PriceList[]>(listsProp ?? [])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyForm)
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)
  // Catálogo cuyo panel de imágenes está abierto (null = ninguno).
  const [bannersFor, setBannersFor] = useState<string | null>(null)
  // Catálogo pendiente de confirmar borrado (null = ninguno).
  const [confirmCat, setConfirmCat] = useState<Catalog | null>(null)
  const [deletingCat, setDeletingCat] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cats, whs, pls] = await Promise.all([
        api.get<Catalog[]>('/api/catalogs'),
        api.get<WarehouseItem[]>('/api/warehouses').catch(() => [] as WarehouseItem[]),
        api.get<PriceList[]>('/api/price-lists').catch(() => [] as PriceList[]),
      ])
      setCatalogs(cats)
      setWarehouses(whs)
      if (pls.length) setLists(pls)
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
      const sel = form.price_list_id
      const pricing_mode = sel === '' ? 'base' : sel === QTY_MODE ? 'quantity' : 'list'
      const created = await api.post<Catalog>('/api/catalogs', {
        name: form.name.trim(),
        pricing_mode,
        price_list_id: pricing_mode === 'list' ? sel : null,
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

  const remove = async () => {
    const cat = confirmCat
    if (!cat) return
    setDeletingCat(true)
    try {
      await api.delete(`/api/catalogs/${cat.id}`)
      setCatalogs(prev => prev.filter(c => c.id !== cat.id))
      toast.success('Catálogo eliminado')
      setConfirmCat(null)
    } catch {
      toast.error('No se pudo eliminar')
    } finally {
      setDeletingCat(false)
    }
  }

  const copyLink = (slug: string) => {
    navigator.clipboard.writeText(catalogUrl(slug))
      .then(() => toast.success('Link copiado'))
      .catch(() => toast.error('No se pudo copiar'))
  }

  const listOptions = [
    { value: '', label: 'Precio de venta (base)' },
    { value: QTY_MODE, label: 'Automático por cantidad (como el POS)' },
    ...lists.map(l => ({ value: l.id, label: `${l.name} (+${l.margin_pct}%) · precio fijo` })),
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
                          {cat.pricing_mode === 'quantity'
                            ? 'Automático por cantidad'
                            : cat.price_lists?.name ?? 'Precio de venta'}
                          {cat.only_in_stock && ` · Solo con stock${cat.warehouses?.name ? ` (${cat.warehouses.name})` : ''}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Toggle checked={cat.is_active} onChange={() => toggleActive(cat)} />
                        <Button variant="ghost" size="sm" onClick={() => setConfirmCat(cat)} aria-label="Eliminar">
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
                    <label className="flex items-center gap-2 pt-1 cursor-pointer">
                      <Toggle checked={cat.accept_orders} onChange={() => toggleAcceptOrders(cat)} />
                      <span className="text-xs text-[var(--text2)]">
                        Recibir pedidos online
                        {cat.accept_orders && <Badge variant="success" className="ml-2">Activo</Badge>}
                      </span>
                    </label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => setBannersFor(prev => (prev === cat.id ? null : cat.id))}
                    >
                      <ImageIcon size={14} /> {bannersFor === cat.id ? 'Ocultar imágenes' : 'Editar imágenes'}
                    </Button>
                    {bannersFor === cat.id && <BannerManager catalogId={cat.id} />}
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
                <div>
                  <Select
                    label="Precio del catálogo"
                    options={listOptions}
                    value={form.price_list_id}
                    onChange={e => setForm({ ...form, price_list_id: e.target.value })}
                  />
                  <p className="text-xs text-[var(--text2)] mt-1">
                    {form.price_list_id === QTY_MODE
                      ? 'El precio baja al sumar unidades, con las mismas reglas del POS (desde 3u, desde 5u…). Las promociones también se aplican.'
                      : form.price_list_id === ''
                        ? 'Muestra el precio de venta base de cada producto.'
                        : 'Muestra esa lista a precio fijo, sin importar la cantidad.'}
                  </p>
                </div>
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

      <ConfirmDialog
        open={confirmCat !== null}
        onClose={() => setConfirmCat(null)}
        onConfirm={remove}
        title="Eliminar catálogo"
        message={confirmCat ? `¿Eliminar el catálogo "${confirmCat.name}"? El link dejará de funcionar.` : ''}
        confirmLabel="Eliminar"
        loading={deletingCat}
        danger
      />
    </Modal>
  )
}
