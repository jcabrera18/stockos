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
import { Sun, Moon, Shield, Truck, Building2, Receipt, CreditCard, MessageCircle } from 'lucide-react'
import { Toggle } from '@/components/ui/Toggle'

// const ROLE_OPTIONS = [
//   { value: 'cashier', label: 'Cajero' },
//   { value: 'stocker', label: 'Repositor' },
//   { value: 'seller',  label: 'Vendedor' },
// ]

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

// interface Branch { id: string; name: string }

export default function SettingsPage() {
  const { user, signOut, refreshUser } = useAuth()
  const role = user?.role ?? ''
  const { theme, toggle } = useTheme()

  // Datos del negocio
  const [bizName, setBizName]           = useState('')
  const [bizCuit, setBizCuit]           = useState('')
  const [bizAddress, setBizAddress]     = useState('')
  const [bizPhone, setBizPhone]         = useState('')
  const [stockEnabled, setStockEnabled] = useState(false)
  const [savingBiz, setSavingBiz]       = useState(false)

  // Ventas
  const [shippingDefault, setShippingDefault] = useState('')
  const [savingShipping, setSavingShipping]   = useState(false)

  // ARCA
  const [ivaCondition, setIvaCondition]     = useState('MO')
  const [ptoVenta, setPtoVenta]             = useState('')
  const [afipEnv, setAfipEnv]               = useState('homo')
  const [afipCert, setAfipCert]             = useState('')
  const [afipKey, setAfipKey]               = useState('')
  const [savingAfip, setSavingAfip]         = useState(false)

  // const [branches, setBranches] = useState<Branch[]>([])
  // const [newUser, setNewUser] = useState({ full_name: '', email: '', password: '', role: 'cashier', branch_id: '' })
  // const [creating, setCreating] = useState(false)
  const initialized = useRef(false)

  useEffect(() => {
    if (!user || initialized.current) return
    initialized.current = true
    setBizName(user.business?.name ?? '')
    setBizCuit(user.business?.cuit ?? '')
    setBizAddress(user.business?.address ?? '')
    setBizPhone(user.business?.phone ?? '')
    setStockEnabled(user.business?.stock_enabled ?? false)
    if (user.business?.shipping_price_default !== undefined) {
      setShippingDefault(String(user.business.shipping_price_default))
    }
    setIvaCondition(user.business?.iva_condition ?? 'MO')
    setPtoVenta(user.business?.afip_punto_venta ? String(user.business.afip_punto_venta) : '')
    setAfipEnv(user.business?.afip_environment ?? 'homo')
  }, [user])

  // useEffect(() => {
  //   if (['owner', 'admin'].includes(role)) {
  //     api.get<Branch[]>('/api/branches').then(res => {
  //       setBranches(res ?? [])
  //     }).catch(() => {})
  //   }
  // }, [role])

  const handleSaveBiz = async () => {
    setSavingBiz(true)
    try {
      await api.patch('/api/auth/business-settings', {
        name:          bizName || undefined,
        cuit:          bizCuit || null,
        address:       bizAddress || null,
        phone:         bizPhone || null,
        stock_enabled: stockEnabled,
      })
      toast.success('Datos del negocio actualizados')
      await refreshUser()
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
      await refreshUser()
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
      toast.success('Configuración ARCA guardada')
      await refreshUser()
      setAfipCert('')
      setAfipKey('')
    } catch {
      toast.error('Error al guardar')
    } finally {
      setSavingAfip(false)
    }
  }

  // const handleCreateUser = async () => { ... }

  const isOwnerAdmin = ['owner', 'admin'].includes(role)

  return (
    <AppShell>
      <PageHeader title="Configuración" />

      <div className="p-5">
        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-5 items-start">

          {/* ── Columna izquierda ── */}
          <div className="space-y-5">

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
                  <div className="grid grid-cols-2 gap-3">
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
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <div>
                      <p className="text-sm text-[var(--text)]">Manejo de stock</p>
                      <p className="text-xs text-[var(--text3)] mt-0.5">
                        Activá si querés controlar inventario y cantidades
                      </p>
                    </div>
                    <Toggle checked={stockEnabled} onChange={setStockEnabled} disabled={savingBiz} />
                  </div>
                  <Button onClick={handleSaveBiz} disabled={savingBiz}>
                    {savingBiz ? 'Guardando...' : 'Guardar datos'}
                  </Button>
                </div>
              </Card>
            )}

            {/* ARCA */}
            {isOwnerAdmin && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Receipt size={15} className="text-[var(--accent)]" />
                    ARCA / Facturación electrónica
                  </CardTitle>
                </CardHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
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
                    <div>
                      <p className="text-xs text-[var(--text3)] mb-1">Punto de venta</p>
                      <Input
                        type="number"
                        min="1"
                        max="99999"
                        value={ptoVenta}
                        onChange={e => setPtoVenta(e.target.value)}
                        placeholder="Ej: 1"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-[var(--text3)] mb-1">Certificado digital (.crt)</p>
                      <p className="text-xs text-[var(--text3)] mb-2">
                        Pegá el contenido del archivo .crt descargado de ARCA.
                      </p>
                      <textarea
                        value={afipCert}
                        onChange={e => setAfipCert(e.target.value)}
                        placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                        rows={6}
                        className="w-full text-xs font-mono bg-[var(--surface2)] border border-[var(--border)] rounded-[var(--radius-md)] p-2 text-[var(--text)] placeholder-[var(--text3)] resize-none focus:outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                    <div>
                      <p className="text-xs text-[var(--text3)] mb-1">Clave privada (.key)</p>
                      <p className="text-xs text-[var(--text3)] mb-2">
                        Pegá el contenido del archivo .key generado con OpenSSL.
                      </p>
                      <textarea
                        value={afipKey}
                        onChange={e => setAfipKey(e.target.value)}
                        placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;...&#10;-----END RSA PRIVATE KEY-----"
                        rows={6}
                        className="w-full text-xs font-mono bg-[var(--surface2)] border border-[var(--border)] rounded-[var(--radius-md)] p-2 text-[var(--text)] placeholder-[var(--text3)] resize-none focus:outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                  </div>

                  {afipEnv === 'prod' && (
                    <p className="text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-[var(--radius-md)] p-2">
                      Estás configurando el ambiente de <strong>producción</strong>. Los comprobantes emitidos serán válidos ante ARCA.
                    </p>
                  )}

                  <Button onClick={handleSaveAfip} disabled={savingAfip}>
                    {savingAfip ? 'Guardando...' : 'Guardar configuración ARCA'}
                  </Button>
                </div>
              </Card>
            )}
          </div>

          {/* ── Columna derecha ── */}
          <div className="space-y-5">

            {/* Mi cuenta */}
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

            {/* Suscripción */}
            {isOwnerAdmin && (() => {
              const sub = user?.business?.subscription
              if (!sub) return null

              const PLAN_LABELS: Record<string, string> = {
                trial:   'Prueba gratuita',
                local:   'Local',
                negocio: 'Negocio',
                cadena:  'Cadena',
              }
              const CYCLE_LABELS: Record<string, string> = {
                monthly: 'Mensual',
                annual:  'Anual',
              }
              const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
                trialing: { label: 'En prueba',  color: 'text-blue-400 bg-blue-400/10 border-blue-400/20' },
                active:   { label: 'Activa',     color: 'text-[var(--accent)] bg-[var(--accent)]/10 border-[var(--accent)]/20' },
                grace:    { label: 'Por vencer', color: 'text-amber-400 bg-amber-400/10 border-amber-400/20' },
                past_due: { label: 'Pausada',    color: 'text-red-400 bg-red-400/10 border-red-400/20' },
                canceled: { label: 'Cancelada',  color: 'text-[var(--text3)] bg-[var(--surface2)] border-[var(--border)]' },
              }

              const statusCfg = STATUS_CONFIG[sub.status] ?? STATUS_CONFIG.trialing

              const formatDate = (d: string | null) =>
                d ? new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' }) : null

              const isGrandfathered = sub.current_period_end?.startsWith('2099')
              const renewalDate = (sub.status === 'active' || sub.status === 'past_due')
                ? (isGrandfathered ? null : formatDate(sub.current_period_end))
                : null

              const trialDate   = (sub.status === 'trialing') ? formatDate(sub.trial_ends_at) : null
              const graceDate   = (sub.status === 'grace')    ? formatDate(sub.grace_ends_at)  : null

              const daysLeft = (dateStr: string | null) => {
                if (!dateStr) return null
                const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
                return diff > 0 ? diff : 0
              }

              return (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CreditCard size={15} className="text-[var(--accent)]" />
                      Suscripción
                    </CardTitle>
                  </CardHeader>
                  <div className="space-y-3">

                    {/* Plan + status */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-[var(--text3)] mb-0.5">Plan</p>
                        <p className="text-sm font-semibold text-[var(--text)]">
                          {PLAN_LABELS[sub.plan] ?? sub.plan}
                          {sub.billing_cycle && (
                            <span className="text-xs font-normal text-[var(--text3)] ml-1.5">
                              · {CYCLE_LABELS[sub.billing_cycle]}
                            </span>
                          )}
                        </p>
                      </div>
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${statusCfg.color}`}>
                        {statusCfg.label}
                      </span>
                    </div>

                    {/* Fechas según estado */}
                    {sub.status === 'trialing' && daysLeft(sub.trial_ends_at) !== null && (
                      <div>
                        <p className="text-xs text-[var(--text3)] mb-0.5">Prueba gratuita</p>
                        <p className="text-sm text-blue-400 font-medium">{daysLeft(sub.trial_ends_at)} días restantes</p>
                      </div>
                    )}

                    {sub.status === 'grace' && daysLeft(sub.grace_ends_at) !== null && (
                      <div>
                        <p className="text-xs text-[var(--text3)] mb-0.5">Acceso extendido</p>
                        <p className="text-sm text-amber-400 font-medium">{daysLeft(sub.grace_ends_at)} días restantes</p>
                      </div>
                    )}

                    {(sub.status === 'active' || sub.status === 'past_due') && (
                      <div>
                        <p className="text-xs text-[var(--text3)] mb-0.5">Vencimiento</p>
                        {renewalDate ? (
                          <p className="text-sm text-[var(--text)]">
                            {renewalDate}
                            <span className="text-xs text-[var(--text3)] ml-2">
                              ({daysLeft(sub.current_period_end)} días restantes)
                            </span>
                          </p>
                        ) : (
                          <p className="text-sm text-[var(--text)]">Sin vencimiento</p>
                        )}
                      </div>
                    )}

                    {sub.status === 'past_due' && (
                      <p className="text-xs text-red-400/80 bg-red-400/8 border border-red-400/15 rounded-[var(--radius-md)] px-3 py-2">
                        Tu sistema está pausado. Contactanos para reactivar tu cuenta.
                      </p>
                    )}

                    {/* CTA */}
                    {sub.status !== 'active' && (
                      <a
                        href="https://wa.me/5493438445203"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-2.5 rounded-[var(--radius-md)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold transition-colors"
                      >
                        <MessageCircle size={14} />
                        {sub.status === 'past_due' ? 'Reactivar cuenta' : 'Contratar plan'}
                      </a>
                    )}

                  </div>
                </Card>
              )
            })()}

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
            {isOwnerAdmin && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Truck size={15} className="text-[var(--accent)]" />
                    Ventas
                  </CardTitle>
                </CardHeader>
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
              </Card>
            )}

            {/* Crear usuario — oculto temporalmente */}
            {/* {isOwnerAdmin && <CreateUserCard ... />} */}

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
        </div>
      </div>
    </AppShell>
  )
}
