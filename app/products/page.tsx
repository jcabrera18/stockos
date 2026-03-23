'use client'
import { useEffect, useState, useCallback } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoader } from '@/components/ui/Spinner'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ProductModal } from '@/components/modules/ProductModal'
import { AdjustStockModal } from '@/components/modules/AdjustStockModal'
import { api } from '@/lib/api'
import { formatCurrency, getStockStatusLabel, getStockStatusColor } from '@/lib/utils'
import type { StockSummary, Product, PaginatedResponse, Pagination as PaginationType } from '@/types'
import { Plus, Search, Package, Pencil, Trash2, SlidersHorizontal, Tag } from 'lucide-react'
import { toast } from 'sonner'
import { ProductPriceRulesModal } from '@/components/modules/ProductPriceRulesModal'

export default function ProductsPage() {
  const [data, setData] = useState<StockSummary[]>([])
  const [pagination, setPagination] = useState<PaginationType>({ total: 0, page: 1, limit: 20, pages: 0 })
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  // Modales
  const [productModal, setProductModal] = useState(false)
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [adjustModal, setAdjustModal] = useState(false)
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null)
  const [deleteModal, setDeleteModal] = useState(false)
  const [deleteProduct, setDeleteProduct] = useState<StockSummary | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [priceRulesModal, setPriceRulesModal] = useState(false)
  const [priceRulesProduct, setPriceRulesProduct] = useState<Product | null>(null)

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<PaginatedResponse<StockSummary>>('/api/products', {
        search: search || undefined,
        page,
        limit: 20,
      })
      setData(res.data)
      setPagination(res.pagination)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [search, page])

  useEffect(() => { fetchProducts() }, [fetchProducts])
  useEffect(() => { setPage(1) }, [search])

  const handleEdit = async (item: StockSummary) => {
    // Traer producto completo para tener todos los campos
    try {
      const product = await api.get<Product>(`/api/products/${item.id}`)
      setEditProduct(product)
      setProductModal(true)
    } catch {
      toast.error('Error al cargar el producto')
    }
  }

  const handleAdjust = (item: StockSummary) => {
    setAdjustProduct(item as unknown as Product)
    setAdjustModal(true)
  }

  const handleDelete = async () => {
    if (!deleteProduct) return
    setDeleting(true)
    try {
      await api.delete(`/api/products/${deleteProduct.id}`)
      toast.success('Producto eliminado')
      setDeleteModal(false)
      setDeleteProduct(null)
      fetchProducts()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    } finally {
      setDeleting(false)
    }
  }

  const openCreate = () => {
    setEditProduct(null)
    setProductModal(true)
  }

  return (
    <AppShell>
      <PageHeader
        title="Productos"
        description={`${pagination.total} productos`}
        action={
          <Button onClick={openCreate}>
            <Plus size={15} /> Nuevo producto
          </Button>
        }
      />

      <div className="p-5 space-y-4">
        {/* Búsqueda */}
        <div className="relative max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre o código..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>

        {/* Tabla */}
        {loading ? <PageLoader /> : data.length === 0 ? (
          <EmptyState
            icon={Package}
            title={search ? 'Sin resultados' : 'Sin productos'}
            description={search ? 'Probá con otro término.' : 'Creá tu primer producto para empezar.'}
            action={!search ? <Button onClick={openCreate}><Plus size={15} /> Nuevo producto</Button> : undefined}
          />
        ) : (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)]">Producto</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden md:table-cell">Categoría</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)]">Stock</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)] hidden sm:table-cell">P. Costo</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)]">P. Venta</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-[var(--text3)]">Estado</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {data.map(product => (
                    <tr key={product.id} className="hover:bg-[var(--surface2)] transition-colors group">
                      <td className="px-4 py-3">
                        <p className="font-medium text-[var(--text)]">{product.name}</p>
                        {product.barcode && (
                          <p className="text-xs mono text-[var(--text3)]">{product.barcode}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[var(--text2)] hidden md:table-cell">
                        {product.category_name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right mono font-bold text-base" style={{ color: getStockStatusColor(product.stock_status) }}>
                        {product.stock_current}
                      </td>
                      <td className="px-4 py-3 text-right mono text-[var(--text2)] hidden sm:table-cell">
                        {formatCurrency(product.cost_price)}
                      </td>
                      <td className="px-4 py-3 text-right mono font-medium text-[var(--text)]">
                        {formatCurrency(product.sell_price)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={
                          product.stock_status === 'ok' ? 'success' :
                            product.stock_status === 'bajo' ? 'warning' : 'danger'
                        }>
                          {getStockStatusLabel(product.stock_status)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* Ajuste de stock */}
                          <button
                            onClick={() => handleAdjust(product)}
                            title="Ajustar stock"
                            className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface3)] transition-colors"
                          >
                            <SlidersHorizontal size={14} />
                          </button>
                          {/* Editar */}
                          <button
                            onClick={() => handleEdit(product)}
                            title="Editar"
                            className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface3)] transition-colors"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={async () => {
                              const p = await api.get<Product>(`/api/products/${product.id}`)
                              setPriceRulesProduct(p)
                              setPriceRulesModal(true)
                            }}
                            title="Reglas de precio"
                            className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-colors"
                          >
                            <Tag size={14} />
                          </button>
                          {/* Eliminar */}
                          <button
                            onClick={() => { setDeleteProduct(product); setDeleteModal(true) }}
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
            <Pagination pagination={pagination} onPageChange={setPage} />
          </div>
        )}
      </div>

      {/* Modal crear/editar */}
      <ProductModal
        open={productModal}
        onClose={() => { setProductModal(false); setEditProduct(null) }}
        onSaved={fetchProducts}
        product={editProduct}
      />

      {/* Modal ajuste de stock */}
      <AdjustStockModal
        open={adjustModal}
        onClose={() => { setAdjustModal(false); setAdjustProduct(null) }}
        onSaved={fetchProducts}
        product={adjustProduct}
      />

      {/* Confirm eliminar */}
      <ConfirmDialog
        open={deleteModal}
        onClose={() => { setDeleteModal(false); setDeleteProduct(null) }}
        onConfirm={handleDelete}
        title="Eliminar producto"
        message={`¿Estás seguro que querés eliminar "${deleteProduct?.name}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        loading={deleting}
        danger
      />

      <ProductPriceRulesModal
        open={priceRulesModal}
        onClose={() => { setPriceRulesModal(false); setPriceRulesProduct(null) }}
        product={priceRulesProduct}
      />

    </AppShell>
  )
}
