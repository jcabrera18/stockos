/**
 * Base de datos IndexedDB local para el POS.
 * Usa Dexie.js para indexar productos y barcodes y permitir
 * scan offline y búsqueda sin latencia de red.
 */
import Dexie, { type Table } from 'dexie'
import type { Product, StockSummary } from '@/types'
import type { Promotion } from '@/lib/promoUtils'
import type { CustomerSummary } from '@/app/customers/page'

export interface LocalBarcode {
  barcode: string     // PK — get() es O(1), sub-5ms garantizado
  product_id: string
}

export interface LocalPriceList {
  id: string
  name: string
  margin_pct: number
  min_quantity: number | null   // null = lista manual (no se auto-aplica por cantidad)
  is_default: boolean
}

export interface LocalPriceRule {
  id: string
  product_id: string
  price_list_id: string
  min_quantity: number
  margin_pct: number   // aplanado desde price_lists join
  list_name: string    // aplanado desde price_lists join
}

export interface LocalPriceOverride {
  id: string           // `${product_id}::${price_list_id}`
  product_id: string
  price_list_id: string
  price: number
}

export interface SyncMeta {
  key: string
  synced_at: string
}

export interface PendingSale {
  id: string                              // local UUID
  created_at: string
  payload: Record<string, unknown>        // cuerpo del POST /api/sales
  customer_charge?: { customer_id: string; amount: number }  // solo para cuenta_corriente
  status: 'pending' | 'failed'
  retry_count: number
  last_error?: string
}

export interface PendingOrder {
  id: string                              // local UUID
  created_at: string
  customer_name: string                   // para mostrar en el banner de pendientes
  payload: Record<string, unknown>        // cuerpo del POST /api/orders
  status: 'pending' | 'failed'
  retry_count: number
  last_error?: string
}

class POSDatabase extends Dexie {
  products!: Table<Product>
  catalogProducts!: Table<StockSummary>
  barcodes!: Table<LocalBarcode>
  priceLists!: Table<LocalPriceList>
  priceRules!: Table<LocalPriceRule>
  priceOverrides!: Table<LocalPriceOverride>
  promotions!: Table<Promotion>
  customers!: Table<CustomerSummary>
  syncMeta!: Table<SyncMeta>
  pendingSales!: Table<PendingSale>
  pendingOrders!: Table<PendingOrder>

  constructor() {
    super('stockos_pos')
    this.version(1).stores({
      products:   'id, name, barcode, updated_at',
      barcodes:   'barcode, product_id',
      priceLists: 'id',
      priceRules: 'id, product_id, price_list_id',
      promotions: 'id, scope, scope_id',
      syncMeta:   'key',
    })
    this.version(2).stores({
      products:     'id, name, barcode, updated_at',
      barcodes:     'barcode, product_id',
      priceLists:   'id',
      priceRules:   'id, product_id, price_list_id',
      promotions:   'id, scope, scope_id',
      syncMeta:     'key',
      pendingSales: 'id, status, created_at',
    })
    this.version(3).stores({
      products:       'id, name, barcode, updated_at',
      barcodes:       'barcode, product_id',
      priceLists:     'id',
      priceRules:     'id, product_id, price_list_id',
      priceOverrides: 'id, product_id',
      promotions:     'id, scope, scope_id',
      syncMeta:       'key',
      pendingSales:   'id, status, created_at',
    })
    this.version(4).stores({
      products:       'id, name, barcode, updated_at',
      barcodes:       'barcode, product_id',
      priceLists:     'id',
      priceRules:     'id, product_id, price_list_id',
      priceOverrides: 'id, product_id',
      promotions:     'id, scope, scope_id',
      customers:      'id, full_name, document, phone, customer_code',
      syncMeta:       'key',
      pendingSales:   'id, status, created_at',
    })
    this.version(5).stores({
      products:       'id, name, barcode, updated_at',
      barcodes:       'barcode, product_id',
      priceLists:     'id',
      priceRules:     'id, product_id, price_list_id',
      priceOverrides: 'id, product_id',
      promotions:     'id, scope, scope_id',
      customers:      'id, full_name, document, phone, customer_code',
      syncMeta:       'key',
      pendingSales:   'id, status, created_at',
      pendingOrders:  'id, status, created_at',
    })
    // catalogProducts: catálogo business-wide (stock agregado, sin warehouse_id)
    // para la página /products. Separado del store `products` del POS, que guarda
    // stock por depósito y rompería la semántica business-wide de la grilla admin.
    this.version(6).stores({
      products:        'id, name, barcode, updated_at',
      catalogProducts: 'id, name, sku, barcode, updated_at',
      barcodes:        'barcode, product_id',
      priceLists:      'id',
      priceRules:      'id, product_id, price_list_id',
      priceOverrides:  'id, product_id',
      promotions:      'id, scope, scope_id',
      customers:       'id, full_name, document, phone, customer_code',
      syncMeta:        'key',
      pendingSales:    'id, status, created_at',
      pendingOrders:   'id, status, created_at',
    })
  }
}

export const posDB = new POSDatabase()
