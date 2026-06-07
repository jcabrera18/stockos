'use client'
// Online, el middleware redirige `/` antes de que esto renderice. Pero offline el
// middleware no corre (la request nunca llega al server; el SW sirve el shell
// cacheado), así que `/` quedaría en blanco. Acá hacemos el redirect por rol en
// cliente usando el perfil cacheado (login offline, P1 — ver .claude/OFFLINE_PLAN.md).
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

const ROLE_HOME: Record<string, string> = {
  owner: '/dashboard',
  admin: '/dashboard',
  cashier: '/pos',
  stocker: '/warehouses',
  seller: '/orders',
}

export default function RootPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    if (user) router.replace(ROLE_HOME[user.role] ?? '/dashboard')
    else router.replace('/login')
  }, [user, loading, router])

  return null
}
