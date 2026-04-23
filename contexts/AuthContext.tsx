'use client'
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import { posthog } from '@/lib/posthog'

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
    stock_enabled:          boolean
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

  const loadProfile = useCallback(async () => {
    try {
      const profile = await api.get<UserProfile>('/api/auth/me')
      setUser(profile)
      if (posthog.__loaded) {
        posthog.identify(profile.id, {
          email:       profile.email,
          name:        profile.full_name,
          role:        profile.role,
          business_id: profile.business_id,
          business:    profile.business?.name,
        })
      }
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProfile()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        loadProfile()
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [loadProfile])

  const signOut = async () => {
    if (posthog.__loaded) posthog.reset()
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
