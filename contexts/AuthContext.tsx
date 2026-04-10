'use client'
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { api } from '@/lib/api'

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
  } | null
}

interface AuthContextValue {
  user:    UserProfile | null
  loading: boolean
  signOut: () => Promise<void>
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
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    window.location.replace('/login')
  }

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext must be used inside AuthProvider')
  return ctx
}
