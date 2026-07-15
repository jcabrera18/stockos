// Perfil cacheado para login offline y para mantener consistente el rol activo.
// Tras una carga exitosa de /api/auth/me lo guardamos en localStorage; si en una
// carga posterior /api/auth/me falla por red (offline o Supabase/Railway caído) y
// hay una sesión previa del MISMO usuario, operamos con este perfil en vez de
// mandar al usuario a /login. Ver .claude/OFFLINE_PLAN.md (P1).
//
// Vive en su propio módulo (no en AuthContext) para que el login pueda reescribir
// la caché apenas se autentica, evitando que quede el perfil de un usuario previo.

export interface UserProfile {
  id:           string
  business_id:  string
  role:         string
  is_active:    boolean
  warehouse_id: string | null
  email?:       string
  full_name?:   string
  business?: {
    name:                   string
    cuit:                   string | null
    address:                string | null
    phone:                  string | null
    shipping_price_default: number
    iva_condition:          string
    afip_punto_venta:       number | null
    afip_environment:       string
    monotributo_limite_anual: number | null
    stock_enabled:          boolean
    multicurrency_enabled:  boolean
    usd_rate:               number | null
    usd_rate_source:        string
    usd_rate_updated_at:    string | null
    subscription: {
      plan:               string
      billing_cycle:      string | null
      status:             'trialing' | 'active' | 'grace' | 'past_due' | 'canceled'
      trial_ends_at:      string | null
      grace_ends_at:      string | null
      current_period_end: string | null
    }
  } | null
}

const PROFILE_CACHE_KEY = 'stockos_profile'

export function readCachedProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY)
    return raw ? (JSON.parse(raw) as UserProfile) : null
  } catch {
    return null
  }
}

export function writeCachedProfile(profile: UserProfile) {
  try {
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile))
  } catch { }
}

export function clearCachedProfile() {
  try {
    localStorage.removeItem(PROFILE_CACHE_KEY)
  } catch { }
}
