/**
 * Lógica de evaluación de promociones portada al cliente.
 * Refleja exactamente las funciones calcPromotion / isActiveToday del backend
 * (stockos-api/src/modules/promotions/routes.ts).
 *
 * Al cachear las promos en el POS al abrir la caja, este módulo permite
 * evaluar descuentos sin ninguna llamada al servidor.
 */

export interface Promotion {
  id:          string
  name:        string
  type:        'percentage' | 'nxm' | 'second_half' | 'fixed_price'
  scope:       'all' | 'product' | 'brand' | 'category' | 'supplier'
  scope_id:    string | null
  config:      Record<string, unknown>
  active_from: string | null
  active_to:   string | null
  active_days: number[] | null
  is_active:   boolean
}

export interface PromoResult {
  discount:     number
  promo_label:  string
  promotion_id: string | null
}

function isActiveToday(p: Promotion): boolean {
  const today     = new Date()
  const todayDate = today.toISOString().split('T')[0]
  const todayDay  = today.getDay() // 0 = Domingo

  if (p.active_from && todayDate < p.active_from) return false
  if (p.active_to   && todayDate > p.active_to)   return false
  if (p.active_days && p.active_days.length > 0) {
    if (!p.active_days.includes(todayDay)) return false
  }
  return true
}

function calcPromo(
  p: Promotion,
  qty: number,
  unitPrice: number,
): { discount: number; label: string; applied: boolean } {
  const c = p.config

  if (p.type === 'percentage') {
    const pct      = Number(c.discount_pct ?? 0)
    const discount = Math.round(unitPrice * qty * (pct / 100) * 100) / 100
    return { discount, label: `${pct}% OFF`, applied: discount > 0 }
  }

  if (p.type === 'nxm') {
    const pay = Number(c.pay ?? 1)
    const get = Number(c.get ?? 1)
    if (get <= 0 || pay >= get) return { discount: 0, label: '', applied: false }
    const freeUnits = Math.floor(qty / get) * (get - pay)
    const discount  = Math.round(freeUnits * unitPrice * 100) / 100
    return { discount, label: `${get}x${pay}`, applied: discount > 0 }
  }

  if (p.type === 'second_half') {
    const pct      = Number(c.discount_pct ?? 50)
    const discount = Math.round(Math.floor(qty / 2) * unitPrice * (pct / 100) * 100) / 100
    return { discount, label: `2do al ${pct}%`, applied: discount > 0 }
  }

  if (p.type === 'fixed_price') {
    const promoQty   = Number(c.qty   ?? 1)
    const promoPrice = Number(c.price ?? unitPrice)
    if (qty < promoQty) return { discount: 0, label: '', applied: false }
    const sets     = Math.floor(qty / promoQty)
    const rem      = qty % promoQty
    const discount = Math.round(
      (unitPrice * qty - (sets * promoPrice + rem * unitPrice)) * 100
    ) / 100
    return { discount, label: `${promoQty} x $${promoPrice}`, applied: discount > 0 }
  }

  return { discount: 0, label: '', applied: false }
}

/**
 * Evalúa la mejor promoción aplicable a un producto dado qty y precio.
 * Retorna discount=0 si no hay promo activa.
 */
export function evaluatePromo(
  product: {
    id:          string
    brand_id?:    string | null
    category_id?: string | null
    supplier_id?: string | null
  },
  quantity:   number,
  unitPrice:  number,
  promotions: Promotion[],
): PromoResult {
  const applicable = promotions.filter(p => {
    if (!p.is_active)      return false
    if (!isActiveToday(p)) return false
    if (p.scope === 'all')      return true
    if (p.scope === 'product'  && p.scope_id === product.id)          return true
    if (p.scope === 'brand'    && p.scope_id === (product.brand_id ?? null))    return true
    if (p.scope === 'category' && p.scope_id === (product.category_id ?? null)) return true
    if (p.scope === 'supplier' && p.scope_id === (product.supplier_id ?? null)) return true
    return false
  })

  if (!applicable.length) return { discount: 0, promo_label: '', promotion_id: null }

  const results = applicable.map(p => ({
    ...calcPromo(p, quantity, unitPrice),
    promotion_id: p.id,
  }))

  const best = results.reduce((a, b) => a.discount >= b.discount ? a : b)

  return best.applied
    ? { discount: best.discount, promo_label: best.label, promotion_id: best.promotion_id }
    : { discount: 0, promo_label: '', promotion_id: null }
}
