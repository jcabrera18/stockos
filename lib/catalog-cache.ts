/**
 * Cache local del catálogo de productos para la página /products.
 *
 * Reemplaza la latencia de red (hasta ~2s por request al server) por búsqueda,
 * filtrado, orden y paginación 100% en cliente sobre el catálogo cacheado en
 * IndexedDB. El catálogo se sincroniza en background cada pocos minutos.
 *
 * Es business-wide (stock agregado de todos los depósitos), igual que el endpoint
 * GET /api/products sin warehouse_id. Por eso usa un store propio (catalogProducts)
 * y NO el `products` del POS, que guarda stock por depósito.
 *
 * Consistencia de escritura: las mutaciones de la página (crear/editar/borrar)
 * actualizan el cache local al instante vía forceSync()/removeCatalogProduct(),
 * para que el usuario vea su propio cambio sin esperar al próximo sync.
 */
import { api } from '@/lib/api'
import { posDB } from '@/lib/pos-db'
import type { StockSummary, Pagination } from '@/types'

// ── Cache en memoria ───────────────────────────────────────────────────────────
// Se construye desde IndexedDB al init y tras cada sync, para que queryCatalog
// sea completamente síncrono (sin await en el render path de búsqueda).

let catalogMemory: StockSummary[] = []
let memoryLoaded = false

async function buildMemory(): Promise<void> {
  catalogMemory = await posDB.catalogProducts.toArray()
  memoryLoaded = true
}

export function isCatalogReady(): boolean {
  return memoryLoaded
}

// ── Consulta local ──────────────────────────────────────────────────────────────

export type CatalogSortField = 'name' | 'sku' | 'sell_price' | 'cost_price' | 'stock_current'

export interface CatalogQuery {
  search?: string
  brand_id?: string
  supplier_id?: string
  /** Set de category_id + descendientes, resuelto por el caller (que tiene el árbol). */
  categoryIds?: Set<string>
  stock_status?: string
  min_price?: number
  max_price?: number
  sort_by: CatalogSortField
  sort_dir: 'asc' | 'desc'
  page: number
  limit: number
}

export interface CatalogResult {
  data: StockSummary[]
  pagination: Pagination
}

/**
 * Replica la lógica de filtrado/orden/paginación del backend (GET /api/products
 * sobre v_stock_summary) en cliente. Síncrono — sub-ms sobre miles de productos.
 */
export function queryCatalog(q: CatalogQuery): CatalogResult {
  const search = q.search?.trim().toLowerCase()

  let rows = catalogMemory.filter(p => {
    if (q.categoryIds && !(p.category_id && q.categoryIds.has(p.category_id))) return false
    if (q.supplier_id && p.supplier_id !== q.supplier_id) return false
    if (q.brand_id && p.brand_id !== q.brand_id) return false
    if (q.stock_status && p.stock_status !== q.stock_status) return false
    // El backend filtra precio sobre sell_price (no sobre default_list_price)
    if (q.min_price !== undefined && p.sell_price < q.min_price) return false
    if (q.max_price !== undefined && p.sell_price > q.max_price) return false
    if (search) {
      const inName = p.name.toLowerCase().includes(search)
      const inSku = (p.sku ?? '').toLowerCase().includes(search)
      const inBarcode = (p.barcode ?? '').toLowerCase().includes(search)
      if (!inName && !inSku && !inBarcode) return false
    }
    return true
  })

  const dir = q.sort_dir === 'asc' ? 1 : -1
  rows = rows.sort((a, b) => {
    let av: string | number
    let bv: string | number
    switch (q.sort_by) {
      case 'sell_price':    av = a.sell_price;    bv = b.sell_price; break
      case 'cost_price':    av = a.cost_price;    bv = b.cost_price; break
      case 'stock_current': av = a.stock_current; bv = b.stock_current; break
      case 'sku':           av = (a.sku ?? '').toLowerCase();  bv = (b.sku ?? '').toLowerCase(); break
      default:              av = a.name.toLowerCase();         bv = b.name.toLowerCase()
    }
    if (av < bv) return -1 * dir
    if (av > bv) return 1 * dir
    return 0
  })

  const total = rows.length
  const pages = Math.max(1, Math.ceil(total / q.limit))
  const page = Math.min(q.page, pages)
  const start = (page - 1) * q.limit
  const data = rows.slice(start, start + q.limit)

  return { data, pagination: { total, page, limit: q.limit, pages } }
}

// ── Sync con backend ──────────────────────────────────────────────────────────

async function fetchAllCatalog(since?: string): Promise<StockSummary[]> {
  const params = {
    limit: 500,
    ...(since ? { updated_since: since } : {}),
  }

  const first = await api.get<{ data: StockSummary[]; pagination: { pages: number } }>(
    '/api/products', { ...params, page: 1 },
  )
  const totalPages = first.pagination.pages
  if (totalPages <= 1) return first.data

  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) =>
      api.get<{ data: StockSummary[]; pagination: { pages: number } }>(
        '/api/products', { ...params, page: i + 2 },
      )
    )
  )

  return [...first.data, ...rest.flatMap(r => r.data)]
}

/**
 * Sincroniza el catálogo. Incremental por `updated_since` (solo trae los productos
 * modificados desde el último sync), o completo en el primer sync.
 *
 * Nota: v_stock_summary filtra is_active=true, así que un producto soft-deleted
 * desaparece del endpoint y NO vuelve en un sync incremental. Las bajas hechas
 * desde esta misma sesión se reflejan vía removeCatalogProduct(). Las bajas de
 * otros dispositivos se resuelven en el próximo full sync (cache vacío o forzado).
 */
export async function syncCatalog(): Promise<void> {
  const meta = await posDB.syncMeta.get('catalog_products')
  const now = new Date().toISOString()

  // Self-heal de cursor envenenado: si hay cursor incremental pero el store está
  // VACÍO, significa que un sync previo recibió una respuesta vacía (ej. el service
  // worker sirviendo cache stale durante una caída del backend) y guardó el
  // timestamp. A partir de ahí cada sync incremental pregunta "¿qué cambió desde
  // entonces?" → nada → el catálogo queda vacío para siempre en ese dispositivo.
  // Si está vacío, ignoramos el cursor y hacemos full fetch para recuperarlo.
  const cachedCount = await posDB.catalogProducts.count()
  const since = cachedCount > 0 ? meta?.synced_at : undefined

  const products = await fetchAllCatalog(since)

  if (products.length > 0) {
    // Defensivo: si algún inactivo se colara, lo removemos en vez de guardarlo.
    const active = products.filter(p => p.is_active !== false)
    const inactiveIds = products.filter(p => p.is_active === false).map(p => p.id)
    await posDB.transaction('rw', posDB.catalogProducts, posDB.syncMeta, async () => {
      if (active.length > 0) await posDB.catalogProducts.bulkPut(active)
      if (inactiveIds.length > 0) await posDB.catalogProducts.bulkDelete(inactiveIds)
      await posDB.syncMeta.put({ key: 'catalog_products', synced_at: now })
    })
  } else {
    await posDB.syncMeta.put({ key: 'catalog_products', synced_at: now })
  }

  await buildMemory()
}

/**
 * Carga el cache en memoria desde IndexedDB y retorna si había datos cacheados.
 * Permite que la grilla quede "lista" al instante en visitas repetidas, mientras
 * el sync de red corre en background.
 */
export async function loadCatalogMemory(): Promise<boolean> {
  await buildMemory()
  return catalogMemory.length > 0
}

// ── Mutaciones locales ──────────────────────────────────────────────────────────

/** Remueve un producto del cache tras un delete (soft-delete en el backend). */
export async function removeCatalogProduct(id: string): Promise<void> {
  try {
    await posDB.catalogProducts.delete(id)
    catalogMemory = catalogMemory.filter(p => p.id !== id)
  } catch {
    // non-blocking
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────────

export async function getLastCatalogSync(): Promise<Date | null> {
  try {
    const meta = await posDB.syncMeta.get('catalog_products')
    return meta ? new Date(meta.synced_at) : null
  } catch {
    return null
  }
}
