// Definición única de planes y sus límites de capacidad.
// El backend guarda `plan` como 'trial' | 'local' | 'negocio' | 'empresa'.
// La home (app/home/components/Pricing.tsx) muestra esos mismos nombres
// (Local / Negocio / Empresa) para que /settings y la landing coincidan.
//
// Reglas de negocio (confirmadas con el dueño):
//  - El owner cuenta dentro del cupo de usuarios.
//  - El trial usa los límites del plan Negocio.
//  - maxX = null significa ilimitado (plan Empresa).

export const WHATSAPP_LINK = 'https://wa.me/5493438558913'

export interface PlanLimits {
  /** Nombre visible, alineado con la home */
  label:         string
  maxUsers:      number | null
  maxBranches:   number | null
  maxRegisters:  number | null
  maxWarehouses: number | null
}

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  trial:   { label: 'Prueba gratuita', maxUsers: 10,   maxBranches: 1,    maxRegisters: 3,    maxWarehouses: 1    },
  local:   { label: 'Local',           maxUsers: 2,    maxBranches: 1,    maxRegisters: 1,    maxWarehouses: 1    },
  negocio: { label: 'Negocio',         maxUsers: 10,   maxBranches: 1,    maxRegisters: 3,    maxWarehouses: 1    },
  empresa: { label: 'Empresa',         maxUsers: null, maxBranches: null, maxRegisters: null, maxWarehouses: null },
}

export function getPlanLimits(plan: string | null | undefined): PlanLimits {
  return PLAN_LIMITS[plan ?? 'trial'] ?? PLAN_LIMITS.trial
}

export function getPlanLabel(plan: string | null | undefined): string {
  return getPlanLimits(plan).label
}

/** true si el plan puede mejorarse (no es el tope "Empresa") */
export function canUpgradePlan(plan: string | null | undefined): boolean {
  return getPlanLimits(plan).maxUsers !== null
}

/**
 * Link de WhatsApp con mensaje predefinido para pedir un cambio de plan.
 * Incluye nombre e ID del negocio para identificarlo rápido en Supabase.
 */
export function upgradeWhatsappLink(
  businessName?: string | null,
  businessId?: string | null,
): string {
  const parts = ['Hola! Quiero actualizar mi plan de StockOS.']
  if (businessName) parts.push(`Soy el negocio "${businessName}".`)
  if (businessId) parts.push(`(ID: ${businessId})`)
  return `${WHATSAPP_LINK}?text=${encodeURIComponent(parts.join(' '))}`
}
