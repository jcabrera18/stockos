'use client'
import { useEffect, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/hooks/useAuth'
import { useTheme } from '@/hooks/useTheme'
import { getRoleLabel } from '@/lib/utils'
import { Sun, Moon, Shield } from 'lucide-react'

export default function SettingsPage() {
  const { user, role, signOut } = useAuth()
  const { theme, toggle }       = useTheme()
  const [name, setName]         = useState('')

  useEffect(() => {
    if (user?.email) setName(user.email)
  }, [user])

  return (
    <AppShell>
      <PageHeader title="Configuración" />

      <div className="p-5 space-y-5 max-w-xl">
        {/* Perfil */}
        <Card>
          <CardHeader>
            <CardTitle>Mi cuenta</CardTitle>
          </CardHeader>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-[var(--text3)] mb-1">Email</p>
              <p className="text-sm text-[var(--text)]">{user?.email ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--text3)] mb-1">Rol</p>
              <div className="flex items-center gap-2">
                <Shield size={13} className="text-[var(--accent)]" />
                <p className="text-sm text-[var(--text)]">{getRoleLabel(role ?? '')}</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Apariencia */}
        <Card>
          <CardHeader>
            <CardTitle>Apariencia</CardTitle>
          </CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[var(--text)]">
                {theme === 'dark' ? 'Modo oscuro' : 'Modo claro'}
              </p>
              <p className="text-xs text-[var(--text3)] mt-0.5">
                Cambia el tema de la interfaz
              </p>
            </div>
            <button
              onClick={toggle}
              className="w-10 h-10 rounded-[var(--radius-md)] bg-[var(--surface2)] border border-[var(--border)] flex items-center justify-center hover:bg-[var(--surface3)] transition-colors"
            >
              {theme === 'dark' ? <Sun size={16} className="text-[var(--text2)]" /> : <Moon size={16} className="text-[var(--text2)]" />}
            </button>
          </div>
        </Card>

        {/* API */}
        <Card>
          <CardHeader>
            <CardTitle>Conexión API</CardTitle>
          </CardHeader>
          <div className="space-y-2">
            <div>
              <p className="text-xs text-[var(--text3)] mb-1">URL del backend</p>
              <p className="text-sm mono text-[var(--text2)]">
                {process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}
              </p>
            </div>
          </div>
        </Card>

        {/* Sesión */}
        <Card>
          <CardHeader>
            <CardTitle>Sesión</CardTitle>
          </CardHeader>
          <Button variant="danger" onClick={signOut}>
            Cerrar sesión
          </Button>
        </Card>
      </div>
    </AppShell>
  )
}
