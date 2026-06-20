'use client'
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import { posthog } from '@/lib/posthog'
import {
  type UserProfile,
  readCachedProfile,
  writeCachedProfile,
  clearCachedProfile,
} from '@/lib/profile-cache'

// Detecta fallos de red (no de auth) para decidir si caer al perfil cacheado.
// Inlineado a propósito: importarlo de lib/sales-queue arrastraría Dexie al
// bundle de todas las páginas (AuthContext está siempre montado).
function isNetworkError(err: unknown): boolean {
  if (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')) return true
  if (!(err instanceof TypeError)) return false
  const msg = err.message.toLowerCase()
  return msg.includes('fetch') || msg.includes('network') || msg.includes('load failed')
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

      // El perfil cacheado solo es válido si pertenece al usuario de la sesión
      // activa: así nunca servimos el perfil (y rol) de un usuario que se logueó
      // antes en este browser. getSession() lee el JWT de localStorage sin red.
      let cachedMatchesSession = false
      if (cached) {
        try {
          const { data } = await supabase.auth.getSession()
          cachedMatchesSession = data.session?.user?.id === cached.id
        } catch { /* sin sesión accesible: tratamos la caché como inválida */ }
        if (!cachedMatchesSession) clearCachedProfile()
      }

      // Login offline (P1): si falla por red (offline / Supabase / Railway caído)
      // y hay un perfil cacheado del MISMO usuario, operamos con él en vez de
      // desloguear. No aplica si el error es 'No autenticado' (no hay sesión real).
      if (cached && cachedMatchesSession && msg !== 'No autenticado' && (offline || isNetworkError(err))) {
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
    let cancelled = false

    // Hidratación optimista: si hay un perfil cacheado del MISMO usuario de la
    // sesión activa, lo mostramos al instante y revalidamos /api/auth/me en
    // background. Evita la pantalla en blanco del AppShell tras el login y en
    // cada recarga mientras el backend (Railway) hace cold start. Verificamos
    // contra getSession() para nunca mostrar el perfil de un usuario previo.
    ;(async () => {
      const cached = readCachedProfile()
      if (cached) {
        try {
          const { data } = await supabase.auth.getSession()
          if (!cancelled && data.session?.user?.id === cached.id) {
            hasProfileRef.current = true
            setUser(cached)
            setLoading(false)
          }
        } catch { /* sin sesión accesible: la carga normal decide */ }
      }
      if (!cancelled) loadProfile()
    })()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        // El throttle solo aplica cuando YA tenemos perfil: evita el refetch en
        // cada focus/visibilitychange (Supabase re-emite SIGNED_IN ahí). Si NO
        // tenemos perfil (recién logueado tras un signOut, con la sesión vieja sin
        // token), hay que cargar siempre: si no, el sidebar queda en el rol fallback.
        if (hasProfileRef.current && Date.now() - lastProfileLoadAt < PROFILE_RELOAD_THROTTLE_MS) return
        lastProfileLoadAt = Date.now()
        loadProfile()
      } else if (event === 'SIGNED_OUT') {
        hasProfileRef.current = false
        setUser(null)
        setLoading(false)
      }
    })

    return () => { cancelled = true; subscription.unsubscribe() }
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
