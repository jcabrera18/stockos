'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { api } from '@/lib/api'

interface UserProfile {
  id: string
  business_id: string
  role: string
  is_active: boolean
}

export function useAuth() {
  const supabase = createClient()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Cargar sesión y perfil
    const loadProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        try {
          const profile = await api.get<UserProfile>('/api/auth/me')
          setUser(profile)
        } catch {
          setUser(null)
        }
      } else {
        setUser(null)
      }
      setLoading(false)
    }

    loadProfile()

    // Escuchar cambios de sesión
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        try {
          const profile = await api.get<UserProfile>('/api/auth/me')
          setUser(profile)
        } catch {
          setUser(null)
        }
      } else {
        setUser(null)
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = async () => {
    await supabase.auth.signOut()
    window.location.replace('/login')
  }

  return { user, loading, signOut }
}