'use client'
import { useEffect, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { useAuth } from '@/hooks/useAuth'
import { useTheme } from '@/hooks/useTheme'
import { getRoleLabel } from '@/lib/utils'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Sun, Moon, Shield, Truck, UserPlus } from 'lucide-react'

const ROLE_OPTIONS = [
  { value: 'cashier', label: 'Cajero' },
  { value: 'stocker', label: 'Repositor' },
  { value: 'seller',  label: 'Vendedor' },
]

interface Branch { id: string; name: string }

export default function SettingsPage() {
  const { user, signOut } = useAuth()
  const role = user?.role ?? ''
  const { theme, toggle } = useTheme()
  const [name, setName] = useState('')
  const [shippingDefault, setShippingDefault] = useState('')
  const [savingShipping, setSavingShipping] = useState(false)

  // Create user form
  const [branches, setBranches] = useState<Branch[]>([])
  const [newUser, setNewUser] = useState({
    full_name: '',
    email: '',
    password: '',
    role: 'cashier',
    branch_id: '',
  })
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (user?.email) setName(user.email)
    if (user?.business?.shipping_price_default !== undefined) {
      setShippingDefault(String(user.business.shipping_price_default))
    }
  }, [user])

  useEffect(() => {
    if (['owner', 'admin'].includes(role)) {
      api.get<Branch[]>('/api/branches').then(res => {
        setBranches(res ?? [])
      }).catch(() => {})
    }
  }, [role])

  const handleSaveShipping = async () => {
    setSavingShipping(true)
    try {
      await api.patch('/api/auth/business-settings', {
        shipping_price_default: Number(shippingDefault) || 0,
      })
      toast.success('Precio de envío actualizado')
    } catch {
      toast.error('Error al guardar')
    } finally {
      setSavingShipping(false)
    }
  }

  const handleCreateUser = async () => {
    if (!newUser.full_name || !newUser.email || !newUser.password) {
      toast.error('Completá todos los campos obligatorios')
      return
    }
    setCreating(true)
    try {
      await api.post('/api/auth/register', {
        full_name:   newUser.full_name,
        email:       newUser.email,
        password:    newUser.password,
        role:        newUser.role,
        business_id: user?.business_id,
        branch_id:   newUser.branch_id || null,
      })
      toast.success('Usuario creado correctamente')
      setNewUser({ full_name: '', email: '', password: '', role: 'cashier', branch_id: '' })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al crear usuario')
    } finally {
      setCreating(false)
    }
  }

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

        {/* Ventas */}
        {['owner', 'admin'].includes(role) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck size={15} className="text-[var(--accent)]" />
                Ventas
              </CardTitle>
            </CardHeader>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-[var(--text3)] mb-1">Precio de envío por defecto</p>
                <p className="text-xs text-[var(--text3)] mb-2">Se pre-carga al activar el envío en el POS</p>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={shippingDefault}
                    onChange={e => setShippingDefault(e.target.value)}
                    placeholder="0"
                    className="max-w-[140px]"
                  />
                  <Button onClick={handleSaveShipping} disabled={savingShipping}>
                    {savingShipping ? 'Guardando...' : 'Guardar'}
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Gestión de usuarios */}
        {['owner', 'admin'].includes(role) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus size={15} className="text-[var(--accent)]" />
                Crear usuario
              </CardTitle>
            </CardHeader>
            <div className="space-y-3">
              <Input
                placeholder="Nombre completo *"
                value={newUser.full_name}
                onChange={e => setNewUser(u => ({ ...u, full_name: e.target.value }))}
              />
              <Input
                type="email"
                placeholder="Email *"
                value={newUser.email}
                onChange={e => setNewUser(u => ({ ...u, email: e.target.value }))}
              />
              <Input
                type="password"
                placeholder="Contraseña * (mín. 6 caracteres)"
                value={newUser.password}
                onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))}
              />
              <Select
                options={ROLE_OPTIONS}
                value={newUser.role}
                onChange={e => setNewUser(u => ({ ...u, role: e.target.value }))}
              />
              {branches.length > 0 && (
                <Select
                  options={[
                    { value: '', label: 'Sin sucursal asignada' },
                    ...branches.map(b => ({ value: b.id, label: b.name })),
                  ]}
                  value={newUser.branch_id}
                  onChange={e => setNewUser(u => ({ ...u, branch_id: e.target.value }))}
                />
              )}
              <Button onClick={handleCreateUser} disabled={creating} className="w-full">
                {creating ? 'Creando...' : 'Crear usuario'}
              </Button>
            </div>
          </Card>
        )}

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
