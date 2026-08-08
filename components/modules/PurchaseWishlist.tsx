'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoader } from '@/components/ui/Spinner'
import { api } from '@/lib/api'
import { useDebounce } from '@/hooks/useDebounce'
import type { Product } from '@/types'
import { Plus, ShoppingCart, Trash2, Link2, X, Check, StickyNote, Info } from 'lucide-react'
import { toast } from 'sonner'

// Ítem de la lista de compras (respuesta del backend con joins).
interface WishlistItem {
  id:          string
  text:        string
  product_id:  string | null
  supplier_id: string | null
  quantity:    number | null
  note:        string | null
  is_done:     boolean
  created_at:  string
  product:  { id: string; name: string; sku?: string; barcode?: string } | null
  supplier: { id: string; name: string } | null
}

interface Props {
  // Convertir los ítems (vinculados a producto) seleccionados en una orden de compra.
  onCreateOrder: (items: { product: Product; quantity?: number }[], wishlistIds: string[]) => void
}

export function PurchaseWishlist({ onCreateOrder }: Props) {
  const [items, setItems]     = useState<WishlistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // ── Alta rápida ────────────────────────────────────────
  const [text, setText]   = useState('')
  const [adding, setAdding] = useState(false)
  // Producto sugerido a vincular mientras se escribe.
  const [linkProduct, setLinkProduct] = useState<Product | null>(null)
  const [suggestions, setSuggestions] = useState<Product[]>([])
  const [showSug, setShowSug] = useState(false)
  const [activeSug, setActiveSug] = useState(-1)  // índice resaltado para navegar con flechas
  const debouncedText = useDebounce(text.trim(), 250)

  const fetchItems = useCallback(async () => {
    try {
      const data = await api.get<WishlistItem[]>('/api/purchases/wishlist')
      setItems(data)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])

  // Sugerencias de productos para vincular (no obliga: es opcional).
  useEffect(() => {
    if (!debouncedText || linkProduct) { setSuggestions([]); return }
    let cancelled = false
    api.get<{ data: Product[] }>('/api/products', { search: debouncedText, limit: 5 })
      .then(res => { if (!cancelled) { setSuggestions(res.data); setActiveSug(-1) } })
      .catch(() => { if (!cancelled) setSuggestions([]) })
    return () => { cancelled = true }
  }, [debouncedText, linkProduct])

  const addItem = async () => {
    const value = text.trim()
    if (!value && !linkProduct) return
    setAdding(true)
    try {
      const created = await api.post<WishlistItem>('/api/purchases/wishlist', {
        text: linkProduct ? linkProduct.name : value,
        product_id: linkProduct?.id ?? null,
      })
      setItems(prev => [created, ...prev])
      setText(''); setLinkProduct(null); setSuggestions([]); setShowSug(false)
    } catch { toast.error('No se pudo agregar') }
    finally { setAdding(false) }
  }

  // Patch optimista de un campo del ítem.
  const patchItem = async (id: string, patch: Partial<WishlistItem>) => {
    setItems(prev => prev.map(i => (i.id === id ? { ...i, ...patch } : i)))
    try { await api.patch(`/api/purchases/wishlist/${id}`, patch) }
    catch { toast.error('No se pudo guardar'); fetchItems() }
  }

  const removeItem = async (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id))
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n })
    try { await api.delete(`/api/purchases/wishlist/${id}`) }
    catch { toast.error('No se pudo eliminar'); fetchItems() }
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  // Ítems seleccionados que están vinculados a un producto (los convertibles).
  const selectedItems   = items.filter(i => selected.has(i.id))
  const linkedSelected  = selectedItems.filter(i => i.product_id && i.product)
  const unlinkedCount   = selectedItems.length - linkedSelected.length

  const createOrder = () => {
    if (linkedSelected.length === 0) {
      toast.error('Vinculá un producto a los ítems para convertirlos en orden')
      return
    }
    onCreateOrder(
      linkedSelected.map(i => ({
        // El join trae id/name/sku/barcode; alcanza para la línea de orden.
        product: { id: i.product!.id, name: i.product!.name, sku: i.product!.sku, barcode: i.product!.barcode } as Product,
        quantity: i.quantity ?? undefined,
      })),
      linkedSelected.map(i => i.id),
    )
  }

  const markDone = async () => {
    const ids = selectedItems.map(i => i.id)
    setItems(prev => prev.map(i => (selected.has(i.id) ? { ...i, is_done: true } : i)))
    setSelected(new Set())
    try { await api.post('/api/purchases/wishlist/mark-done', { ids }) }
    catch { toast.error('No se pudo marcar'); fetchItems() }
  }

  const pending = items.filter(i => !i.is_done)
  const done    = items.filter(i => i.is_done)

  if (loading) return <PageLoader />

  return (
    <div className="space-y-3 max-w-3xl">
      {/* Alta rápida — mismo patrón que el buscador del resto de la app:
          el input es la barra redondeada; su propio borde se pone accent al focus. */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Plus size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)] pointer-events-none" />
          <input
            value={linkProduct ? linkProduct.name : text}
            onChange={e => { setText(e.target.value); setLinkProduct(null); setShowSug(true) }}
            onFocus={() => setShowSug(true)}
            onKeyDown={e => {
              const sugOpen = showSug && suggestions.length > 0 && !linkProduct
              if (e.key === 'ArrowDown' && sugOpen) {
                e.preventDefault()
                setActiveSug(i => (i + 1) % suggestions.length)
              } else if (e.key === 'ArrowUp' && sugOpen) {
                e.preventDefault()
                setActiveSug(i => (i <= 0 ? suggestions.length - 1 : i - 1))
              } else if (e.key === 'Escape' && sugOpen) {
                e.preventDefault()
                setShowSug(false)
              } else if (e.key === 'Enter') {
                e.preventDefault()
                // Si hay una sugerencia resaltada, la vincula; si no, agrega el texto.
                if (sugOpen && activeSug >= 0) { setLinkProduct(suggestions[activeSug]); setShowSug(false) }
                else addItem()
              }
            }}
            placeholder="Anotá algo que tenés que comprar y presioná Enter…"
            disabled={adding}
            className={`w-full pl-9 ${linkProduct ? 'pr-24' : 'pr-3'} py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)]`}
          />
          {linkProduct && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs text-[var(--accent)] bg-[var(--accent-subtle)] px-2 py-0.5 rounded-full">
              <Link2 size={11} /> producto
              <button onClick={() => { setLinkProduct(null); setText('') }} className="hover:opacity-70"><X size={11} /></button>
            </span>
          )}

          {/* Sugerencias para vincular */}
          {showSug && suggestions.length > 0 && !linkProduct && (
            <div className="absolute z-20 mt-1.5 w-full bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-lg overflow-hidden">
              <p className="px-3 py-1.5 text-[11px] text-[var(--text3)] border-b border-[var(--border)]">Vincular a un producto (opcional)</p>
              {suggestions.map((p, idx) => (
                <button
                  key={p.id}
                  onClick={() => { setLinkProduct(p); setShowSug(false) }}
                  onMouseEnter={() => setActiveSug(idx)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left border-b border-[var(--border)] last:border-0 ${idx === activeSug ? 'bg-[var(--surface2)]' : ''}`}
                >
                  <span className="text-sm text-[var(--text)] truncate">{p.name}</span>
                  {p.sku && <span className="text-xs mono text-[var(--text3)] shrink-0">{p.sku}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <Button onClick={addItem} disabled={adding || (!text.trim() && !linkProduct)}>Agregar</Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="Tu lista está vacía"
          description="Anotá acá lo que tenés que comprar. Después vinculás un producto y lo convertís en una orden con un click."
        />
      ) : (
        <>
          {/* Pendientes */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden divide-y divide-[var(--border)]">
            {pending.map(item => (
              <WishlistRow
                key={item.id}
                item={item}
                selected={selected.has(item.id)}
                onToggle={() => toggleSelect(item.id)}
                onQty={q => patchItem(item.id, { quantity: q })}
                onNote={n => patchItem(item.id, { note: n })}
                onLink={p => patchItem(item.id, {
                  product_id: p ? p.id : null,
                  product: p ? { id: p.id, name: p.name, sku: p.sku, barcode: p.barcode } : null,
                })}
                onDelete={() => removeItem(item.id)}
              />
            ))}
            {pending.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-[var(--text3)]">No hay ítems pendientes 🎉</p>
            )}
          </div>

          {/* Comprados */}
          {done.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer text-xs text-[var(--text3)] px-1 py-2 select-none">
                Comprados ({done.length})
              </summary>
              <div className="mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden divide-y divide-[var(--border)]">
                {done.map(item => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                    <Check size={15} className="text-[var(--accent)] shrink-0" />
                    <span className="flex-1 text-sm text-[var(--text3)] line-through">{item.text}</span>
                    <button
                      onClick={() => patchItem(item.id, { is_done: false })}
                      className="text-xs text-[var(--text3)] hover:text-[var(--text)]"
                    >
                      Reactivar
                    </button>
                    <button onClick={() => removeItem(item.id)} className="text-[var(--text3)] hover:text-[var(--danger)]">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      )}

      {/* Barra de acciones (sticky) */}
      {selected.size > 0 && (
        <div className="sticky bottom-4 z-30 flex flex-col gap-2 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-xl px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-[var(--text2)]">
              {selected.size} seleccionado{selected.size > 1 ? 's' : ''}
              {linkedSelected.length > 0 && (
                <span className="text-[var(--text3)]"> · {linkedSelected.length} con producto</span>
              )}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={markDone}>Marcar comprado</Button>
              <Button onClick={createOrder} disabled={linkedSelected.length === 0}>
                <ShoppingCart size={15} /> Crear orden ({linkedSelected.length})
              </Button>
            </div>
          </div>

          {/* Ayuda: por qué no se puede crear la orden */}
          {linkedSelected.length === 0 ? (
            <p className="flex items-start gap-1.5 text-xs text-[var(--text3)] border-t border-[var(--border)] pt-2">
              <Info size={13} className="shrink-0 mt-0.5" />
              <span>Para crear una orden de compra, cada ítem tiene que estar <strong className="text-[var(--text2)] font-medium">vinculado a un producto</strong> del catálogo. Tocá <Link2 size={11} className="inline -mt-0.5" /> en un ítem para vincularlo. Los ítems de texto libre solo sirven como recordatorio.</span>
            </p>
          ) : unlinkedCount > 0 ? (
            <p className="flex items-start gap-1.5 text-xs text-[var(--text3)] border-t border-[var(--border)] pt-2">
              <Info size={13} className="shrink-0 mt-0.5" />
              <span>Se crearán {linkedSelected.length} línea{linkedSelected.length > 1 ? 's' : ''} de orden. Los {unlinkedCount} ítem{unlinkedCount > 1 ? 's' : ''} sin producto quedarán en la lista (vinculá un producto para incluirlos).</span>
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}

// ── Fila editable inline ─────────────────────────────────
function WishlistRow({
  item, selected, onToggle, onQty, onNote, onLink, onDelete,
}: {
  item: WishlistItem
  selected: boolean
  onToggle: () => void
  onQty: (q: number | null) => void
  onNote: (n: string | null) => void
  onLink: (p: Product | null) => void
  onDelete: () => void
}) {
  const [editNote, setEditNote] = useState(false)
  const [noteDraft, setNoteDraft] = useState(item.note ?? '')
  const noteRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editNote) noteRef.current?.focus() }, [editNote])

  // Linker de producto inline
  const [linking, setLinking]   = useState(false)
  const [linkQuery, setLinkQuery] = useState('')
  const [linkResults, setLinkResults] = useState<Product[]>([])
  const [activeLink, setActiveLink] = useState(-1)  // índice resaltado para flechas
  const linkRef = useRef<HTMLInputElement>(null)
  const debouncedLink = useDebounce(linkQuery.trim(), 250)
  useEffect(() => { if (linking) linkRef.current?.focus() }, [linking])
  useEffect(() => {
    if (!linking || !debouncedLink) { setLinkResults([]); setActiveLink(-1); return }
    let cancelled = false
    api.get<{ data: Product[] }>('/api/products', { search: debouncedLink, limit: 5 })
      .then(res => { if (!cancelled) { setLinkResults(res.data); setActiveLink(-1) } })
      .catch(() => { if (!cancelled) setLinkResults([]) })
    return () => { cancelled = true }
  }, [linking, debouncedLink])

  const saveNote = () => {
    setEditNote(false)
    const v = noteDraft.trim()
    if (v !== (item.note ?? '')) onNote(v || null)
  }

  return (
    <div className="px-3 sm:px-4 py-2.5 hover:bg-[var(--surface2)] transition-colors">
      {/* Línea principal: una sola fila, siempre alineada */}
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="w-[18px] h-[18px] rounded accent-[var(--accent)] shrink-0 cursor-pointer focus-visible:outline-none"
        />

        <span className="flex-1 min-w-0 truncate text-sm text-[var(--text)]" title={item.text}>{item.text}</span>

        {/* Cantidad */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs text-[var(--text3)]">x</span>
          <input
            type="text"
            inputMode="numeric"
            value={item.quantity ?? ''}
            onChange={e => {
              const v = e.target.value.replace(/\D/g, '')
              onQty(v ? parseInt(v, 10) : null)
            }}
            placeholder="—"
            className="w-11 text-sm text-center bg-[var(--surface2)] border border-[var(--border)] rounded-[var(--radius-md)] py-1 text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus-visible:outline-none focus:border-[var(--accent)]"
          />
        </div>

        {/* Acciones — siempre visibles (clave en mobile) */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => setLinking(v => !v)}
            title={item.product ? 'Cambiar producto vinculado' : 'Vincular a un producto'}
            className={`p-2 rounded-[var(--radius-md)] transition-colors focus-visible:outline-none ${
              item.product || linking
                ? 'text-[var(--accent)] hover:bg-[var(--accent-subtle)]'
                : 'text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface3)]'
            }`}
          >
            <Link2 size={16} />
          </button>
          <button
            onClick={() => setEditNote(v => !v)}
            title={item.note ? 'Editar nota' : 'Agregar nota'}
            className={`p-2 rounded-[var(--radius-md)] transition-colors focus-visible:outline-none ${
              item.note || editNote
                ? 'text-[var(--accent)] hover:bg-[var(--accent-subtle)]'
                : 'text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface3)]'
            }`}
          >
            <StickyNote size={16} />
          </button>
          <button
            onClick={onDelete}
            title="Eliminar"
            className="p-2 rounded-[var(--radius-md)] text-[var(--text3)] hover:text-[var(--danger)] hover:bg-[var(--danger-subtle)] transition-colors focus-visible:outline-none"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Subtítulos indentados bajo el nombre (alineados con el texto) */}
      <div className="pl-[30px] pr-1 empty:hidden">
        {/* Producto vinculado */}
        {item.product && !linking && (
          <div className="mt-1 flex items-center gap-1.5 min-w-0">
            <span className="flex items-center gap-1 text-[11px] text-[var(--accent)] bg-[var(--accent-subtle)] px-1.5 py-0.5 rounded-full max-w-full min-w-0">
              <Link2 size={10} className="shrink-0" />
              <span className="truncate">{item.product.name}</span>
            </span>
            <button onClick={() => onLink(null)} title="Desvincular" className="text-[var(--text3)] hover:text-[var(--danger)] shrink-0 focus-visible:outline-none">
              <X size={12} />
            </button>
          </div>
        )}

        {/* Buscador de producto para vincular */}
        {linking && (
          <div className="relative mt-1.5">
            <input
              ref={linkRef}
              value={linkQuery}
              onChange={e => setLinkQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'ArrowDown' && linkResults.length) {
                  e.preventDefault(); setActiveLink(i => (i + 1) % linkResults.length)
                } else if (e.key === 'ArrowUp' && linkResults.length) {
                  e.preventDefault(); setActiveLink(i => (i <= 0 ? linkResults.length - 1 : i - 1))
                } else if (e.key === 'Enter' && activeLink >= 0 && linkResults[activeLink]) {
                  e.preventDefault(); onLink(linkResults[activeLink]); setLinking(false); setLinkQuery('')
                } else if (e.key === 'Escape') {
                  e.preventDefault(); setLinking(false); setLinkQuery('')
                }
              }}
              placeholder="Buscar producto del catálogo…"
              className="w-full text-sm px-3 py-1.5 rounded-[var(--radius-md)] bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)]"
            />
            {linkResults.length > 0 && (
              <div className="absolute z-20 mt-1 w-full bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-lg overflow-hidden">
                {linkResults.map((p, idx) => (
                  <button
                    key={p.id}
                    onClick={() => { onLink(p); setLinking(false); setLinkQuery('') }}
                    onMouseEnter={() => setActiveLink(idx)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left border-b border-[var(--border)] last:border-0 ${idx === activeLink ? 'bg-[var(--surface2)]' : ''}`}
                  >
                    <span className="text-sm text-[var(--text)] truncate">{p.name}</span>
                    {p.sku && <span className="text-xs mono text-[var(--text3)] shrink-0">{p.sku}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Nota */}
        {editNote ? (
          <input
            ref={noteRef}
            value={noteDraft}
            onChange={e => setNoteDraft(e.target.value)}
            onBlur={saveNote}
            onKeyDown={e => { if (e.key === 'Enter') saveNote(); if (e.key === 'Escape') { setNoteDraft(item.note ?? ''); setEditNote(false) } }}
            placeholder="Nota…"
            className="mt-1.5 w-full text-xs bg-transparent text-[var(--text2)] placeholder:text-[var(--text3)] focus:outline-none focus-visible:outline-none border-b border-[var(--border)] focus:border-[var(--accent)] pb-0.5"
          />
        ) : item.note ? (
          <button onClick={() => setEditNote(true)} className="mt-1 block w-full text-xs text-[var(--text3)] hover:text-[var(--text2)] text-left truncate">{item.note}</button>
        ) : null}
      </div>
    </div>
  )
}
