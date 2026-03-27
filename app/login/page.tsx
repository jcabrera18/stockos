'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import { useWorkstation } from '@/hooks/useWorkstation'
import { Zap, Eye, EyeOff, Building2, CreditCard, ChevronRight, LogIn } from 'lucide-react'

interface Branch {
  id: string
  name: string
  address?: string
  warehouse_id?: string
  registers: { id: string; name: string }[]
}

type Step = 'credentials' | 'workstation'

const ROLE_REDIRECT: Record<string, string> = {
  owner:   '/dashboard',
  admin:   '/dashboard',
  cashier: '/pos',       // pasa por selector de sucursal/caja
  stocker: '/dashboard',
  seller:  '/orders',
}

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const { setWorkstation } = useWorkstation()

  const [step, setStep] = useState<Step>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [error, setError] = useState('')

  // Step 2 — workstation
  const [branches, setBranches] = useState<Branch[]>([])
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null)
  const [selectedRegister, setSelectedRegister] = useState<{ id: string; name: string } | null>(null)
  const [loadingBranches, setLoadingBranches] = useState(false)
  const [userRole, setUserRole] = useState('')

  // Redirect si ya está logueado
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) router.replace('/dashboard')
    })
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const { error: authErr } = await supabase.auth.signInWithPassword({ email, password })
      if (authErr) { setError('Email o contraseña incorrectos'); setLoading(false); return }

      // Traer perfil del usuario para saber el rol
      const profile = await api.get<{ role: string }>('/api/auth/me')
      setUserRole(profile.role)

      if (profile.role === 'cashier') {
        // Cajero → selector de sucursal y caja antes de ir al POS
        setLoadingBranches(true)
        try {
          const br = await api.get<Branch[]>('/api/branches')
          setBranches(br)
          if (br.length === 1) {
            setSelectedBranch(br[0])
            if (br[0].registers.length === 1) setSelectedRegister(br[0].registers[0])
          }
        } catch { setError('Error al cargar sucursales') }
        finally { setLoadingBranches(false) }
        setStep('workstation')
        setLoading(false)
      } else {
        // Seller → /orders, owner/admin → /dashboard, resto → /dashboard
        setWorkstation(null)
        router.replace(ROLE_REDIRECT[profile.role] ?? '/dashboard')
      }
    } catch {
      setError('Error al iniciar sesión')
      setLoading(false)
    }
  }

  const handleSelectWorkstation = () => {
    if (!selectedBranch) { setError('Seleccioná una sucursal'); return }
    if (!selectedRegister) { setError('Seleccioná una caja'); return }

    setConfirmLoading(true)
    setWorkstation({
      branch_id: selectedBranch.id,
      branch_name: selectedBranch.name,
      register_id: selectedRegister.id,
      register_name: selectedRegister.name,
      warehouse_id: selectedBranch.warehouse_id,
    })

    router.replace('/pos')
  }

  const handleChangeWorkstation = () => {
    setSelectedBranch(null)
    setSelectedRegister(null)
    setError('')
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">

        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-[var(--accent)] flex items-center justify-center mx-auto">
            <Zap size={22} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-[var(--text)]">StockOS</h1>
          <p className="text-sm text-[var(--text3)]">
            {step === 'credentials' ? 'Ingresá con tu cuenta' : 'Seleccioná tu puesto de trabajo'}
          </p>
        </div>

        {/* ── Step 1: Credenciales ── */}
        {step === 'credentials' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-[var(--text2)] block mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  required
                  autoFocus
                  className="w-full px-3 py-2.5 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-[var(--text2)] block mb-1">Contraseña</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full px-3 py-2.5 pr-10 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                  />
                  <button type="button" onClick={() => setShowPassword(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text3)] hover:text-[var(--text)]">
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>

            {error && (
              <p className="text-xs text-[var(--danger)] text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold rounded-[var(--radius-md)] transition-colors disabled:opacity-60"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn size={15} />
                  Ingresar
                </>
              )}
            </button>
          </form>
        )}

        {/* ── Step 2: Selección de sucursal y caja ── */}
        {step === 'workstation' && (
          <div className="space-y-4">
            {loadingBranches ? (
              <div className="flex justify-center py-6">
                <div className="w-6 h-6 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />
              </div>
            ) : (

              !selectedBranch ? (
                // Selección de sucursal
                <div className="space-y-3">
                  <p className="text-xs text-[var(--text3)] text-center">¿En qué sucursal estás trabajando hoy?</p>
                  {branches.map(branch => (
                    <button
                      key={branch.id}
                      onClick={() => { setSelectedBranch(branch); setSelectedRegister(null); setError('') }}
                      className="w-full flex items-center gap-3 px-4 py-3 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] hover:border-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-all text-left"
                    >
                      <div className="w-8 h-8 rounded-lg bg-[var(--surface2)] flex items-center justify-center flex-shrink-0">
                        <Building2 size={15} className="text-[var(--accent)]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[var(--text)]">{branch.name}</p>
                        {branch.address && (
                          <p className="text-xs text-[var(--text3)] truncate">{branch.address}</p>
                        )}
                        <p className="text-xs text-[var(--text3)]">{branch.registers.length} caja(s)</p>
                      </div>
                      <ChevronRight size={16} className="text-[var(--text3)] flex-shrink-0" />
                    </button>
                  ))}
                </div>
              ) : !selectedRegister ? (
                // Selección de caja
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <button onClick={handleChangeWorkstation}
                      className="text-xs text-[var(--text3)] hover:text-[var(--text)]">
                      ← Cambiar sucursal
                    </button>
                    <span className="text-xs text-[var(--text3)]">·</span>
                    <span className="text-xs font-medium text-[var(--accent)]">{selectedBranch.name}</span>
                  </div>
                  <p className="text-xs text-[var(--text3)] text-center">¿En qué caja vas a trabajar?</p>
                  {selectedBranch.registers.map(reg => (
                    <button
                      key={reg.id}
                      onClick={() => { setSelectedRegister(reg); setError('') }}
                      className="w-full flex items-center gap-3 px-4 py-3 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] hover:border-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-all text-left"
                    >
                      <div className="w-8 h-8 rounded-lg bg-[var(--surface2)] flex items-center justify-center flex-shrink-0">
                        <CreditCard size={15} className="text-[var(--accent)]" />
                      </div>
                      <p className="flex-1 text-sm font-semibold text-[var(--text)]">{reg.name}</p>
                      <ChevronRight size={16} className="text-[var(--text3)] flex-shrink-0" />
                    </button>
                  ))}
                </div>
              ) : (
                // Confirmación
                <div className="space-y-4">
                  <div className="bg-[var(--accent-subtle)] border border-[var(--accent)] rounded-[var(--radius-lg)] p-4 space-y-2">
                    <p className="text-xs font-medium text-[var(--accent)]">Tu puesto de hoy</p>
                    <div className="flex items-center gap-2">
                      <Building2 size={14} className="text-[var(--accent)]" />
                      <span className="text-sm font-semibold text-[var(--text)]">{selectedBranch.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CreditCard size={14} className="text-[var(--accent)]" />
                      <span className="text-sm text-[var(--text)]">{selectedRegister.name}</span>
                    </div>
                  </div>

                  {error && <p className="text-xs text-[var(--danger)] text-center">{error}</p>}

                  <button
                    onClick={handleSelectWorkstation}
                    disabled={confirmLoading}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold rounded-[var(--radius-md)] transition-colors disabled:opacity-60"
                  >
                    {confirmLoading ? (
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <LogIn size={15} />
                        Comenzar turno
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleChangeWorkstation}
                    className="w-full text-xs text-[var(--text3)] hover:text-[var(--text)] transition-colors"
                  >
                    Cambiar selección
                  </button>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  )
}
