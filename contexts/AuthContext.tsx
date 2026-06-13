'use client'
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import { posthog } from '@/lib/posthog'

// Detecta fallos de red (no de auth) para decidir si caer al perfil cacheado.
// Inlineado a propósito: importarlo de lib/sales-queue arrastraría Dexie al
// bundle de todas las páginas (AuthContext está siempre montado).
function isNetworkError(err: unknown): boolean {
  if (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')) return true
  if (!(err instanceof TypeError)) return false
  const msg = err.message.toLowerCase()
  return msg.includes('fetch') || msg.includes('network') || msg.includes('load failed')
}

// Perfil cacheado para login offline: tras una carga exitosa lo guardamos en
// localStorage; si en una carga posterior /api/auth/me falla por red (offline o
// Supabase/Railway caído) y hay una sesión previa, operamos con este perfil en
// vez de mandar al usuario a /login. Ver .claude/OFFLINE_PLAN.md (P1).
const PROFILE_CACHE_KEY = 'stockos_profile'

function readCachedProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY)
    return raw ? (JSON.parse(raw) as UserProfile) : null
  } catch {
    return null
  }
}

function writeCachedProfile(profile: UserProfile) {
  try {
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile))
  } catch { }
}

function clearCachedProfile() {
  try {
    localStorage.removeItem(PROFILE_CACHE_KEY)
  } catch { }
}

interface UserProfile {
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

interface AuthContextValue {
  user:          UserProfile | null
  loading:       boolean
  signOut:       () => Promise<void>
  refreshUser:   () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const [user, setUser]       = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  // Ref para saber si ya tenemos un perfil cargado (evita limpiar sesión en errores transitorios)
  const hasProfileRef = useRef(false)

  const loadProfile = useCallback(async () => {
    try {
      const profile = await api.get<UserProfile>('/api/auth/me')
      hasProfileRef.current = true
      setUser(profile)
      writeCachedProfile(profile)
      if (posthog.__loaded) {
        posthog.identify(profile.id, {
          email:       profile.email,
          name:        profile.full_name,
          role:        profile.role,
          business_id: profile.business_id,
          business:    profile.business?.name,
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      const offline = typeof navigator !== 'undefined' && !navigator.onLine
      const cached = readCachedProfile()

      // Login offline (P1): si falla por red (offline / Supabase / Railway caído)
      // y hay un perfil cacheado de una sesión previa, operamos con él en vez de
      // desloguear. No aplica si el error es 'No autenticado' (no hay sesión real).
      if (cached && msg !== 'No autenticado' && (offline || isNetworkError(err))) {
        hasProfileRef.current = true
        setUser(cached)
      } else if (msg === 'No autenticado' || !hasProfileRef.current) {
        // Error de auth genuino (sin token) o primer arranque sin perfil ni caché.
        hasProfileRef.current = false
        setUser(null)
      }
      // Si ya teníamos perfil y falla por red/server, conservamos el usuario actual
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Supabase re-emite SIGNED_IN/TOKEN_REFRESHED en cada focus/visibilitychange
    // de la pestaña. Sin throttle, eso re-pedía /api/auth/me en cada alt-tab.
    const PROFILE_RELOAD_THROTTLE_MS = 60 * 1000
    let lastProfileLoadAt = Date.now()

    loadProfile()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (Date.now() - lastProfileLoadAt < PROFILE_RELOAD_THROTTLE_MS) return
        lastProfileLoadAt = Date.now()
        loadProfile()
      } else if (event === 'SIGNED_OUT') {
        hasProfileRef.current = false
        setUser(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [loadProfile])

  const signOut = async () => {
    if (posthog.__loaded) posthog.reset()
    clearCachedProfile()
    await supabase.auth.signOut()
    setUser(null)
    window.location.replace('/login')
  }

  return (
    <AuthContext.Provider value={{ user, loading, signOut, refreshUser: loadProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext must be used inside AuthProvider')
  return ctx
}
