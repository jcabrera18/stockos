'use client'
import { useState, useEffect, useCallback } from 'react'
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
}

export function useAuth() {
  const supabase = createClient()
  const [user, setUser]       = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (authUser) {
        const profile = await api.get<UserProfile>('/api/auth/me')
        setUser(profile)
      } else {
        setUser(null)
      }
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    window.location.replace('/login')
  }

  return { user, loading, signOut }
}