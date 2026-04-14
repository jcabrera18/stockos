'use client'
import { useEffect, useRef, useState } from 'react'
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
import { Sun, Moon, Shield, Truck, UserPlus, Building2, Receipt } from 'lucide-react'

const ROLE_OPTIONS = [
  { value: 'cashier', label: 'Cajero' },
  { value: 'stocker', label: 'Repositor' },
  { value: 'seller',  label: 'Vendedor' },
]

const IVA_OPTIONS = [
  { value: 'RI', label: 'Responsable Inscripto (Facturas A/B)' },
  { value: 'MO', label: 'Monotributista (Facturas C)' },
  { value: 'EX', label: 'Exento' },
]

const ENV_OPTIONS = [
  { value: 'homo',    label: 'Homologación (testing)' },
  { value: 'testing', label: 'Testing' },
  { value: 'prod',    label: 'Producción' },
]

interface Branch { id: string; name: string }

export default function SettingsPage() {
  const { user, signOut } = useAuth()
  const role = user?.role ?? ''
  const { theme, toggle } = useTheme()

  // Datos del negocio
  const [bizName, setBizName]       = useState('')
  const [bizCuit, setBizCuit]       = useState('')
  const [bizAddress, setBizAddress] = useState('')
  const [bizPhone, setBizPhone]     = useState('')
  const [savingBiz, setSavingBiz]   = useState(false)

  // Ventas
  const [shippingDefault, setShippingDefault] = useState('')
  const [savingShipping, setSavingShipping]   = useState(false)

  // AFIP
  const [ivaCondition, setIvaCondition]     = useState('MO')
  const [ptoVenta, setPtoVenta]             = useState('')
  const [afipEnv, setAfipEnv]               = useState('homo')
  const [afipCert, setAfipCert]             = useState('')
  const [afipKey, setAfipKey]               = useState('')
  const [savingAfip, setSavingAfip]         = useState(false)

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
  const initialized = useRef(false)

  useEffect(() => {
    if (!user || initialized.current) return
    initialized.current = true
    setBizName(user.business?.name ?? '')
    setBizCuit(user.business?.cuit ?? '')
    setBizAddress(user.business?.address ?? '')
    setBizPhone(user.business?.phone ?? '')
    if (user.business?.shipping_price_default !== undefined) {
      setShippingDefault(String(user.business.shipping_price_default))
    }
    setIvaCondition(user.business?.iva_condition ?? 'MO')
    setPtoVenta(user.business?.afip_punto_venta ? String(user.business.afip_punto_venta) : '')
    setAfipEnv(user.business?.afip_environment ?? 'homo')
  }, [user])

  useEffect(() => {
    if (['owner', 'admin'].includes(role)) {
      api.get<Branch[]>('/api/branches').then(res => {
        setBranches(res ?? [])
      }).catch(() => {})
    }
  }, [role])

  const handleSaveBiz = async () => {
    setSavingBiz(true)
    try {
      await api.patch('/api/auth/business-settings', {
        name:    bizName || undefined,
        cuit:    bizCuit || null,
        address: bizAddress || null,
        phone:   bizPhone || null,
      })
      toast.success('Datos del negocio actualizados')
    } catch {
      toast.error('Error al guardar')
    } finally {
      setSavingBiz(false)
    }
  }

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

  const handleSaveAfip = async () => {
    setSavingAfip(true)
    try {
      const payload: Record<string, unknown> = {
        iva_condition:    ivaCondition,
        afip_punto_venta: ptoVenta ? Number(ptoVenta) : null,
        afip_environment: afipEnv,
      }
      if (afipCert.trim()) payload.afip_cert = afipCert.trim()
      if (afipKey.trim())  payload.afip_key  = afipKey.trim()

      await api.patch('/api/auth/business-settings', payload)
      toast.success('Configuración AFIP guardada')
      setAfipCert('')
      setAfipKey('')
    } catch {
      toast.error('Error al guardar')
    } finally {
      setSavingAfip(false)
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

  const isOwnerAdmin = ['owner', 'admin'].includes(role)

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

        {/* Datos del negocio */}
        {isOwnerAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 size={15} className="text-[var(--accent)]" />
                Datos del negocio
              </CardTitle>
            </CardHeader>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-[var(--text3)] mb-1">Nombre / Razón social</p>
                <Input
                  value={bizName}
                  onChange={e => setBizName(e.target.value)}
                  placeholder="Nombre del negocio"
                />
              </div>
              <div>
                <p className="text-xs text-[var(--text3)] mb-1">CUIT (sin guiones)</p>
                <Input
                  value={bizCuit}
                  onChange={e => setBizCuit(e.target.value)}
                  placeholder="20123456789"
                />
              </div>
              <div>
                <p className="text-xs text-[var(--text3)] mb-1">Dirección</p>
                <Input
                  value={bizAddress}
                  onChange={e => setBizAddress(e.target.value)}
                  placeholder="Av. Siempreviva 123, Ciudad"
                />
              </div>
              <div>
                <p className="text-xs text-[var(--text3)] mb-1">Teléfono</p>
                <Input
                  value={bizPhone}
                  onChange={e => setBizPhone(e.target.value)}
                  placeholder="+54 11 1234-5678"
                />
              </div>
              <Button onClick={handleSaveBiz} disabled={savingBiz}>
                {savingBiz ? 'Guardando...' : 'Guardar datos'}
              </Button>
            </div>
          </Card>
        )}

        {/* Ventas */}
        {isOwnerAdmin && (
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

        {/* AFIP */}
        {isOwnerAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt size={15} className="text-[var(--accent)]" />
                AFIP / Facturación electrónica
              </CardTitle>
            </CardHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-[var(--text3)] mb-1">Condición IVA</p>
                  <Select
                    options={IVA_OPTIONS}
                    value={ivaCondition}
                    onChange={e => setIvaCondition(e.target.value)}
                  />
                </div>
                <div>
                  <p className="text-xs text-[var(--text3)] mb-1">Ambiente</p>
                  <Select
                    options={ENV_OPTIONS}
                    value={afipEnv}
                    onChange={e => setAfipEnv(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <p className="text-xs text-[var(--text3)] mb-1">Punto de venta AFIP</p>
                <p className="text-xs text-[var(--text3)] mb-2">Número registrado en AFIP como "Web Services"</p>
                <Input
                  type="number"
                  min="1"
                  max="99999"
                  value={ptoVenta}
                  onChange={e => setPtoVenta(e.target.value)}
                  placeholder="Ej: 1"
                  className="max-w-[120px]"
                />
              </div>

              <div>
                <p className="text-xs text-[var(--text3)] mb-1">Certificado digital (.crt)</p>
                <p className="text-xs text-[var(--text3)] mb-2">
                  Pegá el contenido del archivo .crt descargado de AFIP. Solo se guarda al enviar.
                </p>
                <textarea
                  value={afipCert}
                  onChange={e => setAfipCert(e.target.value)}
                  placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                  rows={5}
                  className="w-full text-xs font-mono bg-[var(--surface2)] border border-[var(--border)] rounded-[var(--radius-md)] p-2 text-[var(--text)] placeholder-[var(--text3)] resize-none focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div>
                <p className="text-xs text-[var(--text3)] mb-1">Clave privada (.key)</p>
                <p className="text-xs text-[var(--text3)] mb-2">
                  Pegá el contenido del archivo .key generado con OpenSSL. Solo se guarda al enviar.
                </p>
                <textarea
                  value={afipKey}
                  onChange={e => setAfipKey(e.target.value)}
                  placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;...&#10;-----END RSA PRIVATE KEY-----"
                  rows={5}
                  className="w-full text-xs font-mono bg-[var(--surface2)] border border-[var(--border)] rounded-[var(--radius-md)] p-2 text-[var(--text)] placeholder-[var(--text3)] resize-none focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              {afipEnv === 'prod' && (
                <p className="text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-[var(--radius-md)] p-2">
                  Estás configurando el ambiente de <strong>producción</strong>. Los comprobantes emitidos serán válidos ante AFIP.
                </p>
              )}

              <Button onClick={handleSaveAfip} disabled={savingAfip}>
                {savingAfip ? 'Guardando...' : 'Guardar configuración AFIP'}
              </Button>
            </div>
          </Card>
        )}

        {/* Gestión de usuarios */}
        {isOwnerAdmin && (
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
