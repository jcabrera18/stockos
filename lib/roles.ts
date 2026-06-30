// Roles restringidos: todo lo que NO sea owner/admin. Estos usuarios solo ven su
// propia actividad del día (ventas, comprobantes) y no acceden a historiales ni
// agregados del negocio. El filtro real se fuerza en el backend; esto es para la UI.
export const RESTRICTED_ROLES = ['cashier', 'stocker', 'seller'] as const

export function isRestrictedRole(role: string | null | undefined): boolean {
  return !role || RESTRICTED_ROLES.includes(role as (typeof RESTRICTED_ROLES)[number])
}
