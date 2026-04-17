'use client'
import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { Printer, Search, ChevronLeft, ChevronRight, Tag } from 'lucide-react'
import type { Category } from '@/types'
import type { PriceList } from '@/app/price-lists/page'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Brand { id: string; name: string }

interface ProductRow {
  id: string
  name: string
  sku?: string
  barcode?: string
  sell_price: number
  cost_price: number
  use_fixed_sell_price: boolean
  category_id: string | null
  category_name: string | null
  updated_at: string
  product_barcodes?: { barcode: string }[]
}

interface CategoryWithChildren extends Category { children: CategoryWithChildren[] }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildCategoryTree(cats: Category[]): CategoryWithChildren[] {
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

function getAllDescendantIds(tree: CategoryWithChildren[], rootId: string): Set<string> {
  const result = new Set<string>()
  function collect(node: CategoryWithChildren) {
    result.add(node.id)
    node.children.forEach(collect)
  }
  const root = tree.find(c => c.id === rootId)
  if (root) collect(root)
  return result
}

function getListPrice(product: ProductRow, list: PriceList): number {
  if (product.use_fixed_sell_price) return product.sell_price
  return product.cost_price * (1 + list.margin_pct / 100)
}

function getProductCode(p: ProductRow): string {
  return p.barcode || p.product_barcodes?.[0]?.barcode || p.sku || ''
}

function formatPrice(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-AR')
}

const LABELS_PER_PAGE = 15

const selectClass =
  'w-full px-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] appearance-none'

// ─── PriceLabel — reutilizable para preview y para print ──────────────────────

interface LabelProps {
  product: ProductRow
  mainList: PriceList
  otherLists: PriceList[]      // ya ordenadas por min_quantity, sin mainList
  showCode: boolean
  showTiers: boolean
}

export function PriceLabel({ product, mainList, otherLists, showCode, showTiers }: LabelProps) {
  const isFixed = product.use_fixed_sell_price
  const mainPrice = getListPrice(product, mainList)
  const code = getProductCode(product)
  const visibleTiers = (!isFixed && showTiers) ? otherLists : []

  return (
    <div className="label-card">
      {/* Nombre */}
      <p className="label-name">{product.name}</p>

      {/* Precio principal */}
      <div className="label-price-block">
        <p className="label-price">{formatPrice(mainPrice)}</p>
        {!isFixed && (
          <p className="label-from">
            desde {mainList.min_quantity === 1 ? '1 unidad' : `${mainList.min_quantity} unidades`}
          </p>
        )}
      </div>

      {/* Escalas */}
      {visibleTiers.length > 0 && (
        <div className="label-tiers">
          {visibleTiers.map(l => (
            <span key={l.id} className="label-tier">
              {l.min_quantity}u: {formatPrice(getListPrice(product, l))}
            </span>
          ))}
        </div>
      )}

      {/* Código numérico */}
      {showCode && code && (
        <p className="label-code">{code}</p>
      )}
    </div>
  )
}

// ─── Modal principal ──────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
}

type Step = 'config' | 'select' | 'preview'

export function PrintShelfLabelsModal({ open, onClose }: Props) {
  const [step, setStep] = useState<Step>('config')

  // Datos
  const [categories, setCategories] = useState<Category[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [priceLists, setPriceLists] = useState<PriceList[]>([])

  // Filtros paso 1
  const [mainListId, setMainListId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [brandId, setBrandId] = useState('')
  const [recentDays, setRecentDays] = useState('0')
  const [showCode, setShowCode] = useState(false)
  const [showTiers, setShowTiers] = useState(true)
  const [copies, setCopies] = useState(1)

  // Productos
  const [allProducts, setAllProducts] = useState<ProductRow[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [searchText, setSearchText] = useState('')

  // Preview
  const [previewPage, setPreviewPage] = useState(1)

  // Reset al cerrar
  useEffect(() => {
    if (!open) {
      setStep('config')
      setMainListId(''); setCategoryId(''); setBrandId(''); setRecentDays('0')
      setShowCode(false); setShowTiers(true); setCopies(1)
      setAllProducts([]); setSelected(new Set()); setSearchText('')
      setPreviewPage(1)
      return
    }
    Promise.all([
      api.get<Category[]>('/api/products/categories'),
      api.get<Brand[]>('/api/brands'),
      api.get<PriceList[]>('/api/price-lists'),
    ]).then(([cats, brnds, lists]) => {
      setCategories(cats)
      setBrands(brnds)
      const active = lists.filter(l => l.is_active)
      setPriceLists(active)
      const def = active.find(l => l.is_default) ?? active[0]
      if (def) setMainListId(def.id)
    }).catch(() => {})
  }, [open])

  const catTree = buildCategoryTree(categories)

  // Cargar productos
  const handleLoadProducts = async () => {
    setLoadingProducts(true)
    try {
      const params: Record<string, string | number> = { limit: 500, page: 1 }
      if (brandId) params.brand_id = brandId

      const res = await api.get<{ data: ProductRow[] }>('/api/products', params)
      let filtered = res.data

      if (categoryId) {
        const ids = getAllDescendantIds(catTree, categoryId)
        filtered = filtered.filter(p => p.category_id && ids.has(p.category_id))
      }

      if (recentDays !== '0') {
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - Number(recentDays))
        filtered = filtered.filter(p => new Date(p.updated_at) >= cutoff)
      }

      setAllProducts(filtered)
      setSelected(new Set(filtered.map(p => p.id)))
      setStep('select')
    } catch { } finally { setLoadingProducts(false) }
  }

  // Productos visibles en lista (con búsqueda)
  const visibleProducts = allProducts.filter(p => {
    if (!searchText.trim()) return true
    const q = searchText.toLowerCase()
    return p.name.toLowerCase().includes(q) || (p.sku?.toLowerCase().includes(q) ?? false)
  })

  const allVisibleSelected = visibleProducts.length > 0 && visibleProducts.every(p => selected.has(p.id))

  const toggleAll = () => {
    if (allVisibleSelected) {
      setSelected(prev => {
        const next = new Set(prev)
        visibleProducts.forEach(p => next.delete(p.id))
        return next
      })
    } else {
      setSelected(prev => new Set([...prev, ...visibleProducts.map(p => p.id)]))
    }
  }

  const toggleProduct = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  // Datos derivados para las etiquetas
  const mainList = priceLists.find(l => l.id === mainListId)
  const otherLists = [...priceLists]
    .filter(l => l.id !== mainListId)
    .sort((a, b) => a.min_quantity - b.min_quantity)

  const selectedProducts = allProducts.filter(p => selected.has(p.id))
  const labelItems: ProductRow[] = selectedProducts.flatMap(p => Array(copies).fill(p))
  const totalPages = Math.max(1, Math.ceil(labelItems.length / LABELS_PER_PAGE))
  const pageItems = labelItems.slice((previewPage - 1) * LABELS_PER_PAGE, previewPage * LABELS_PER_PAGE)

  // ─── Print ────────────────────────────────────────────────────────────────

  const handlePrint = () => {
    if (!mainList) return

    const labelsHtml = labelItems.map(p => {
      const isFixed = p.use_fixed_sell_price
      const mainPrice = getListPrice(p, mainList)
      const code = getProductCode(p)
      const tiers = (!isFixed && showTiers)
        ? otherLists.map(l =>
          `<span class="tier">${l.min_quantity}u: ${formatPrice(getListPrice(p, l))}</span>`
        ).join('')
        : ''

      return `
        <div class="label">
          <p class="lname">${p.name}</p>
          <div class="lprice-block">
            <p class="lprice">${formatPrice(mainPrice)}</p>
            ${!isFixed ? `<p class="lfrom">desde ${mainList.min_quantity === 1 ? '1 unidad' : `${mainList.min_quantity} unidades`}</p>` : ''}
          </div>
          ${tiers ? `<div class="ltiers">${tiers}</div>` : ''}
          ${showCode && code ? `<p class="lcode">${code}</p>` : ''}
        </div>
      `
    }).join('')

    const win = window.open('', '_blank', 'width=900,height=1100')
    if (!win) return

    win.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Etiquetas de precios</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    @page {
      size: A4 portrait;
      margin: 10mm;
    }

    body {
      font-family: Arial, Helvetica, sans-serif;
      background: white;
      color: #111;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 4mm;
    }

    .label {
      border: 1.5px solid #222;
      border-radius: 2mm;
      padding: 5mm 5mm 4mm;
      min-height: 50mm;
      display: flex;
      flex-direction: column;
      gap: 2mm;
      page-break-inside: avoid;
      break-inside: avoid;
      overflow: hidden;
    }

    .lname {
      font-size: 11pt;
      font-weight: 700;
      line-height: 1.25;
      color: #111;
      word-break: break-word;
    }

    .lprice-block {
      margin-top: auto;
    }

    .lprice {
      font-size: 30pt;
      font-weight: 900;
      color: #111;
      line-height: 1;
      letter-spacing: -0.5pt;
    }

    .lfrom {
      font-size: 8pt;
      color: #444;
      margin-top: 1mm;
    }

    .ltiers {
      display: flex;
      flex-wrap: wrap;
      gap: 1.5mm;
      border-top: 0.5pt solid #ddd;
      padding-top: 2mm;
      margin-top: auto;
    }

    .tier {
      font-size: 8pt;
      font-weight: 600;
      color: #333;
      white-space: nowrap;
    }

    .tier:not(:last-child)::after {
      content: ' ·';
      color: #999;
    }

    .lcode {
      font-size: 8pt;
      font-family: 'Courier New', monospace;
      color: #888;
      border-top: 0.5pt solid #eee;
      padding-top: 1.5mm;
      margin-top: auto;
      word-break: break-all;
    }

    @media screen {
      body { background: #e5e7eb; padding: 20px; }
      .grid { max-width: 794px; margin: 0 auto; background: white; padding: 10mm; }
    }
  </style>
</head>
<body>
  <div class="grid">${labelsHtml}</div>
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 300);
    }
  </script>
</body>
</html>`)
    win.document.close()
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const stepTitle: Record<Step, string> = {
    config: 'Imprimir etiquetas de precio',
    select: 'Seleccionar productos',
    preview: 'Vista previa de impresión',
  }

  return (
    <Modal open={open} onClose={onClose} title={stepTitle[step]} size={step === 'preview' ? 'xl' : 'md'}>
      {/* ── PASO 1: Configurar ─────────────────────────────────────────────── */}
      {step === 'config' && (
        <div className="space-y-5 pb-6">

          {/* Lista principal */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--text2)]">Lista de precio a mostrar</label>
            <div className="relative">
              <select value={mainListId} onChange={e => setMainListId(e.target.value)} className={selectClass}>
                {priceLists.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.name} — {l.margin_pct > 0 ? '+' : ''}{l.margin_pct}% · desde {l.min_quantity} {l.min_quantity === 1 ? 'unidad' : 'unidades'}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-[var(--text3)]">Este es el precio grande que aparece en la etiqueta</p>
          </div>

          {/* Filtros */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[var(--text2)]">Categoría</label>
              <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={selectClass}>
                <option value="">Todas</option>
                {catTree.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[var(--text2)]">Marca</label>
              <select value={brandId} onChange={e => setBrandId(e.target.value)} className={selectClass}>
                <option value="">Todas</option>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[var(--text2)]">Precio actualizado</label>
              <select value={recentDays} onChange={e => setRecentDays(e.target.value)} className={selectClass}>
                <option value="0">Todos los productos</option>
                <option value="7">Últimos 7 días</option>
                <option value="15">Últimos 15 días</option>
                <option value="30">Últimos 30 días</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[var(--text2)]">Copias por producto</label>
              <input
                type="number"
                min={1}
                max={10}
                value={copies}
                onChange={e => setCopies(Math.max(1, Math.min(10, Number(e.target.value))))}
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
          </div>

          {/* Opciones etiqueta */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[var(--text2)]">Contenido de la etiqueta</label>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm text-[var(--text2)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={showTiers}
                  onChange={e => setShowTiers(e.target.checked)}
                  className="w-4 h-4 accent-[var(--accent)]"
                />
                Mostrar escalas de precio (otras listas activas)
              </label>
              <label className="flex items-center gap-2 text-sm text-[var(--text2)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={showCode}
                  onChange={e => setShowCode(e.target.checked)}
                  className="w-4 h-4 accent-[var(--accent)]"
                />
                Mostrar código numérico (barcode / SKU)
              </label>
            </div>
          </div>

          <div className="pt-2 border-t border-[var(--border)]">
            <Button
              className="w-full"
              onClick={handleLoadProducts}
              loading={loadingProducts}
              disabled={!mainListId}
            >
              <Tag size={14} /> Cargar productos
            </Button>
          </div>
        </div>
      )}

      {/* ── PASO 2: Seleccionar productos ──────────────────────────────────── */}
      {step === 'select' && (
        <div className="space-y-4 pb-6">
          <button
            onClick={() => setStep('config')}
            className="flex items-center gap-1.5 text-sm text-[var(--text2)] hover:text-[var(--text)] transition-colors"
          >
            <ChevronLeft size={15} /> Cambiar filtros
          </button>

          {/* Búsqueda */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)] pointer-events-none" size={14} />
            <input
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="Buscar producto..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          {/* Seleccionar todos */}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm font-medium text-[var(--text2)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleAll}
                className="w-4 h-4 accent-[var(--accent)]"
              />
              Seleccionar todos ({visibleProducts.length})
            </label>
            <span className="text-xs text-[var(--text3)]">
              {selected.size} seleccionados · {selected.size * copies} etiquetas
            </span>
          </div>

          {/* Lista de productos */}
          <div className="max-h-72 overflow-y-auto border border-[var(--border)] rounded-[var(--radius-md)] divide-y divide-[var(--border)]">
            {visibleProducts.map(p => {
              const price = mainList ? getListPrice(p, mainList) : p.sell_price
              const code = getProductCode(p)
              return (
                <label
                  key={p.id}
                  className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-[var(--surface2)] transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggleProduct(p.id)}
                    className="w-4 h-4 accent-[var(--accent)] flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text)] truncate">{p.name}</p>
                    {code && (
                      <p className="text-xs text-[var(--text3)] mono">{code}</p>
                    )}
                  </div>
                  <span className="text-sm font-semibold mono text-[var(--text)] flex-shrink-0">
                    {formatPrice(price)}
                  </span>
                </label>
              )
            })}
            {visibleProducts.length === 0 && (
              <p className="text-sm text-center text-[var(--text3)] py-8">Sin productos</p>
            )}
          </div>

          <Button
            className="w-full"
            onClick={() => { setPreviewPage(1); setStep('preview') }}
            disabled={selected.size === 0}
          >
            Vista previa ({selected.size * copies} etiquetas)
          </Button>
        </div>
      )}

      {/* ── PASO 3: Vista previa ───────────────────────────────────────────── */}
      {step === 'preview' && mainList && (
        <div className="space-y-4 pb-6">
          {/* Nav */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setStep('select')}
              className="flex items-center gap-1.5 text-sm text-[var(--text2)] hover:text-[var(--text)] transition-colors"
            >
              <ChevronLeft size={15} /> Volver
            </button>
            <span className="text-xs text-[var(--text3)]">
              Pág. {previewPage}/{totalPages} · {labelItems.length} etiquetas
            </span>
          </div>

          {/* Grid de etiquetas */}
          <div className="grid grid-cols-3 gap-2 p-3 bg-gray-100 rounded-[var(--radius-lg)]">
            {pageItems.map((p, i) => {
              const isFixed = p.use_fixed_sell_price
              const mainPrice = getListPrice(p, mainList)
              const code = getProductCode(p)
              const visibleTiers = (!isFixed && showTiers) ? otherLists : []

              return (
                <div
                  key={`${p.id}-${i}`}
                  className="bg-white border border-gray-300 rounded p-3 flex flex-col gap-1.5"
                  style={{ minHeight: 140 }}
                >
                  {/* Nombre */}
                  <p className="text-[11px] font-bold text-gray-900 leading-tight line-clamp-3">
                    {p.name}
                  </p>

                  {/* Precio */}
                  <div className="mt-auto">
                    <p className="text-[26px] font-black text-gray-900 leading-none tracking-tight">
                      {formatPrice(mainPrice)}
                    </p>
                    {!isFixed && (
                      <p className="text-[9px] text-gray-500 mt-0.5">
                        desde {mainList.min_quantity === 1 ? '1 unidad' : `${mainList.min_quantity} unidades`}
                      </p>
                    )}
                  </div>

                  {/* Escalas */}
                  {visibleTiers.length > 0 && (
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5 border-t border-gray-100 pt-1.5 mt-0.5">
                      {visibleTiers.map(l => (
                        <span key={l.id} className="text-[9px] font-semibold text-gray-600 whitespace-nowrap">
                          {l.min_quantity}u: {formatPrice(getListPrice(p, l))}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Código */}
                  {showCode && code && (
                    <p className="text-[8px] text-gray-400 font-mono border-t border-gray-100 pt-1 mt-auto break-all">
                      {code}
                    </p>
                  )}
                </div>
              )
            })}

            {/* Celdas vacías para completar la grilla */}
            {Array(LABELS_PER_PAGE - pageItems.length).fill(null).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="border border-dashed border-gray-200 rounded"
                style={{ minHeight: 140 }}
              />
            ))}
          </div>

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => setPreviewPage(p => Math.max(1, p - 1))}
                disabled={previewPage === 1}
                className="p-1.5 rounded text-[var(--text2)] hover:bg-[var(--surface2)] disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm text-[var(--text2)]">{previewPage} / {totalPages}</span>
              <button
                onClick={() => setPreviewPage(p => Math.min(totalPages, p + 1))}
                disabled={previewPage === totalPages}
                className="p-1.5 rounded text-[var(--text2)] hover:bg-[var(--surface2)] disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          {/* Imprimir */}
          <div className="border-t border-[var(--border)] pt-4">
            <Button className="w-full" onClick={handlePrint}>
              <Printer size={14} /> Imprimir / Exportar PDF
            </Button>
            <p className="text-xs text-center text-[var(--text3)] mt-2">
              Para exportar PDF: en el diálogo de impresión elegí "Guardar como PDF"
            </p>
          </div>
        </div>
      )}
    </Modal>
  )
}
