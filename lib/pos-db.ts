/**
 * Base de datos IndexedDB local para el POS.
 * Usa Dexie.js para indexar productos y barcodes y permitir
 * scan offline y búsqueda sin latencia de red.
 */
import Dexie, { type Table } from 'dexie'
import type { Product } from '@/types'
import type { Promotion } from '@/lib/promoUtils'

export interface LocalBarcode {
  barcode: string     // PK — get() es O(1), sub-5ms garantizado
  product_id: string
}

export interface LocalPriceList {
  id: string
  name: string
  margin_pct: number
  min_quantity: number
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

export interface SyncMeta {
  key: string
  synced_at: string
}

class POSDatabase extends Dexie {
  products!: Table<Product>
  barcodes!: Table<LocalBarcode>
  priceLists!: Table<LocalPriceList>
  priceRules!: Table<LocalPriceRule>
  promotions!: Table<Promotion>
  syncMeta!: Table<SyncMeta>

  constructor() {
    super('stockos_pos')
    this.version(1).stores({
      products:   'id, name, barcode, updated_at',
      barcodes:   'barcode, product_id',
      priceLists: 'id',
      priceRules: 'id, product_id, price_list_id',  // compound lookup por product+list
      promotions: 'id, scope, scope_id',
      syncMeta:   'key',
    })
  }
}

export const posDB = new POSDatabase()
