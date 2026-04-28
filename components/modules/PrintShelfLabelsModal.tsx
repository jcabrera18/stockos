'use client'
import { useEffect, useRef, useState } from 'react'
import JsBarcode from 'jsbarcode'
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

function qtyLabel(qty: number): string {
  return qty === 1 ? '1 unidad' : `x${qty} unidades`
}

function calcSaving(mainPrice: number, tierPrice: number): { pct: number; amount: number } {
  if (mainPrice <= 0 || tierPrice >= mainPrice) return { pct: 0, amount: 0 }
  const amount = Math.round(mainPrice - tierPrice)
  const pct = Math.round((amount / mainPrice) * 100)
  return { pct, amount }
}

// ─── Barcode helpers ──────────────────────────────────────────────────────────

const BARCODE_OPTS = {
  format: 'CODE128' as const,
  displayValue: false,
  margin: 2,
  width: 1.2,
  height: 38,
  background: 'transparent',
  lineColor: '#111',
}

function generateBarcodeSVG(code: string): string {
  try {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement
    JsBarcode(svg, code, BARCODE_OPTS)
    return svg.outerHTML
  } catch {
    return ''
  }
}

function BarcodeStrip({ code }: { code: string }) {
  const ref = useRef<SVGSVGElement>(null)
  useEffect(() => {
    if (!ref.current || !code) return
    try { JsBarcode(ref.current, code, BARCODE_OPTS) } catch {}
  }, [code])
  return (
    <div className="w-[38px] self-stretch flex items-center justify-center overflow-hidden border-l border-gray-100 bg-white flex-shrink-0">
      <svg ref={ref} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }} />
    </div>
  )
}

const LABELS_PER_PAGE = 15

const selectClass =
  'w-full px-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] appearance-none'

// ─── PriceLabel — reutilizable para preview y para print ──────────────────────

interface LabelProps {
  product: ProductRow
  mainList: PriceList
  otherLists: PriceList[]   // ordenadas por min_quantity, sin mainList
  showCode: boolean
  showTiers: boolean
}

export function PriceLabel({ product, mainList, otherLists, showCode, showTiers }: LabelProps) {
  const code = getProductCode(product)
  const mainPrice = getListPrice(product, mainList)
  const tiers = (!product.use_fixed_sell_price && showTiers) ? otherLists : []

  return (
    <div className="label-card">
      <p className="label-name">{product.name}</p>

      {/* Precio principal — zona grande */}
      <div className="label-main-block">
        <p className="label-qty">{qtyLabel(mainList.min_quantity)}</p>
        <p className="label-price">{formatPrice(mainPrice)}</p>
      </div>

      {/* Escalas — columnas inferiores */}
      {tiers.length > 0 && (
        <div className="label-tiers">
          {tiers.map(l => (
            <div key={l.id} className="label-tier-col">
              <span className="tier-qty">{qtyLabel(l.min_quantity)}</span>
              <span className="tier-price">{formatPrice(getListPrice(product, l))}</span>
            </div>
          ))}
        </div>
      )}

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
  const [recentHours, setRecentHours] = useState('0')
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
      setMainListId(''); setCategoryId(''); setBrandId(''); setRecentHours('0')
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

      if (recentHours !== '0') {
        const cutoff = new Date()
        cutoff.setTime(cutoff.getTime() - Number(recentHours) * 60 * 60 * 1000)
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
      const mainPrice = getListPrice(p, mainList)
      const code = getProductCode(p)
      const tiers = (!p.use_fixed_sell_price && showTiers) ? otherLists : []

      const tiersHtml = tiers.length > 0
        ? `<div class="ltiers">
            ${tiers.map(l => {
              const tierPrice = getListPrice(p, l)
              const { pct } = calcSaving(mainPrice, tierPrice)
              return `
              <div class="ltier-col">
                ${pct > 0 ? `<span class="ltier-off">${pct}% OFF</span>` : ''}
                <span class="ltier-qty">${qtyLabel(l.min_quantity)}</span>
                <span class="ltier-price">${formatPrice(tierPrice)}</span>
                ${l.min_quantity > 1 ? `<span class="ltier-cu">c/u</span>` : ''}
              </div>`
            }).join('')}
           </div>`
        : ''

      const barcodeHtml = showCode && code
        ? `<div class="lbarcode">${generateBarcodeSVG(code)}</div>`
        : ''

      return `
        <div class="label">
          <p class="lname">${p.name}</p>
          <div class="lmain">
            <div class="lmain-price">
              <p class="lqty">${qtyLabel(mainList.min_quantity)}</p>
              <p class="lprice">${formatPrice(mainPrice)}</p>
              ${mainList.min_quantity > 1 ? `<p class="lmain-cu">c/u</p>` : ''}
            </div>
            ${barcodeHtml}
          </div>
          ${tiersHtml}
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
      font-family: 'Arial', Helvetica, sans-serif;
      background: white;
      color: #111;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 4mm;
    }

    /* ── Etiqueta ── */
    .label {
      border: 1px solid #d1d5db;
      border-radius: 2.5mm;
      overflow: hidden;
      min-height: 52mm;
      display: flex;
      flex-direction: column;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    /* Nombre */
    .lname {
      font-size: 9.5pt;
      font-weight: 700;
      line-height: 1.3;
      color: #111;
      padding: 4mm 4.5mm 3mm;
      word-break: break-word;
    }

    /* Bloque precio principal */
    .lmain {
      flex: 1;
      display: flex;
      flex-direction: row;
      border-top: 1px solid #e5e7eb;
      overflow: hidden;
    }

    .lmain-price {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3mm 4mm;
      background: #f9fafb;
    }

    .lbarcode {
      width: 10mm;
      display: flex;
      align-items: center;
      justify-content: center;
      border-left: 1px solid #e5e7eb;
      overflow: hidden;
      background: white;
    }

    .lbarcode svg {
      transform: rotate(-90deg);
      flex-shrink: 0;
    }

    .lqty {
      font-size: 7pt;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #9ca3af;
      margin-bottom: 1mm;
    }

    .lprice {
      font-size: 34pt;
      font-weight: 900;
      color: #111;
      line-height: 1;
      letter-spacing: -1pt;
    }

    .lmain-cu {
      font-size: 7.5pt;
      font-weight: 600;
      color: #9ca3af;
      margin-top: 0.8mm;
      letter-spacing: 0.04em;
    }

    /* Tira de escalas */
    .ltiers {
      display: flex;
      border-top: 1px solid #e5e7eb;
    }

    .ltier-col {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 2.5mm 2mm;
      gap: 0.8mm;
    }

    .ltier-col:not(:last-child) {
      border-right: 1px solid #e5e7eb;
    }

    .ltier-off {
      font-size: 6pt;
      font-weight: 700;
      color: #059669;
      background: #ecfdf5;
      padding: 0.4mm 1.2mm;
      border-radius: 1mm;
      letter-spacing: 0.04em;
      line-height: 1.2;
    }

    .ltier-qty {
      font-size: 6.5pt;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #9ca3af;
    }

    .ltier-price {
      font-size: 15pt;
      font-weight: 800;
      color: #374151;
      line-height: 1;
      letter-spacing: -0.3pt;
    }

    .ltier-cu {
      font-size: 6pt;
      font-weight: 500;
      color: #9ca3af;
    }

    @media screen {
      body { background: #e5e7eb; padding: 20px; }
      .grid { max-width: 794px; margin: 0 auto; background: white; padding: 10mm; border-radius: 4px; }
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
            <p className="text-xs text-[var(--text3)]">Precio grande central de la etiqueta</p>
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
              <select value={recentHours} onChange={e => setRecentHours(e.target.value)} className={selectClass}>
                <option value="0">Todos los productos</option>
                <option value="1">Última hora</option>
                <option value="4">Últimas 4 horas</option>
                <option value="8">Últimas 8 horas</option>
                <option value="12">Últimas 12 horas</option>
                <option value="24">Últimas 24 horas</option>
                <option value="48">Últimos 2 días</option>
                <option value="72">Últimos 3 días</option>
                <option value="96">Últimos 4 días</option>
                <option value="120">Últimos 5 días</option>
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
                Mostrar código de barras (gráfico escaneable)
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
                    {code && <p className="text-xs text-[var(--text3)] mono">{code}</p>}
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
              const mainPrice = getListPrice(p, mainList)
              const code = getProductCode(p)
              const tiers = (!p.use_fixed_sell_price && showTiers) ? otherLists : []

              return (
                <div
                  key={`${p.id}-${i}`}
                  className="bg-white border border-gray-200 rounded-lg overflow-hidden flex flex-col"
                  style={{ minHeight: 156 }}
                >
                  {/* Nombre */}
                  <p className="text-[10px] font-bold text-gray-900 leading-snug px-3 pt-2.5 pb-2 line-clamp-2">
                    {p.name}
                  </p>

                  {/* Precio principal — zona central */}
                  <div className="flex-1 flex flex-row border-t border-gray-100 overflow-hidden">
                    <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 py-3 px-2">
                      <span className="text-[7px] font-semibold text-gray-400 uppercase tracking-widest mb-0.5">
                        {qtyLabel(mainList.min_quantity)}
                      </span>
                      <span className="text-[30px] font-black text-gray-900 leading-none tracking-tight">
                        {formatPrice(mainPrice)}
                      </span>
                      {mainList.min_quantity > 1 && (
                        <span className="text-[7px] font-semibold text-gray-400 mt-0.5">c/u</span>
                      )}
                    </div>
                    {showCode && code && <BarcodeStrip code={code} />}
                  </div>

                  {/* Escalas — tira inferior */}
                  {tiers.length > 0 && (
                    <div className="flex border-t border-gray-100 divide-x divide-gray-100">
                      {tiers.map(l => {
                        const tierPrice = getListPrice(p, l)
                        const { pct } = calcSaving(mainPrice, tierPrice)
                        return (
                          <div key={l.id} className="flex-1 flex flex-col items-center py-1.5 px-1 gap-px">
                            {pct > 0 && (
                              <span className="text-[6px] font-bold text-emerald-600 bg-emerald-50 px-1 py-px rounded-sm leading-none">
                                {pct}% OFF
                              </span>
                            )}
                            <span className="text-[6px] font-semibold text-gray-400 uppercase tracking-wider">
                              {qtyLabel(l.min_quantity)}
                            </span>
                            <span className="text-[13px] font-extrabold text-gray-700 leading-tight tracking-tight">
                              {formatPrice(tierPrice)}
                            </span>
                            {l.min_quantity > 1 && (
                              <span className="text-[6px] font-medium text-gray-400">c/u</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                </div>
              )
            })}

            {/* Celdas vacías */}
            {Array(LABELS_PER_PAGE - pageItems.length).fill(null).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="border border-dashed border-gray-200 rounded-lg"
                style={{ minHeight: 156 }}
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
