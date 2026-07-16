'use client'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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

// ─── Barcode helpers ──────────────────────────────────────────────────────────

const MM_TO_PX = 96 / 25.4         // ≈ 3.78 px por mm @96dpi
const NOMINAL_MODULE_MM = 0.33     // X-dimension ideal (100% de magnificación)
const MIN_MODULE_MM = 0.25         // X-dimension mínima aceptable (~75%, tolerable en lectores de retail)
const QUIET_MODULES = 10           // zona muda por lado, en módulos (escala con la X-dimension)

const PAGE_USABLE_MM = 190         // A4 210mm − 2×10mm de margen
const COL_GAP_MM = 3               // separación entre columnas
const LBARCODE_PAD_MM = 2          // padding horizontal de .lbarcode por lado

/** Ancho útil para el barcode dentro de una etiqueta, según nº de columnas. */
function barcodeMaxWidthMm(columns: number): number {
  const colMm = (PAGE_USABLE_MM - (columns - 1) * COL_GAP_MM) / columns
  return colMm - LBARCODE_PAD_MM * 2
}

// Validación de checksum: solo usamos EAN/UPC (más compactos y estándar de
// retail) cuando el dígito verificador es correcto; si no, cae a CODE128.
function ean13Ok(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false
  const d = code.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 12; i++) sum += d[i] * (i % 2 === 0 ? 1 : 3)
  return (10 - (sum % 10)) % 10 === d[12]
}

function upcOk(code: string): boolean {
  if (!/^\d{12}$/.test(code)) return false
  const d = code.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 11; i++) sum += d[i] * (i % 2 === 0 ? 3 : 1)
  return (10 - (sum % 10)) % 10 === d[11]
}

function ean8Ok(code: string): boolean {
  if (!/^\d{8}$/.test(code)) return false
  const d = code.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 7; i++) sum += d[i] * (i % 2 === 0 ? 3 : 1)
  return (10 - (sum % 10)) % 10 === d[7]
}

function detectBarcodeFormat(code: string): string {
  if (ean13Ok(code)) return 'EAN13'
  if (upcOk(code)) return 'UPC'
  if (ean8Ok(code)) return 'EAN8'
  return 'CODE128'
}

/**
 * Genera el barcode SIEMPRE como gráfico, eligiendo el módulo (X-dimension) más
 * grande que entre en la columna: arranca en el nominal (0.33mm) y lo achica
 * proporcionalmente hasta el mínimo (0.25mm) si hace falta. La zona muda escala
 * con el módulo. `fits=false` solo significa que quedó por debajo del mínimo
 * ideal (igual se imprime, escalado por CSS); el caller lo usa para avisar, no
 * para reemplazarlo por el número.
 */
function generateBarcodeSVG(code: string, maxWidthMm: number): { svg: string; fits: boolean } {
  try {
    const format = detectBarcodeFormat(code)
    const render = (moduleMm: number): SVGSVGElement => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement
      JsBarcode(svg, code, {
        format,
        displayValue: false,                         // sin dígitos: si no escanea, se busca por nombre
        margin: QUIET_MODULES * moduleMm * MM_TO_PX, // quiet zone proporcional a la X-dimension
        width: moduleMm * MM_TO_PX,                  // módulo (X-dimension)
        height: 5.5 * MM_TO_PX,
        background: 'transparent',
        lineColor: '#000',                           // negro puro: máximo contraste
      })
      return svg
    }
    // 1) medir al tamaño nominal
    let svg = render(NOMINAL_MODULE_MM)
    let wMm = parseFloat(svg.getAttribute('width') || '0') / MM_TO_PX
    if (!wMm) return { svg: '', fits: false }
    // 2) si no entra, achicar el módulo proporcionalmente sin bajar del mínimo
    if (wMm > maxWidthMm) {
      const target = Math.max(MIN_MODULE_MM, NOMINAL_MODULE_MM * (maxWidthMm / wMm))
      svg = render(target)
      wMm = parseFloat(svg.getAttribute('width') || '0') / MM_TO_PX
    }
    const hPx = parseFloat(svg.getAttribute('height') || '0')
    // Tamaño físico real en mm; el CSS solo lo centra (max-width:100% lo encoge
    // si aun así desbordara, garantizando que siempre se imprima).
    svg.setAttribute('width', `${wMm.toFixed(2)}mm`)
    svg.setAttribute('height', `${(hPx / MM_TO_PX).toFixed(2)}mm`)
    return { svg: svg.outerHTML, fits: wMm <= maxWidthMm + 0.01 }
  } catch {
    return { svg: '', fits: false }
  }
}

const A4_WIDTH_PX = 793.7 // 210mm @ 96dpi

// Lista sintética para comercios que no usan listas de precio (precio fijo).
// getListPrice() devuelve el sell_price del producto cuando use_fixed_sell_price.
const FALLBACK_LIST: PriceList = {
  id: '__fixed__',
  business_id: '',
  name: 'Precio de venta',
  margin_pct: 0,
  min_quantity: 1,
  is_default: true,
  is_active: true,
  created_at: '',
}

/**
 * Etiquetas por página A4 (4 columnas) estimadas según la altura de fila, que
 * depende de si hay escalas y/o código de barras. Mantiene el preview alineado
 * con el PDF y aprovecha mejor la hoja en modo compacto.
 */
function labelsPerPage(showTiers: boolean, showCode: boolean, columns: number): number {
  const usableMm = 277 // A4 297mm − 2×10mm de margen
  const gapMm = 3
  // alto aprox. de fila: con escalas ~42mm; compacto ~23/17mm según barcode
  const rowMm = showTiers ? 42 : (showCode ? 23 : 17)
  const rows = Math.max(1, Math.floor((usableMm + gapMm) / (rowMm + gapMm)))
  return rows * columns
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

// ─── HTML + CSS compartidos entre preview y print (WYSIWYG) ────────────────────

/** Reglas de la etiqueta. `scope` permite aislarlas dentro del preview. */
function labelStyles(scope = '', columns = 4): string {
  const s = scope ? scope + ' ' : ''
  return `
    ${s}.grid { display:grid; grid-template-columns:repeat(${columns}, 1fr); gap:3mm; align-content:start; }
    ${s}.label { border:1px solid #ececea; border-radius:2mm; overflow:hidden; min-height:42mm; display:flex; flex-direction:column; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,0.05); page-break-inside:avoid; break-inside:avoid; }
    ${s}.label.empty { border-style:dashed; border-color:#f0f0ee; box-shadow:none; }
    ${s}.lname { font-size:8pt; font-weight:600; line-height:1.2; color:#111; padding:1.8mm 3mm 1.6mm; word-break:break-word; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
    ${s}.lmain { flex:1; display:flex; border-top:1px solid #e5e7eb; overflow:hidden; }
    ${s}.lmain-price { flex:1; min-width:0; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:2mm 1.5mm; background:#f9fafb; overflow:hidden; }
    ${s}.lbarcode { border-top:1px solid #e5e7eb; padding:1.3mm 2mm; display:flex; align-items:center; justify-content:center; background:#fff; }
    ${s}.lbarcode svg { display:block; max-width:100%; height:auto; shape-rendering:crispEdges; }
    ${s}.lbarcode-fallback { font-family:'Courier New',monospace; font-size:8pt; font-weight:700; letter-spacing:0.06em; color:#111; word-break:break-all; text-align:center; }
    /* Modo compacto: etiquetas sin escalas — sin "1 UNIDAD", más bajas */
    ${s}.label.compact { min-height:23mm; }
    ${s}.label.compact .lname { padding:2mm 3mm 1.5mm; }
    ${s}.label.compact .lmain-price { padding:1.2mm 1.5mm; }
    ${s}.label.compact .lbarcode { padding:1mm 2mm; }
    ${s}.lqty { font-size:5.5pt; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:#6b7280; margin-bottom:0.6mm; }
    ${s}.lprice { font-size:22pt; font-weight:800; color:#111; line-height:1; letter-spacing:-0.8pt; white-space:nowrap; font-variant-numeric:tabular-nums; max-width:100%; margin-left:-0.28em; }
    ${s}.lcurr { font-size:0.72em; font-weight:700; color:#374151; margin-right:0.04em; letter-spacing:0; }
    ${s}.lmain-cu { font-size:5.5pt; font-weight:600; color:#9ca3af; margin-top:0.5mm; letter-spacing:0.04em; }
    ${s}.ltiers { display:flex; flex-direction:column; border-top:1px solid #e5e7eb; }
    ${s}.ltier-row { display:flex; align-items:baseline; gap:1.5mm; padding:0.9mm 3mm; }
    ${s}.ltier-row:not(:last-child) { border-bottom:1px solid #f1f1f0; }
    ${s}.ltier-qty { font-size:7pt; font-weight:700; color:#6b7280; flex-shrink:0; min-width:4mm; }
    ${s}.ltier-price { flex:1; font-size:9.5pt; font-weight:800; color:#111; line-height:1; letter-spacing:-0.4pt; white-space:nowrap; font-variant-numeric:tabular-nums; }
    ${s}.ltier-cu { font-size:6pt; font-weight:600; color:#9ca3af; flex-shrink:0; white-space:nowrap; letter-spacing:0.04em; }
  `
}

/**
 * Tamaño del precio principal calculado para llenar el ancho disponible sin
 * desbordar. Aprovecha todo el espacio (precios cortos quedan grandes) y se
 * achica solo lo necesario en precios largos.
 */
function mainPriceFontPt(formatted: string, usableMm: number): number {
  const n = formatted.length // incluye "$" y separadores de miles
  const charMm = 0.212 // ancho aprox. por carácter ≈ fontPt × 0.212mm (bold)
  const fit = usableMm / (n * charMm)
  return Math.max(11, Math.min(28, Math.floor(fit)))
}

/** Genera el HTML de una etiqueta. Idéntico en preview y en print. */
function buildLabelHtml(
  p: ProductRow,
  mainList: PriceList,
  otherLists: PriceList[],
  showCode: boolean,
  showTiers: boolean,
  columns: number,
): string {
  const colContentMm = barcodeMaxWidthMm(columns) // ancho útil de la columna
  const mainPrice = getListPrice(p, mainList)
  const mainPriceStr = formatPrice(mainPrice)
  // El "$" va en su propio span (más chico y tenue) para que el ojo vaya al número
  const mainPriceHtml = mainPriceStr.replace(/^\$/, '<span class="lcurr">$</span>')
  const code = getProductCode(p)
  const tiers = (!p.use_fixed_sell_price && showTiers) ? otherLists : []
  const compact = tiers.length === 0
  // En compacto el "1 UNIDAD" es redundante; solo se muestra si la lista es por cantidad
  const mainQty = mainList.min_quantity ?? 1
  const showQty = !compact || mainQty > 1

  const tiersHtml = tiers.length > 0
    ? `<div class="ltiers">${tiers.map(l => {
        const tierPrice = getListPrice(p, l)
        return `<div class="ltier-row"><span class="ltier-qty">${l.min_quantity ?? 1}x</span><span class="ltier-price">${formatPrice(tierPrice)}</span><span class="ltier-cu">c/u</span></div>`
      }).join('')}</div>`
    : ''

  const barcode = showCode && code ? generateBarcodeSVG(code, colContentMm) : null
  // Solo el gráfico; nunca el número. Si la generación falla, no se muestra nada
  // (la etiqueta ya trae el nombre para buscar el producto).
  const barcodeHtml = barcode?.svg ? `<div class="lbarcode">${barcode.svg}</div>` : ''

  const qtyHtml = showQty ? `<p class="lqty">${qtyLabel(mainQty)}</p>` : ''

  return `<div class="label${compact ? ' compact' : ''}"><p class="lname">${escapeHtml(p.name)}</p><div class="lmain"><div class="lmain-price">${qtyHtml}<p class="lprice" style="font-size:${mainPriceFontPt(mainPriceStr, colContentMm)}pt">${mainPriceHtml}</p>${mainQty > 1 ? '<p class="lmain-cu">c/u</p>' : ''}</div></div>${tiersHtml}${barcodeHtml}</div>`
}

const selectClass =
  'w-full px-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] appearance-none'

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
  const [showTiers, setShowTiers] = useState(false)
  const [hiddenTierListIds, setHiddenTierListIds] = useState<Set<string>>(new Set())
  const [copies, setCopies] = useState(1)
  const [columns, setColumns] = useState(4)

  // Productos
  const [allProducts, setAllProducts] = useState<ProductRow[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [searchText, setSearchText] = useState('')

  // Preview
  const [previewPage, setPreviewPage] = useState(1)
  const previewWrapRef = useRef<HTMLDivElement>(null)
  const previewPageRef = useRef<HTMLDivElement>(null)
  const [previewScale, setPreviewScale] = useState(1)
  const [previewHeight, setPreviewHeight] = useState(0)

  // Reset al cerrar
  useEffect(() => {
    if (!open) {
      setStep('config')
      setMainListId(''); setCategoryId(''); setBrandId(''); setRecentHours('0')
      setShowCode(false); setShowTiers(false); setHiddenTierListIds(new Set()); setCopies(1); setColumns(4)
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
  const hasLists = priceLists.length > 0
  // Si no hay listas (comercio con precio fijo), usamos la lista sintética
  const mainList = priceLists.find(l => l.id === mainListId) ?? (hasLists ? undefined : FALLBACK_LIST)
  // Listas candidatas a escala por cantidad (todas menos la principal y las manuales)
  const tierCandidates = [...priceLists]
    // Las listas manuales (min_quantity == null) no son tiers por cantidad: se excluyen
    .filter(l => l.id !== mainListId && l.min_quantity != null)
    .sort((a, b) => (a.min_quantity ?? 1) - (b.min_quantity ?? 1))
  // Escalas que efectivamente se imprimen: el usuario puede ocultar las que no
  // quiere mostrar en góndola (ej: precio mayorista)
  const otherLists = tierCandidates.filter(l => !hiddenTierListIds.has(l.id))

  const selectedProducts = allProducts.filter(p => selected.has(p.id))
  const labelItems: ProductRow[] = selectedProducts.flatMap(p => Array(copies).fill(p))

  // Códigos que quedan por debajo del módulo mínimo ideal: se imprimen igual
  // (más chicos) y solo se avisa en la vista previa.
  const unreadableLabels = useMemo(() => {
    if (step !== 'preview' || !showCode) return []
    const maxW = barcodeMaxWidthMm(columns)
    return selectedProducts.filter(p => {
      const code = getProductCode(p)
      return !!code && !generateBarcodeSVG(code, maxW).fits
    })
  }, [step, showCode, columns, allProducts, selected])

  // Etiquetas por página según altura estimada de fila (4 columnas)
  const perPage = labelsPerPage(showTiers, showCode, columns)
  const totalPages = Math.max(1, Math.ceil(labelItems.length / perPage))
  const pageItems = labelItems.slice((previewPage - 1) * perPage, previewPage * perPage)

  // HTML del preview: mismas etiquetas y CSS que el print (WYSIWYG)
  const previewHtml = mainList
    ? `<style>${labelStyles('.lbl-scope', columns)}</style>` +
      `<div class="lbl-scope" style="padding:10mm">` +
      `<div class="grid">` +
        pageItems.map(p => buildLabelHtml(p, mainList, otherLists, showCode, showTiers, columns)).join('') +
        Array(perPage - pageItems.length).fill(`<div class="label empty${showTiers ? '' : ' compact'}"></div>`).join('') +
      `</div></div>`
    : ''

  // Escalar la página A4 (210mm) para que entre en el ancho del modal
  useLayoutEffect(() => {
    if (step !== 'preview') return
    const wrap = previewWrapRef.current
    const page = previewPageRef.current
    if (!wrap || !page) return
    const scale = Math.min(1, wrap.clientWidth / A4_WIDTH_PX)
    setPreviewScale(scale)
    setPreviewHeight(page.scrollHeight * scale)
  }, [step, previewHtml])

  // ─── Print ────────────────────────────────────────────────────────────────

  const handlePrint = () => {
    if (!mainList) return

    const labelsHtml = labelItems
      .map(p => buildLabelHtml(p, mainList, otherLists, showCode, showTiers, columns))
      .join('')

    const win = window.open('', '_blank', 'width=900,height=1100')
    if (!win) return

    win.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Etiquetas de precios</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: A4 portrait; margin: 10mm; }
    body { font-family: 'Arial', Helvetica, sans-serif; background: white; color: #111; }
    ${labelStyles('', columns)}
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
    <Modal
      open={open}
      onClose={onClose}
      title={stepTitle[step]}
      size={step === 'preview' ? 'xl' : 'md'}
      dismissable={step !== 'preview'}
      headerActions={step === 'preview' && mainList ? (
        <button
          onClick={handlePrint}
          className="flex items-center gap-1.5 mr-1 px-3 py-1.5 text-sm font-medium rounded-[var(--radius-md)] bg-[var(--accent)] text-white hover:opacity-90 transition-opacity"
        >
          <Printer size={14} /> Imprimir / Exportar PDF
        </button>
      ) : undefined}
    >

      {/* ── PASO 1: Configurar ─────────────────────────────────────────────── */}
      {step === 'config' && (
        <div className="space-y-5 pb-6">

          {/* Lista principal — solo si el comercio usa listas de precio */}
          {hasLists && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[var(--text2)]">Lista de precio a mostrar</label>
              <div className="relative">
                <select value={mainListId} onChange={e => setMainListId(e.target.value)} className={selectClass}>
                  {priceLists.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.name} — {l.margin_pct > 0 ? '+' : ''}{l.margin_pct}%{l.min_quantity == null ? ' · selección manual' : ` · desde ${l.min_quantity} ${l.min_quantity === 1 ? 'unidad' : 'unidades'}`}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-[var(--text3)]">Precio grande central de la etiqueta</p>
            </div>
          )}

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

          {/* Columnas por hoja — más columnas = etiquetas más chicas */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--text2)]">Columnas por hoja</label>
            <select value={columns} onChange={e => setColumns(Number(e.target.value))} className={selectClass}>
              <option value={3}>3 columnas — etiquetas grandes</option>
              <option value={4}>4 columnas — estándar</option>
              <option value={5}>5 columnas — etiquetas chicas (más por hoja)</option>
            </select>
            {showCode && columns >= 5 && (
              <p className="text-xs" style={{ color: '#b45309' }}>
                A 5 columnas el código de barras se imprime más chico; con códigos largos (no EAN/UPC) puede requerir un buen escáner.
              </p>
            )}
          </div>

          {/* Opciones etiqueta */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[var(--text2)]">Contenido de la etiqueta</label>
            <div className="flex flex-col gap-2">
              {tierCandidates.length > 0 && (
                <>
                  <label className="flex items-center gap-2 text-sm text-[var(--text2)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showTiers}
                      onChange={e => setShowTiers(e.target.checked)}
                      className="w-4 h-4 accent-[var(--accent)]"
                    />
                    Mostrar escalas de precio (otras listas activas)
                  </label>

                  {/* Elegir qué listas mostrar como escala (ocultar las que no
                      querés que vea el cliente en góndola) */}
                  {showTiers && (
                    <div className="flex flex-col gap-1.5 pl-6">
                      {tierCandidates.map(l => (
                        <label key={l.id} className="flex items-center gap-2 text-xs text-[var(--text2)] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!hiddenTierListIds.has(l.id)}
                            onChange={e => setHiddenTierListIds(prev => {
                              const next = new Set(prev)
                              e.target.checked ? next.delete(l.id) : next.add(l.id)
                              return next
                            })}
                            className="w-3.5 h-3.5 accent-[var(--accent)]"
                          />
                          {l.name}
                          <span className="text-[var(--text3)]">
                            {l.margin_pct > 0 ? '+' : ''}{l.margin_pct}% · desde {l.min_quantity} {l.min_quantity === 1 ? 'unidad' : 'unidades'}
                          </span>
                        </label>
                      ))}
                      {otherLists.length === 0 && (
                        <p className="text-xs" style={{ color: '#b45309' }}>
                          Ocultaste todas las escalas: la etiqueta saldrá sin escalas de precio.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
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
              disabled={!mainList}
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

          {unreadableLabels.length > 0 && (
            <div
              className="px-3 py-2 rounded-[var(--radius-md)] text-xs"
              style={{ background: 'rgba(245,158,11,0.12)', color: '#b45309', border: '1px solid rgba(245,158,11,0.3)' }}
            >
              ⚠ {unreadableLabels.length} {unreadableLabels.length === 1 ? 'código queda' : 'códigos quedan'} por debajo del tamaño óptimo (se imprimen igual, pero más chicos). Si tu escáner los lee bien, ignorá este aviso; si no, usá menos columnas o códigos EAN-13.
            </div>
          )}

          {/* Página A4 — mismo HTML/CSS que el print, escalado para que entre */}
          <div
            ref={previewWrapRef}
            className="bg-gray-200 rounded-[var(--radius-lg)] p-3 overflow-hidden flex justify-center"
            style={{ height: previewHeight ? previewHeight + 24 : undefined }}
          >
            <div
              ref={previewPageRef}
              className="bg-white shadow-sm"
              style={{
                width: '210mm',
                transform: `scale(${previewScale})`,
                transformOrigin: 'top center',
              }}
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
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

          <p className="text-xs text-center text-[var(--text3)] border-t border-[var(--border)] pt-3">
            Para exportar PDF: en el diálogo de impresión elegí "Guardar como PDF"
          </p>
        </div>
      )}
    </Modal>
  )
}
