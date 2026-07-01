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
import { posDB, type LocalPriceList, type LocalPriceRule, type LocalPriceOverride } from '@/lib/pos-db'
import type { Product, PaginatedResponse } from '@/types'
import type { Promotion } from '@/lib/promoUtils'
import type { CustomerSummary } from '@/app/customers/page'

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

// Map: product_id → Map<price_list_id, price>
const overridesMemory = new Map<string, Map<string, number>>()

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

  // Price overrides
  const overrides = await posDB.priceOverrides.toArray()
  overridesMemory.clear()
  for (const ov of overrides) {
    let inner = overridesMemory.get(ov.product_id)
    if (!inner) { inner = new Map(); overridesMemory.set(ov.product_id, inner) }
    inner.set(ov.price_list_id, ov.price)
  }
}

// ── Precio local ──────────────────────────────────────────────────────────────

/**
 * Calcula precio local sin llamada al servidor — SÍNCRONO.
 *
 * Replica get_price_for_product() del server:
 *   1. Si el producto tiene precio fijo → sell_price
 *   2. Si el producto tiene reglas propias ("desde X"): SOLO esas reglas arman los
 *      tramos — las cantidades globales de las listas se ignoran. Gana la regla con
 *      el mayor "desde" aplicable a la cantidad.
 *      Si NO tiene reglas propias: se usan las cantidades globales de las listas.
 *   3. Si la lista ganadora tiene override de precio para el producto → lo aplica.
 *   4. Fallback (nada aplica a esa cantidad): lista default o sell_price.
 */
export function computeLocalPrice(
  product: Product,
  quantity: number = 1,
): PricingResult {
  if (product.use_fixed_sell_price) {
    return { price: product.sell_price, list_name: 'Precio fijo', margin_pct: 0, rule_source: 'fixed' }
  }

  const productOverrides = overridesMemory.get(product.id)
  const productRules = rulesMemory.get(product.id)
  const priceFor = (listId: string, marginPct: number) =>
    productOverrides?.get(listId) ?? Math.round(product.cost_price * (1 + marginPct / 100) * 100) / 100

  if (productRules && productRules.length > 0) {
    // Reglas propias → solo ellas definen los tramos (globales ignoradas).
    // productRules ya viene ordenado DESC por min_quantity → el primero aplicable manda.
    const rule = productRules.find(r => r.min_quantity <= quantity)
    if (rule) {
      const override = productOverrides?.get(rule.price_list_id)
      return {
        price: priceFor(rule.price_list_id, rule.margin_pct),
        list_name: rule.list_name,
        margin_pct: rule.margin_pct,
        rule_source: override != null ? 'override' : 'rule',
      }
    }
    // Ninguna regla aplica a esta cantidad → cae al default abajo.
  } else {
    // Sin reglas propias → selección por cantidad global de las listas.
    let best: LocalPriceList | null = null
    let bestQty = -1
    for (const list of priceListsMemory) {
      const eff = list.min_quantity
      if (eff == null) continue      // lista manual → nunca se auto-aplica
      if (eff > quantity) continue
      if (eff > bestQty) { bestQty = eff; best = list }
    }
    if (best) {
      const override = productOverrides?.get(best.id)
      return {
        price: priceFor(best.id, best.margin_pct),
        list_name: best.name,
        margin_pct: best.margin_pct,
        rule_source: override != null ? 'override' : 'list',
      }
    }
  }

  // Fallback: lista default (aunque sea manual) → precio base de la lista.
  const def = priceListsMemory.find(l => l.is_default)
  if (def) {
    const override = productOverrides?.get(def.id)
    return {
      price: priceFor(def.id, def.margin_pct),
      list_name: def.name,
      margin_pct: def.margin_pct,
      rule_source: override != null ? 'override' : 'default',
    }
  }

  return { price: product.sell_price, list_name: 'Precio base', margin_pct: 0, rule_source: 'base' }
}

/**
 * Precio de un producto para una lista PUNTUAL (selección manual en el POS/pedido).
 * Respeta el override por producto para esa lista; si no hay, aplica el margen.
 * No mira cantidades ni reglas — la lista la eligió el usuario a mano.
 */
export function priceForProductList(
  product: Product,
  list: { id: string; margin_pct: number },
): number {
  if (product.use_fixed_sell_price) return product.sell_price
  const override = overridesMemory.get(product.id)?.get(list.id)
  return override ?? Math.round(product.cost_price * (1 + list.margin_pct / 100) * 100) / 100
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
    // Producto dado de baja que quedó en cache (ej. borrado mientras el POS seguía
    // abierto, antes del próximo full sync): no resolverlo → "no le da bola".
    if (product.is_active === false) return null

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
    const matches = await posDB.products
      .filter(
        p =>
          p.is_active !== false &&
          (p.name.toLowerCase().includes(q) ||
            (p.barcode ?? '').includes(q) ||
            (p.sku ?? '').toLowerCase().includes(q)),
      )
      .toArray()
    // Relevancia: primero los productos cuyo nombre EMPIEZA con la query
    // (lo más probable que el usuario busca), luego orden alfabético. Sin esto,
    // con pocas letras el producto deseado podía quedar fuera del límite.
    matches.sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1
      const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1
      if (aStarts !== bStarts) return aStarts - bStarts
      return a.name.localeCompare(b.name)
    })
    return matches.slice(0, limit)
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

// ── Búsqueda local de clientes ─────────────────────────────────────────────────

/**
 * Búsqueda de clientes en IndexedDB local.
 * Permite seleccionar cliente para cuenta corriente sin conexión y da
 * resultados instantáneos en el POS. Retorna [] si el cache está vacío
 * → el caller puede hacer fallback al server.
 */
export async function searchCustomersLocal(query: string, limit = 8): Promise<CustomerSummary[]> {
  try {
    const q = query.toLowerCase()
    return posDB.customers
      .filter(
        c =>
          c.is_active !== false &&
          (c.full_name.toLowerCase().includes(q) ||
            (c.razon_social ?? '').toLowerCase().includes(q) ||
            (c.nombre_fantasia ?? '').toLowerCase().includes(q) ||
            (c.document ?? '').includes(q) ||
            (c.phone ?? '').includes(q) ||
            (c.customer_code ?? '').toLowerCase().includes(q)),
      )
      .limit(limit)
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

/**
 * Sincroniza productos + barcodes a IndexedDB.
 *
 * - `full`: descarga completa con reemplazo (clear + bulkPut). Se usa al ENTRAR al POS
 *   → trae todo fresco y **poda las bajas** hechas en este u otros dispositivos. El
 *   backend hace soft-delete y el producto desaparece de /api/products, así que el sync
 *   incremental (que solo trae lo modificado) nunca lo vería desaparecer y quedaría en
 *   cache para siempre — apareciendo en el POS de cobro. El full clear lo resuelve.
 * - sin `full`: incremental por `updated_since` → barato, para el refresh en background.
 *   También se fuerza si el store está vacío (self-heal del cursor envenenado: un sync
 *   previo recibió vacío y guardó el timestamp → el POS quedaría sin productos).
 */
export async function syncProducts(
  warehouseId?: string | null,
  opts: { full?: boolean } = {},
): Promise<void> {
  const meta = await posDB.syncMeta.get('products')
  const now = new Date().toISOString()

  const cachedCount = await posDB.products.count()
  const fullFetch = opts.full || cachedCount === 0
  const since = fullFetch ? undefined : meta?.synced_at

  const products = await fetchAllProducts(warehouseId, since)

  if (!fullFetch && products.length === 0) {
    // Sin cambios desde el último sync — solo actualizar el timestamp
    await posDB.syncMeta.put({ key: 'products', synced_at: now })
    return
  }

  const active = products.filter(p => p.is_active !== false)
  const inactiveIds = products.filter(p => p.is_active === false).map(p => p.id)

  const barcodeEntries: { barcode: string; product_id: string }[] = []
  for (const p of active) {
    if (p.barcode) barcodeEntries.push({ barcode: p.barcode, product_id: p.id })
    for (const bc of p.product_barcodes ?? []) {
      if (bc.barcode && bc.barcode !== p.barcode) {
        barcodeEntries.push({ barcode: bc.barcode, product_id: p.id })
      }
    }
  }

  await posDB.transaction('rw', posDB.products, posDB.barcodes, posDB.syncMeta, async () => {
    if (fullFetch) {
      // Reemplazo total → poda los productos que ya no existen.
      await posDB.products.clear()
      await posDB.barcodes.clear()
    } else if (inactiveIds.length > 0) {
      // Incremental: remover los que vinieron dados de baja + sus barcodes.
      await posDB.products.bulkDelete(inactiveIds)
      const stale = await posDB.barcodes.where('product_id').anyOf(inactiveIds).toArray()
      if (stale.length > 0) await posDB.barcodes.bulkDelete(stale.map(b => b.barcode))
    }
    if (active.length > 0) await posDB.products.bulkPut(active)
    if (barcodeEntries.length > 0) await posDB.barcodes.bulkPut(barcodeEntries)
    await posDB.syncMeta.put({ key: 'products', synced_at: now })
  })
}

/**
 * Remueve un producto del cache del POS al instante tras un delete (soft-delete en el
 * backend). Sin esto, el producto seguiría en el cache hasta el próximo full sync.
 */
export async function removeProductFromPOS(id: string): Promise<void> {
  try {
    await posDB.transaction('rw', posDB.products, posDB.barcodes, async () => {
      await posDB.products.delete(id)
      const stale = await posDB.barcodes.where('product_id').equals(id).toArray()
      if (stale.length > 0) await posDB.barcodes.bulkDelete(stale.map(b => b.barcode))
    })
  } catch {
    // non-blocking
  }
}

/**
 * Sincroniza el padrón completo de clientes a IndexedDB.
 * Trae todas las páginas para que la búsqueda local y la venta a cuenta
 * corriente funcionen sin conexión.
 */
export async function syncCustomers(): Promise<void> {
  const PAGE_SIZE = 100

  const first = await api.get<PaginatedResponse<CustomerSummary>>(
    '/api/customers', { limit: PAGE_SIZE, page: 1 },
  )
  const totalPages = first.pagination.pages

  let customers = first.data
  if (totalPages > 1) {
    const rest = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, i) =>
        api.get<PaginatedResponse<CustomerSummary>>(
          '/api/customers', { limit: PAGE_SIZE, page: i + 2 },
        )
      )
    )
    customers = [...first.data, ...rest.flatMap(r => r.data)]
  }

  await posDB.transaction('rw', posDB.customers, posDB.syncMeta, async () => {
    await posDB.customers.clear()
    if (customers.length > 0) await posDB.customers.bulkPut(customers)
    await posDB.syncMeta.put({ key: 'customers', synced_at: new Date().toISOString() })
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

async function syncPriceOverrides(): Promise<void> {
  const raw = await api.get<{ product_id: string; price_list_id: string; price: number }[]>(
    '/api/products/price-overrides'
  )

  const overrides: LocalPriceOverride[] = raw.map(r => ({
    id:            `${r.product_id}::${r.price_list_id}`,
    product_id:    r.product_id,
    price_list_id: r.price_list_id,
    price:         r.price,
  }))

  await posDB.transaction('rw', posDB.priceOverrides, posDB.syncMeta, async () => {
    await posDB.priceOverrides.clear()
    if (overrides.length > 0) await posDB.priceOverrides.bulkPut(overrides)
    await posDB.syncMeta.put({ key: 'price_overrides', synced_at: new Date().toISOString() })
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
    // full: poda bajas hechas desde el último uso del POS en este dispositivo.
    syncProducts(warehouseId, { full: true }),
    syncPromotions(),
    syncPriceLists(),
    syncCustomers().catch(() => {}),
    syncPriceRules().catch(() => {}),
    syncPriceOverrides().catch(() => {}),
  ])

  await buildMemoryCaches()
}

/** Refresh en background — falla silenciosa por servicio, el POS sigue funcionando. */
export async function syncPOSCache(warehouseId?: string | null): Promise<void> {
  await Promise.all([
    syncProducts(warehouseId).catch(() => {}),
    syncPromotions().catch(() => {}),
    syncPriceLists().catch(() => {}),
    syncCustomers().catch(() => {}),
    syncPriceRules().catch(() => {}),
    syncPriceOverrides().catch(() => {}),
  ])
  await buildMemoryCaches()
}
