import { api } from '@/lib/api'
import type { OnbCounts, OnbMeta } from './types'

// ─────────────────────────────────────────────────────────────
// Deriva los contadores del onboarding REUTILIZANDO endpoints
// existentes (decisión de arquitectura: sin endpoint de agregación).
//
// · Paginados devuelven { data, pagination: { total } } → pedimos
//   limit=1 y leemos pagination.total (payload mínimo).
// · Los que son array plano → usamos .length.
//
// Todo corre con Promise.allSettled: si un endpoint falla, ese count
// queda `undefined` y la misión asociada simplemente no se completa,
// sin romper la tarjeta.
// ─────────────────────────────────────────────────────────────

interface Paginated { pagination?: { total?: number } }

/** Total de un endpoint paginado (limit=1) */
async function total(path: string, params: Record<string, string | number | boolean> = {}): Promise<number> {
  const res = await api.get<Paginated>(path, { ...params, limit: 1 })
  return res.pagination?.total ?? 0
}

/** Largo de un endpoint que devuelve array plano */
async function len(path: string): Promise<number> {
  const res = await api.get<unknown[]>(path)
  return Array.isArray(res) ? res.length : 0
}

/** settle: corre un probe y devuelve el número o undefined si falla */
async function settle(fn: () => Promise<number>): Promise<number | undefined> {
  try { return await fn() } catch { return undefined }
}

export async function fetchOnboardingCounts(meta: OnbMeta): Promise<OnbCounts> {
  const [
    categories, products, sales, suppliers, purchases, customers,
    expenses, cc_accounts, cash_closes, quotes, orders, promotions,
    users, branches, warehouses,
  ] = await Promise.all([
    settle(() => len('/api/products/categories')),
    settle(() => total('/api/products')),
    settle(() => total('/api/sales')),
    settle(() => len('/api/purchases/suppliers')),
    settle(() => total('/api/purchases')),
    settle(() => total('/api/customers')),
    settle(() => total('/api/finances/expenses')),
    settle(() => total('/api/customers', { with_balance: true })),
    settle(() => total('/api/cash-register')),
    settle(() => total('/api/quotes')),
    settle(() => total('/api/orders')),
    settle(() => len('/api/promotions')),
    settle(() => len('/api/auth/users')),
    settle(() => len('/api/branches')),
    settle(() => len('/api/warehouses')),
  ])

  return {
    categories, products, sales, suppliers, purchases, customers,
    expenses, cc_accounts, cash_closes, quotes, orders, promotions,
    users, branches, warehouses,
    // Eventos que no derivan de una tabla → vienen del meta local
    labels_printed:   meta.events.labels_printed ?? 0,
    excel_exports:    meta.events.excel_exports ?? 0,
    barcodes_scanned: meta.events.barcodes_scanned ?? 0,
  }
}
