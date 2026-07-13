// ─────────────────────────────────────────────────────────────
// Rubros de negocio soportados por el onboarding.
// El rubro se guarda en `businesses.rubro` (backend, fase F5) y define
// qué misiones se priorizan en la Etapa 3 y qué asistentes/plantillas
// se ofrecen. Es ADITIVO: nunca esconde módulos, solo prioriza.
// ─────────────────────────────────────────────────────────────

export type Rubro =
  | 'supermercado'
  | 'corralon'
  | 'ferreteria'
  | 'dietetica'
  | 'petshop'
  | 'indumentaria'
  | 'perfumeria'
  | 'electronica'
  | 'vinoteca'
  | 'bicicleteria'
  | 'otro'

export interface RubroDef {
  id: Rubro
  emoji: string
  label: string
  /** Frase corta que aparece en el selector, describe el foco */
  focus: string
}

export const RUBROS: RubroDef[] = [
  { id: 'supermercado', emoji: '🛒', label: 'Supermercado / Autoservicio', focus: 'Códigos de barras, promociones y etiquetas' },
  { id: 'corralon',     emoji: '🧱', label: 'Corralón',                    focus: 'Depósitos, remitos, pedidos y reservas' },
  { id: 'ferreteria',   emoji: '🔩', label: 'Ferretería',                  focus: 'Marcas, variantes y proveedores' },
  { id: 'dietetica',    emoji: '🥦', label: 'Dietética',                   focus: 'Vencimientos, lotes y productos a granel' },
  { id: 'petshop',      emoji: '🐶', label: 'Pet Shop',                    focus: 'Alimentos, accesorios y clientes frecuentes' },
  { id: 'indumentaria', emoji: '👕', label: 'Indumentaria',               focus: 'Talles, colores y variantes' },
  { id: 'perfumeria',   emoji: '💄', label: 'Perfumería / Cosmética',     focus: 'Marcas, lotes y vencimientos' },
  { id: 'electronica',  emoji: '📱', label: 'Electrónica',                 focus: 'Series, garantías y variantes' },
  { id: 'vinoteca',     emoji: '🍷', label: 'Vinoteca',                    focus: 'Botellas, cajas y promociones' },
  { id: 'bicicleteria', emoji: '🚲', label: 'Bicicletería',               focus: 'Repuestos y servicios' },
  { id: 'otro',         emoji: '🏪', label: 'Otro rubro',                  focus: 'Un flujo general para cualquier comercio' },
]

export const RUBRO_MAP: Record<Rubro, RubroDef> =
  Object.fromEntries(RUBROS.map((r) => [r.id, r])) as Record<Rubro, RubroDef>

export function rubroLabel(id: Rubro | null | undefined): string {
  return id ? (RUBRO_MAP[id]?.label ?? 'Tu comercio') : 'Tu comercio'
}
