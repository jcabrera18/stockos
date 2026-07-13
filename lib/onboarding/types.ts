import type { LucideIcon } from 'lucide-react'
import type { Rubro } from './rubros'

// ─────────────────────────────────────────────────────────────
// Contadores derivados de endpoints existentes (ver counts.ts).
// Un valor `undefined` significa "no se pudo leer" → la misión que
// dependa de él queda como NO completada, sin romper la tarjeta.
// ─────────────────────────────────────────────────────────────
export interface OnbCounts {
  categories?: number
  products?: number
  sales?: number
  suppliers?: number
  purchases?: number
  customers?: number
  expenses?: number
  cc_accounts?: number
  cash_closes?: number
  quotes?: number
  orders?: number
  promotions?: number
  users?: number
  branches?: number
  warehouses?: number
  // Eventos que no derivan de una tabla (se guardan en meta.events)
  labels_printed?: number
  excel_exports?: number
  barcodes_scanned?: number
}

// ─────────────────────────────────────────────────────────────
// Estado persistido (fase F0/F1: localStorage · fase F5: onboarding_state).
// Es lo ÚNICO que no se puede derivar de datos reales.
// ─────────────────────────────────────────────────────────────
export interface OnbMeta {
  rubro: Rubro | null
  dismissed: boolean
  /** Logros ya celebrados con confetti (para no repetir) */
  celebrated: string[]
  /** Logros desbloqueados (para el timeline / strip) */
  achievements: string[]
  /** Asistentes "hacelo por mí" ya corridos */
  wizards_run: string[]
  /** Contadores de eventos manuales: { labels_printed: 3 } */
  events: Record<string, number>
  started_at: string
  completed_at: string | null
}

export const EMPTY_META: OnbMeta = {
  rubro: null,
  dismissed: false,
  celebrated: [],
  achievements: [],
  wizards_run: [],
  events: {},
  started_at: new Date().toISOString(),
  completed_at: null,
}

/** Snapshot completo que consumen las misiones y el motor de progreso */
export interface OnbState {
  counts: OnbCounts
  meta: OnbMeta
}

export type WizardId =
  | 'categories_auto'
  | 'brands_auto'
  | 'units_auto'
  | 'products_frequent'
  | 'recommended_config'

export type StageNum = 1 | 2 | 3 | 4

export interface Mission {
  id: string
  stage: StageNum
  /** Objetivo en lenguaje de negocio, no tarea técnica */
  title: string
  /** Sub-línea que explica el "para qué" */
  goal: string
  icon: LucideIcon
  /** Tiempo estimado, ej "2 min" */
  eta: string
  /** CTA principal → a dónde lleva */
  href: string
  /** Texto del botón */
  cta: string
  /** Cómo se detecta que está hecha, contra el snapshot */
  isDone: (s: OnbState) => boolean
  /** Peso para el % global (default 1). La primera venta pesa más. */
  weight?: number
  /** Asistente "hacelo por mí", opcional (fase F3) */
  wizard?: WizardId
  /** Rubros donde aplica. undefined = todos */
  rubros?: Rubro[]
  /** Logro que desbloquea al completarse */
  achievement?: string
}

/** Misión enriquecida por el motor (useOnboarding) */
export interface MissionState extends Mission {
  done: boolean
  isNext: boolean
}

export interface StageDef {
  n: StageNum
  title: string
  subtitle: string
  accent: string
}
