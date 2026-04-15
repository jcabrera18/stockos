'use client'
import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { Printer } from 'lucide-react'
import type { Category } from '@/types'
import type { PriceList } from '@/app/price-lists/page'

interface Supplier { id: string; name: string }
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
  stock_current: number
}

interface CategoryWithChildren extends Category { children: CategoryWithChildren[] }

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

const selectClass = 'w-full px-3 py-2 pr-9 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] appearance-none'

interface Props {
  open: boolean
  onClose: () => void
}

export function PrintPriceListModal({ open, onClose }: Props) {
  const [categories, setCategories] = useState<Category[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [priceLists, setPriceLists] = useState<PriceList[]>([])

  const [categoryId, setCategoryId] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [brandId, setBrandId] = useState('')
  const [showStock, setShowStock] = useState(false)
  const [showBarcode, setShowBarcode] = useState(false)
  const [selectedLists, setSelectedLists] = useState<string[]>([])

  const [loading, setLoading] = useState(false)
  const [products, setProducts] = useState<ProductRow[]>([])
  const [fetched, setFetched] = useState(false)

  useEffect(() => {
    if (!open) {
      setCategoryId(''); setSupplierId(''); setBrandId('')
      setShowStock(false); setShowBarcode(false)
      setSelectedLists([])
      setProducts([]); setFetched(false)
      return
    }
    Promise.all([
      api.get<Category[]>('/api/products/categories'),
      api.get<Supplier[]>('/api/purchases/suppliers'),
      api.get<Brand[]>('/api/brands'),
      api.get<PriceList[]>('/api/price-lists'),
    ]).then(([cats, sups, brnds, lists]) => {
      setCategories(cats)
      setSuppliers(sups)
      setBrands(brnds)
      setPriceLists(lists.filter(l => l.is_active))
    }).catch(() => {})
  }, [open])

  const l1Tree = buildCategoryTree(categories)

  const resetFetched = () => setFetched(false)

  const handleFetch = async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number> = { limit: 500, page: 1 }
      if (supplierId) params.supplier_id = supplierId
      if (brandId) params.brand_id = brandId

      const res = await api.get<{ data: ProductRow[] }>('/api/products', params)
      let filtered = res.data

      if (categoryId) {
        const descendantIds = getAllDescendantIds(l1Tree, categoryId)
        filtered = res.data.filter(p => p.category_id && descendantIds.has(p.category_id))
      }

      setProducts(filtered)
      setFetched(true)
    } catch { } finally { setLoading(false) }
  }

  const toggleList = (id: string) =>
    setSelectedLists(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const getListPrice = (product: ProductRow, list: PriceList): number => {
    if (product.use_fixed_sell_price) return product.sell_price
    return product.cost_price * (1 + list.margin_pct / 100)
  }

  const handlePrint = () => {
    if (!products.length) return

    const selectedListObjects = priceLists.filter(l => selectedLists.includes(l.id))

    const groups = new Map<string, ProductRow[]>()
    products.forEach(p => {
      const key = p.category_name ?? 'Sin categoría'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(p)
    })

    const filterLabel = [
      categoryId && categories.find(c => c.id === categoryId)?.name,
      supplierId && suppliers.find(s => s.id === supplierId)?.name,
      brandId && brands.find(b => b.id === brandId)?.name,
    ].filter(Boolean).join(' · ') || 'Todos los productos'

    const colCount = 1 + (showBarcode ? 1 : 0) + (showStock ? 1 : 0) + 1 + selectedListObjects.length

    const rows = [...groups.entries()].map(([cat, prods]) => `
      <tr class="cat-row">
        <td colspan="${colCount}">${cat}</td>
      </tr>
      ${prods.map(p => `
        <tr>
          <td class="name">${p.name}${p.sku ? `<span class="sku"> · ${p.sku}</span>` : ''}</td>
          ${showBarcode ? `<td class="center mono small">${p.barcode ?? '—'}</td>` : ''}
          ${showStock ? `<td class="center mono">${p.stock_current}</td>` : ''}
          <td class="price">${formatCurrency(p.sell_price)}</td>
          ${selectedListObjects.map(list => `<td class="price list-col">${formatCurrency(getListPrice(p, list))}</td>`).join('')}
        </tr>
      `).join('')}
    `).join('')

    const win = window.open('', '_blank', 'width=700,height=900')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8">
      <title>Lista de precios</title>
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family:'Inter',Arial,sans-serif; color:#1a1a18; padding:24px 28px; font-size:12px; }
        h1 { font-size:18px; font-weight:700; margin-bottom:2px; }
        .sub { font-size:11px; color:#6a6a64; margin-bottom:20px; }
        table { width:100%; border-collapse:collapse; }
        th { font-size:10px; font-weight:600; color:#6a6a64; text-transform:uppercase; letter-spacing:0.05em; padding:6px 8px; border-bottom:2px solid #1a1a18; text-align:left; }
        th.right { text-align:right; }
        td { padding:5px 8px; border-bottom:1px solid #e5e5e2; vertical-align:middle; }
        td.name { font-weight:500; }
        .sku { color:#8a8a84; font-size:10px; }
        td.price { text-align:right; font-family:'Courier New',monospace; font-weight:700; font-size:13px; white-space:nowrap; }
        td.list-col { color:#2563eb; }
        td.center { text-align:center; }
        td.mono { font-family:'Courier New',monospace; }
        td.small { font-size:10px; color:#6a6a64; }
        tr.cat-row td { background:#f5f5f4; font-weight:700; font-size:11px; text-transform:uppercase; letter-spacing:0.04em; color:#4a4a44; padding:4px 8px; border-top:8px solid #fff; border-bottom:1px solid #d4d4cc; }
        .footer { margin-top:16px; font-size:10px; color:#b4b2a9; text-align:center; }
        @media print { body { padding:12px; } }
      </style>
    </head><body>
      <h1>Lista de precios</h1>
      <div class="sub">${filterLabel} · ${products.length} productos · ${new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
      <table>
        <thead><tr>
          <th>Producto</th>
          ${showBarcode ? '<th class="center">Código de barras</th>' : ''}
          ${showStock ? '<th class="center">Stock</th>' : ''}
          <th class="right">Precio venta</th>
          ${selectedListObjects.map(list => `<th class="right">${list.name}</th>`).join('')}
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="footer">⚡ Powered by StockOS</div>
    </body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 400)
  }

  return (
    <Modal open={open} onClose={onClose} title="Imprimir lista de precios" size="sm">
      <div className="space-y-4">

        {/* Categoría - solo nivel 1 */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-[var(--text2)]">Categoría</label>
          <select value={categoryId} onChange={e => { setCategoryId(e.target.value); resetFetched() }} className={selectClass}>
            <option value="">Todas</option>
            {l1Tree.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <Select label="Proveedor"
          options={[{ value: '', label: 'Todos' }, ...suppliers.map(s => ({ value: s.id, label: s.name }))]}
          value={supplierId}
          onChange={e => { setSupplierId(e.target.value); resetFetched() }} />

        <Select label="Marca"
          options={[{ value: '', label: 'Todas' }, ...brands.map(b => ({ value: b.id, label: b.name }))]}
          value={brandId}
          onChange={e => { setBrandId(e.target.value); resetFetched() }} />

        {/* Opciones de columnas */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-[var(--text2)]">Columnas</label>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <label className="flex items-center gap-2 text-sm text-[var(--text2)] cursor-pointer">
              <input type="checkbox" checked={showStock} onChange={e => setShowStock(e.target.checked)}
                className="w-4 h-4 accent-[var(--accent)]" />
              Mostrar stock
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--text2)] cursor-pointer">
              <input type="checkbox" checked={showBarcode} onChange={e => setShowBarcode(e.target.checked)}
                className="w-4 h-4 accent-[var(--accent)]" />
              Código de barras
            </label>
          </div>
        </div>

        {/* Listas de precio adicionales */}
        {priceLists.length > 0 && (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[var(--text2)]">Precios por lista</label>
            <div className="flex flex-col gap-1.5">
              {priceLists.map(list => (
                <label key={list.id} className="flex items-center gap-2 text-sm text-[var(--text2)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedLists.includes(list.id)}
                    onChange={() => toggleList(list.id)}
                    className="w-4 h-4 accent-[var(--accent)]"
                  />
                  <span className="font-medium">{list.name}</span>
                  {list.description && (
                    <span className="text-xs text-[var(--text3)]">— {list.description}</span>
                  )}
                </label>
              ))}
            </div>
          </div>
        )}

        {fetched && (
          <div className="px-3 py-2 bg-[var(--accent-subtle)] rounded-[var(--radius-md)] text-sm text-[var(--accent)] font-medium">
            {products.length} productos listos para imprimir
          </div>
        )}

        <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 mt-4 border-t border-[var(--border)]">
          <div className="flex justify-end gap-2">
            {!fetched ? (
              <Button className="flex-1" onClick={handleFetch} loading={loading}>
                Previsualizar
              </Button>
            ) : (
              <>
                <Button variant="secondary" onClick={() => setFetched(false)}>Cambiar filtros</Button>
                <Button className="flex-1" onClick={handlePrint} disabled={!products.length}>
                  <Printer size={14} /> Imprimir ({products.length})
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
