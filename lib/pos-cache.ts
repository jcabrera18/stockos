/**
 * Cache local para el POS.
 *
 * Flujo principal:
 *   scan barcode → resolveBarcode() → IndexedDB (<5ms)
 *                                   ↓ no encontrado
 *                              server fallback → cacheProductFromScan()
 *
 * Pricing local replica exactamente get_price_for_product() del server:
 *   1. Auto-selecciona la lista con el mayor min_quantity aplicable a la cantidad
 *   2. Chequea si hay price_rule específica del producto para esa lista
 *   3. Aplica el margen correspondiente
 *
 * Ambos (priceListsMemory y rulesMemory) son Maps en memoria construidos
 * desde IndexedDB al init, para que computeLocalPrice sea SÍNCRONO.
 */
import { api } from '@/lib/api'
import { posDB, type LocalPriceList, type LocalPriceRule } from '@/lib/pos-db'
import type { Product } from '@/types'
import type { Promotion } from '@/lib/promoUtils'

// ── Tipos exportados ──────────────────────────────────────────────────────────

export interface PricingResult {
  price: number
  list_name: string
  margin_pct: number
  rule_source: string
}

export interface ScanResult {
  product: Product
  pricing: PricingResult
}

// ── Caches en memoria ─────────────────────────────────────────────────────────
//
// Se construyen desde IndexedDB al init y al cada sync.
// Permiten que computeLocalPrice sea completamente síncrono.

// Listas ordenadas por min_quantity DESC para que find() retorne la más específica
let priceListsMemory: LocalPriceList[] = []

// Map: product_id → reglas ordenadas por min_quantity DESC
const rulesMemory = new Map<string, LocalPriceRule[]>()

async function buildMemoryCaches(): Promise<void> {
  // Price lists — ordenadas por min_quantity DESC
  const lists = await posDB.priceLists.toArray()
  priceListsMemory = lists.sort((a, b) => (b.min_quantity ?? 1) - (a.min_quantity ?? 1))

  // Price rules — agrupadas por product_id, ordenadas por min_quantity DESC
  const rules = await posDB.priceRules.toArray()
  rulesMemory.clear()
  for (const rule of rules) {
    const existing = rulesMemory.get(rule.product_id)
    if (existing) {
      existing.push(rule)
    } else {
      rulesMemory.set(rule.product_id, [rule])
    }
  }
  for (const group of rulesMemory.values()) {
    group.sort((a, b) => b.min_quantity - a.min_quantity)
  }
}

// ── Auto-selección de lista por cantidad ──────────────────────────────────────

/**
 * Replica la lógica del server: de todas las listas activas,
 * selecciona la que tiene el mayor min_quantity aplicable a la cantidad dada.
 *
 * Ejemplo con qty=6:
 *   Lista A min_qty=1 → elegible
 *   Lista B min_qty=3 → elegible
 *   Lista C min_qty=5 → elegible ← ganadora (más específica)
 */
function selectBestPriceList(quantity: number): LocalPriceList | null {
  if (priceListsMemory.length === 0) return null

  // priceListsMemory ya está ordenado DESC por min_quantity
  const applicable = priceListsMemory.find(l => (l.min_quantity ?? 1) <= quantity)
  if (applicable) return applicable

  // Fallback: lista default o la primera disponible
  return priceListsMemory.find(l => l.is_default) ?? priceListsMemory[0] ?? null
}

// ── Precio local ──────────────────────────────────────────────────────────────

/**
 * Calcula precio local sin llamada al servidor — SÍNCRONO.
 *
 * Replica get_price_for_product() del server:
 *   1. Si el producto tiene precio fijo → sell_price
 *   2. Auto-selecciona mejor lista según quantity (min_quantity más específico)
 *   3. Si hay price_rule específica del producto para esa lista → la aplica
 *   4. Fallback a sell_price
 */
export function computeLocalPrice(
  product: Product,
  quantity: number = 1,
): PricingResult {
  if (product.use_fixed_sell_price) {
    return { price: product.sell_price, list_name: 'Precio fijo', margin_pct: 0, rule_source: 'fixed' }
  }

  // Primero: reglas específicas del producto (independiente de la lista global)
  // Ordenadas DESC por min_quantity → el find retorna la más específica aplicable
  const productRules = rulesMemory.get(product.id)
  if (productRules) {
    const rule = productRules.find(r => r.min_quantity <= quantity)
    if (rule) {
      const price = Math.round(product.cost_price * (1 + rule.margin_pct / 100) * 100) / 100
      return { price, list_name: rule.list_name, margin_pct: rule.margin_pct, rule_source: 'rule' }
    }
  }

  // Sin regla de producto → selección global por cantidad
  const list = selectBestPriceList(quantity)
  if (list) {
    const price = Math.round(product.cost_price * (1 + list.margin_pct / 100) * 100) / 100
    return { price, list_name: list.name, margin_pct: list.margin_pct, rule_source: 'list' }
  }

  return { price: product.sell_price, list_name: 'Precio base', margin_pct: 0, rule_source: 'base' }
}

// ── Scan local ────────────────────────────────────────────────────────────────

/**
 * Lookup de barcode en IndexedDB local.
 * Retorna null si no está en cache → el caller hace fallback al server.
 */
export async function resolveBarcode(
  barcode: string,
  quantity: number = 1,
): Promise<ScanResult | null> {
  try {
    const entry = await posDB.barcodes.get(barcode)
    if (!entry) return null

    const product = await posDB.products.get(entry.product_id)
    if (!product) return null

    return { product, pricing: computeLocalPrice(product, quantity) }
  } catch {
    return null
  }
}

// ── Búsqueda local ────────────────────────────────────────────────────────────

/**
 * Búsqueda de texto en el catálogo local.
 * Retorna array vacío si el cache está vacío → el caller puede hacer fallback al server.
 */
export async function searchProductsLocal(query: string, limit = 8): Promise<Product[]> {
  try {
    const q = query.toLowerCase()
    return posDB.products
      .filter(
        p =>
          p.is_active !== false &&
          (p.name.toLowerCase().includes(q) ||
            (p.barcode ?? '').includes(q) ||
            (p.sku ?? '').toLowerCase().includes(q)),
      )
      .limit(limit)
      .toArray()
  } catch {
    return []
  }
}

export async function getVariablePriceProducts(): Promise<Product[]> {
  try {
    return posDB.products
      .filter(p => p.is_active !== false && p.price_mode === 'custom')
      .toArray()
  } catch {
    return []
  }
}

// ── Lectura desde cache ───────────────────────────────────────────────────────

export async function getLocalPromotions(): Promise<Promotion[]> {
  try {
    return posDB.promotions.filter(p => p.is_active).toArray()
  } catch {
    return []
  }
}

// ── Cache de producto desde scan server ───────────────────────────────────────

/**
 * Cuando el server resuelve un barcode desconocido localmente,
 * lo guardamos para que el próximo scan sea instantáneo.
 */
export async function cacheProductFromScan(product: Product): Promise<void> {
  try {
    await posDB.products.put(product)
    const entries: { barcode: string; product_id: string }[] = []
    if (product.barcode) entries.push({ barcode: product.barcode, product_id: product.id })
    for (const bc of product.product_barcodes ?? []) {
      if (bc.barcode && bc.barcode !== product.barcode) {
        entries.push({ barcode: bc.barcode, product_id: product.id })
      }
    }
    if (entries.length > 0) await posDB.barcodes.bulkPut(entries)
  } catch {
    // non-blocking
  }
}

// ── Sync con backend ──────────────────────────────────────────────────────────

async function fetchAllProducts(warehouseId?: string | null, since?: string): Promise<Product[]> {
  const params = {
    limit: 500,
    ...(warehouseId ? { warehouse_id: warehouseId } : {}),
    ...(since ? { updated_since: since } : {}),
  }

  // Página 1 para conocer el total
  const first = await api.get<{ data: Product[]; pagination: { pages: number } }>(
    '/api/products', { ...params, page: 1 },
  )
  const totalPages = first.pagination.pages
  if (totalPages <= 1) return first.data

  // Resto de páginas en paralelo
  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) =>
      api.get<{ data: Product[]; pagination: { pages: number } }>(
        '/api/products', { ...params, page: i + 2 },
      )
    )
  )

  return [...first.data, ...rest.flatMap(r => r.data)]
}

export async function syncProducts(warehouseId?: string | null): Promise<void> {
  const meta = await posDB.syncMeta.get('products')
  const since = meta?.synced_at  // undefined en el primer sync → descarga todo

  const now = new Date().toISOString()
  const products = await fetchAllProducts(warehouseId, since)

  if (products.length === 0) {
    // Sin cambios desde el último sync — solo actualizar el timestamp
    await posDB.syncMeta.put({ key: 'products', synced_at: now })
    return
  }

  const barcodeEntries: { barcode: string; product_id: string }[] = []
  for (const p of products) {
    if (p.barcode) barcodeEntries.push({ barcode: p.barcode, product_id: p.id })
    for (const bc of p.product_barcodes ?? []) {
      if (bc.barcode && bc.barcode !== p.barcode) {
        barcodeEntries.push({ barcode: bc.barcode, product_id: p.id })
      }
    }
  }

  await posDB.transaction('rw', posDB.products, posDB.barcodes, posDB.syncMeta, async () => {
    await posDB.products.bulkPut(products)
    if (barcodeEntries.length > 0) await posDB.barcodes.bulkPut(barcodeEntries)
    await posDB.syncMeta.put({ key: 'products', synced_at: now })
  })
}

export async function syncPromotions(): Promise<void> {
  const data = await api.get<Promotion[]>('/api/promotions')
  await posDB.transaction('rw', posDB.promotions, posDB.syncMeta, async () => {
    await posDB.promotions.clear()
    if (data.length > 0) await posDB.promotions.bulkPut(data)
    await posDB.syncMeta.put({ key: 'promotions', synced_at: new Date().toISOString() })
  })
}

async function syncPriceLists(): Promise<void> {
  const data = await api.get<LocalPriceList[]>('/api/price-lists')
  await posDB.transaction('rw', posDB.priceLists, posDB.syncMeta, async () => {
    await posDB.priceLists.clear()
    if (data.length > 0) await posDB.priceLists.bulkPut(data)
    await posDB.syncMeta.put({ key: 'price_lists', synced_at: new Date().toISOString() })
  })
}

/**
 * Sincroniza todas las reglas de precio del negocio.
 *
 * Requiere endpoint en el backend:
 *   GET /api/products/price-rules
 *   Response: { id, product_id, price_list_id, min_quantity,
 *               price_lists: { name, margin_pct } }[]
 *
 * Falla silenciosamente si el endpoint no existe aún.
 */
async function syncPriceRules(): Promise<void> {
  const raw = await api.get<{
    id: string
    product_id: string
    price_list_id: string
    min_quantity: number
    price_lists: { name: string; margin_pct: number }
  }[]>('/api/products/price-rules')

  const rules: LocalPriceRule[] = raw.map(r => ({
    id:            r.id,
    product_id:    r.product_id,
    price_list_id: r.price_list_id,
    min_quantity:  r.min_quantity,
    margin_pct:    r.price_lists.margin_pct,
    list_name:     r.price_lists.name,
  }))

  await posDB.transaction('rw', posDB.priceRules, posDB.syncMeta, async () => {
    await posDB.priceRules.clear()
    if (rules.length > 0) await posDB.priceRules.bulkPut(rules)
    await posDB.syncMeta.put({ key: 'price_rules', synced_at: new Date().toISOString() })
  })
}

// ── Helpers públicos ─────────────────────────────────────────────────────────

export async function getLastSyncTime(): Promise<Date | null> {
  try {
    const meta = await posDB.syncMeta.get('products')
    return meta ? new Date(meta.synced_at) : null
  } catch {
    return null
  }
}

// ── API pública de sync ───────────────────────────────────────────────────────

/** Primera carga: descarga catálogo completo + construye caches en memoria. */
export async function initPOSCache(warehouseId?: string | null): Promise<void> {
  await buildMemoryCaches()

  await Promise.all([
    syncProducts(warehouseId),
    syncPromotions(),
    syncPriceLists(),
    syncPriceRules().catch(() => {}),
  ])

  await buildMemoryCaches()
}

/** Refresh en background — falla silenciosa por servicio, el POS sigue funcionando. */
export async function syncPOSCache(warehouseId?: string | null): Promise<void> {
  await Promise.all([
    syncProducts(warehouseId).catch(() => {}),
    syncPromotions().catch(() => {}),
    syncPriceLists().catch(() => {}),
    syncPriceRules().catch(() => {}),
  ])
  await buildMemoryCaches()
}
