import { EMPTY_META, type OnbMeta } from './types'

// ─────────────────────────────────────────────────────────────
// Persistencia del meta del onboarding (lo NO derivable: rubro,
// dismissed, celebraciones, wizards, eventos).
//
// F0/F1: localStorage scopeado por negocio.
// F5:    reemplazar getMeta/saveMeta por GET/PATCH /api/onboarding/state
//        (tabla onboarding_state). La firma se mantiene, solo cambia
//        el cuerpo → el resto del sistema no se entera.
// ─────────────────────────────────────────────────────────────

const KEY = (businessId: string) => `stockos_onboarding_${businessId}`

export function getMeta(businessId: string): OnbMeta {
  if (typeof window === 'undefined') return { ...EMPTY_META }
  try {
    const raw = localStorage.getItem(KEY(businessId))
    if (!raw) return { ...EMPTY_META }
    // Merge con EMPTY_META para tolerar versiones viejas sin campos nuevos
    return { ...EMPTY_META, ...(JSON.parse(raw) as Partial<OnbMeta>) }
  } catch {
    return { ...EMPTY_META }
  }
}

export function saveMeta(businessId: string, meta: OnbMeta): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(KEY(businessId), JSON.stringify(meta))
  } catch { /* quota / modo privado: ignoramos */ }
}
