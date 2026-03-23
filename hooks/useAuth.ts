'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User as SupabaseUser, Session } from '@supabase/supabase-js'

export function useAuth() {
  const [user, setUser]       = useState<SupabaseUser | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setUser(data.session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  // Extraer custom claims del JWT
  const claims = session?.access_token
    ? JSON.parse(atob(session.access_token.split('.')[1]))
    : null

  return {
    user,
    session,
    loading,
    signOut,
    businessId: claims?.business_id as string | undefined,
    role:       claims?.user_role   as string | undefined,
    isActive:   claims?.is_active   as boolean | undefined,
  }
}
