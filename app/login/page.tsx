'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { api } from '@/lib/api'
import { useWorkstation } from '@/hooks/useWorkstation'

interface Branch {
  id: string
  name: string
  address?: string
  warehouse_id?: string
  registers: { id: string; name: string }[]
}

const ROLE_REDIRECT: Record<string, string> = {
  owner:   '/dashboard',
  admin:   '/dashboard',
  cashier: '/pos',
  stocker: '/dashboard',
  seller:  '/orders',
}

// ── Logo ──────────────────────────────────────────────────────────────────────
function Logo({ light = false, size = 28 }: { light?: boolean; size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        style={{ width: size, height: size, borderRadius: size * 0.24, background: '#16a34a', flexShrink: 0 }}
        className="flex items-center justify-center"
      >
        <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 16 16" fill="none">
          <path d="M9.5 1.5L4 9h5l-2.5 5.5L14 7H9L11.5 1.5z" fill="white" />
        </svg>
      </div>
      <span
        style={{ fontSize: size * 0.71, letterSpacing: '-0.02em' }}
        className={`font-bold leading-none ${light ? 'text-white' : 'text-gray-900'}`}
      >
        StockOS
      </span>
    </div>
  )
}

// ── Branding Panel ────────────────────────────────────────────────────────────
function BrandingPanel() {
  const stats = [
    { label: 'Ventas hoy',  value: '$284.500', badge: '+12%',     c: '#4ade80' },
    { label: 'Productos',   value: '1.247',    badge: 'en stock',  c: '#86efac' },
    { label: 'Sucursales',  value: '3',        badge: 'activas',   c: '#bbf7d0' },
  ]

  return (
    <div
      className="relative flex flex-col overflow-hidden"
      style={{
        background: 'linear-gradient(160deg,#14532d 0%,#166534 60%,#052e16 100%)',
        padding: '40px 44px',
        minHeight: '100%',
      }}
    >
      {/* dot grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle,rgba(255,255,255,.07) 1px,transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />
      {/* glow */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: -80, left: -80, width: 300, height: 300,
          background: 'radial-gradient(circle,rgba(74,222,128,.15) 0%,transparent 70%)',
        }}
      />

      <div className="relative">
        <Logo light size={32} />
      </div>

      <div className="relative flex-1 flex flex-col justify-center gap-7 mt-12">
        <div>
          <p
            className="font-medium uppercase mb-2.5"
            style={{ color: 'rgba(255,255,255,.55)', fontSize: 12, letterSpacing: '.06em' }}
          >
            El sistema de tu negocio
          </p>
          <h2
            className="font-extrabold text-white leading-tight"
            style={{ fontSize: 32, letterSpacing: '-0.03em' }}
          >
            Control total<br />de tu negocio<br />en un solo lugar.
          </h2>
        </div>

        {/* Mini app card */}
        <div
          className="rounded-2xl"
          style={{
            background: 'rgba(255,255,255,.06)',
            border: '1px solid rgba(255,255,255,.12)',
            padding: 20,
            backdropFilter: 'blur(8px)',
            animation: 'floatUp 4s ease-in-out infinite',
          }}
        >
          <div className="flex items-center justify-between mb-3.5">
            <div className="flex gap-1.5">
              {['#ff5f57', '#febc2e', '#28c840'].map(c => (
                <div key={c} className="w-2 h-2 rounded-full" style={{ background: c }} />
              ))}
            </div>
            <span className="font-mono" style={{ color: 'rgba(255,255,255,.35)', fontSize: 11 }}>
              stockos.digital
            </span>
          </div>
          {stats.map((s, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg"
              style={{
                padding: '9px 11px',
                marginBottom: i < 2 ? 5 : 0,
                background: 'rgba(255,255,255,.05)',
                border: '1px solid rgba(255,255,255,.07)',
                animation: `countUp .4s ease ${i * 0.12}s both`,
              }}
            >
              <span className="font-medium" style={{ color: 'rgba(255,255,255,.5)', fontSize: 12 }}>
                {s.label}
              </span>
              <div className="flex gap-2 items-center">
                <span className="text-white font-bold" style={{ fontSize: 13 }}>{s.value}</span>
                <span className="font-semibold" style={{ color: s.c, fontSize: 11 }}>{s.badge}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Social proof */}
        <div className="flex items-center gap-3">
          <div className="flex">
            {['M', 'J', 'L', 'A'].map((l, i) => (
              <div
                key={i}
                className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold"
                style={{
                  background: ['#4ade80', '#86efac', '#22c55e', '#16a34a'][i],
                  border: '2px solid #14532d',
                  marginLeft: i > 0 ? -8 : 0,
                  color: '#14532d',
                }}
              >
                {l}
              </div>
            ))}
          </div>
          <p style={{ color: 'rgba(255,255,255,.6)', fontSize: 13 }} className="leading-snug">
            <strong className="text-white">+2.400 negocios</strong> ya usan StockOS
          </p>
        </div>
      </div>

      <p
        className="relative"
        style={{ color: 'rgba(255,255,255,.3)', fontSize: 12, marginTop: 28 }}
      >
        POS · Stock · Facturación ARCA · Multi-sucursal
      </p>
    </div>
  )
}

// ── Field ─────────────────────────────────────────────────────────────────────
function Field({
  label, placeholder, value, onChange, type = 'text', showToggle, autoFocus,
}: {
  label: string
  placeholder: string
  value: string
  onChange: (v: string) => void
  type?: string
  showToggle?: boolean
  autoFocus?: boolean
}) {
  const [show, setShow] = useState(false)
  const [focused, setFocused] = useState(false)

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[13px] font-semibold text-gray-700">{label}</label>
      <div className="relative">
        <input
          type={showToggle ? (show ? 'text' : 'password') : type}
          placeholder={placeholder}
          value={value}
          autoFocus={autoFocus}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: '100%',
            padding: '11px 14px',
            paddingRight: showToggle ? 44 : 14,
            fontSize: 15,
            color: '#111827',
            background: '#fff',
            border: `1.5px solid ${focused ? '#16a34a' : '#e5e7eb'}`,
            borderRadius: 12,
            outline: 'none',
            boxShadow: focused ? '0 0 0 3px #f0fdf4' : 'none',
            transition: 'border-color .15s, box-shadow .15s',
            fontFamily: 'inherit',
          }}
        />
        {showToggle && (
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            {show ? (
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M2 10s3-7 8-7 8 7 8 7-3 7-8 7-8-7-8-7z" />
                <circle cx="10" cy="10" r="3" />
                <line x1="3" y1="3" x2="17" y2="17" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M2 10s3-7 8-7 8 7 8 7-3 7-8 7-8-7-8-7z" />
                <circle cx="10" cy="10" r="3" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Branch / Register card ────────────────────────────────────────────────────
function SelectCard({
  icon, title, subtitle, onClick,
}: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="w-full flex items-center gap-3 text-left transition-all"
      style={{
        padding: '13px 16px',
        background: hovered ? '#f0fdf4' : '#fff',
        border: `1.5px solid ${hovered ? '#16a34a' : '#e5e7eb'}`,
        borderRadius: 12,
      }}
    >
      <div
        className="flex items-center justify-center flex-shrink-0"
        style={{
          width: 36, height: 36,
          background: hovered ? '#dcfce7' : '#f9fafb',
          borderRadius: 9,
          transition: 'background .15s',
        }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold text-gray-900">{title}</p>
        {subtitle && <p className="text-[12px] text-gray-400 truncate">{subtitle}</p>}
      </div>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-gray-300 flex-shrink-0">
        <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function IconBuilding() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18M3 7l9-4 9 4M4 7v14M20 7v14M9 21v-4a3 3 0 0 1 6 0v4" />
    </svg>
  )
}

function IconRegister() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </svg>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const { setWorkstation } = useWorkstation()

  const [step, setStep] = useState<'credentials' | 'workstation'>('credentials')
  const [animKey, setAnimKey] = useState(0)

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  // workstation
  const [branches, setBranches]               = useState<Branch[]>([])
  const [selectedBranch, setSelectedBranch]   = useState<Branch | null>(null)
  const [selectedRegister, setSelectedRegister] = useState<{ id: string; name: string } | null>(null)
  const [loadingBranches, setLoadingBranches] = useState(false)
  const [confirmLoading, setConfirmLoading]   = useState(false)

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

      const profile = await api.get<{ role: string }>('/api/auth/me')

      if (profile.role === 'cashier') {
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
        setAnimKey(k => k + 1)
        setStep('workstation')
        setLoading(false)
      } else {
        setWorkstation(null)
        router.replace(ROLE_REDIRECT[profile.role] ?? '/dashboard')
      }
    } catch {
      setError('Error al iniciar sesión')
      setLoading(false)
    }
  }

  const handleSelectWorkstation = () => {
    if (!selectedBranch)   { setError('Seleccioná una sucursal'); return }
    if (!selectedRegister) { setError('Seleccioná una caja'); return }
    setConfirmLoading(true)
    setWorkstation({
      branch_id:     selectedBranch.id,
      branch_name:   selectedBranch.name,
      register_id:   selectedRegister.id,
      register_name: selectedRegister.name,
      warehouse_id:  selectedBranch.warehouse_id,
    })
    router.replace('/pos')
  }

  const resetWorkstation = () => {
    setSelectedBranch(null)
    setSelectedRegister(null)
    setError('')
  }

  // ── Workstation sub-steps ──────────────────────────────────────────────────
  const renderWorkstation = () => {
    if (loadingBranches) {
      return (
        <div className="flex justify-center py-10">
          <div
            className="w-6 h-6 rounded-full"
            style={{ border: '2.5px solid #e5e7eb', borderTopColor: '#16a34a', animation: 'spin .8s linear infinite' }}
          />
        </div>
      )
    }

    // Sub-step A — elegir sucursal
    if (!selectedBranch) {
      return (
        <div style={{ animation: 'fadeUp .3s ease both' }}>
          <p className="text-[13px] font-semibold text-gray-500 uppercase mb-4" style={{ letterSpacing: '.05em' }}>
            ¿En qué sucursal estás hoy?
          </p>
          <div className="flex flex-col gap-2.5">
            {branches.map(branch => (
              <SelectCard
                key={branch.id}
                icon={<IconBuilding />}
                title={branch.name}
                subtitle={branch.address || `${branch.registers.length} caja${branch.registers.length !== 1 ? 's' : ''}`}
                onClick={() => { setSelectedBranch(branch); setSelectedRegister(null); setError('') }}
              />
            ))}
          </div>
        </div>
      )
    }

    // Sub-step B — elegir caja
    if (!selectedRegister) {
      return (
        <div style={{ animation: 'fadeUp .3s ease both' }}>
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={resetWorkstation}
              className="text-[12px] text-gray-400 hover:text-gray-600 transition-colors"
            >
              ← Cambiar sucursal
            </button>
            <span className="text-gray-300">·</span>
            <span className="text-[12px] font-semibold" style={{ color: '#16a34a' }}>{selectedBranch.name}</span>
          </div>
          <p className="text-[13px] font-semibold text-gray-500 uppercase mb-4" style={{ letterSpacing: '.05em' }}>
            ¿En qué caja vas a trabajar?
          </p>
          <div className="flex flex-col gap-2.5">
            {selectedBranch.registers.map(reg => (
              <SelectCard
                key={reg.id}
                icon={<IconRegister />}
                title={reg.name}
                onClick={() => { setSelectedRegister(reg); setError('') }}
              />
            ))}
          </div>
        </div>
      )
    }

    // Sub-step C — confirmación
    return (
      <div style={{ animation: 'fadeUp .3s ease both' }} className="flex flex-col gap-4">
        <div
          className="rounded-xl p-4 flex flex-col gap-3"
          style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0' }}
        >
          <p className="text-[11px] font-semibold uppercase" style={{ color: '#16a34a', letterSpacing: '.06em' }}>
            Tu puesto de hoy
          </p>
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg" style={{ background: '#dcfce7' }}>
              <IconBuilding />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-gray-900">{selectedBranch.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg" style={{ background: '#dcfce7' }}>
              <IconRegister />
            </div>
            <div>
              <p className="text-[13px] text-gray-700">{selectedRegister.name}</p>
            </div>
          </div>
        </div>

        {error && <p className="text-[12px] text-red-500 text-center">{error}</p>}

        <button
          onClick={handleSelectWorkstation}
          disabled={confirmLoading}
          className="w-full bg-[#16a34a] hover:bg-[#15803d] active:scale-[.98] text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-60"
          style={{ padding: '13px', fontSize: 15, letterSpacing: '-0.01em' }}
        >
          {confirmLoading ? (
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            'Comenzar turno'
          )}
        </button>
        <button
          onClick={resetWorkstation}
          className="w-full text-[13px] text-gray-400 hover:text-gray-600 transition-colors"
          style={{ padding: '8px' }}
        >
          Cambiar selección
        </button>
      </div>
    )
  }

  return (
    <>
      <style>{`
        @keyframes fadeUp  { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin    { to { transform:rotate(360deg); } }
        @keyframes floatUp { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes countUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @media (max-width: 767px) {
          .login-grid { display: block !important; }
          .login-brand-panel { display: none !important; }
          .login-mobile-logo { display: flex !important; }
        }
      `}</style>

      <div
        className="login-grid"
        style={{ display: 'grid', gridTemplateColumns: 'clamp(260px,42%,500px) 1fr', minHeight: '100vh' }}
      >
        {/* Left — branding */}
        <div className="login-brand-panel" style={{ position: 'sticky', top: 0, height: '100vh' }}>
          <div style={{ height: '100%' }}>
            <BrandingPanel />
          </div>
        </div>

        {/* Right — form */}
        <div
          className="flex flex-col items-center justify-center p-6"
          style={{ background: '#f9fafb', minHeight: '100vh' }}
        >
          {/* Logo solo en mobile */}
          <div className="login-mobile-logo mb-6" style={{ display: 'none' }}>
            <Logo size={28} />
          </div>

          <div
            className="w-full"
            style={{
              maxWidth: 440,
              background: '#fff',
              borderRadius: 20,
              border: '1px solid #e5e7eb',
              padding: '36px 36px 28px',
              boxShadow: '0 4px 24px rgba(0,0,0,.06)',
            }}
          >
            <div key={animKey}>

              {/* ── Credenciales ── */}
              {step === 'credentials' && (
                <form onSubmit={handleLogin} style={{ animation: 'fadeUp .35s ease both' }}>
                  <h1 className="text-gray-900 mb-1.5" style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em' }}>
                    Bienvenido de nuevo
                  </h1>
                  <p className="text-gray-500 text-[15px] mb-7">Ingresá con tu cuenta de StockOS.</p>

                  <div className="flex flex-col gap-[18px]">
                    <Field
                      label="Email"
                      placeholder="tu@email.com"
                      value={email}
                      onChange={setEmail}
                      type="email"
                      autoFocus
                    />
                    <Field
                      label="Contraseña"
                      placeholder="••••••••"
                      value={password}
                      onChange={setPassword}
                      showToggle
                    />
                  </div>

                  {error && (
                    <div className="mt-4 px-3 py-2.5 rounded-xl bg-red-50 border border-red-100">
                      <p className="text-sm text-red-500 text-center">{error}</p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full mt-6 bg-[#16a34a] hover:bg-[#15803d] active:scale-[.98] text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{ padding: '13px', fontSize: 15, letterSpacing: '-0.01em' }}
                  >
                    {loading ? (
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      'Ingresar'
                    )}
                  </button>
                </form>
              )}

              {/* ── Workstation selector ── */}
              {step === 'workstation' && (
                <div style={{ animation: 'fadeUp .35s ease both' }}>
                  <h1 className="text-gray-900 mb-1.5" style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em' }}>
                    Tu puesto de trabajo
                  </h1>
                  <p className="text-gray-500 text-[15px] mb-7">Seleccioná dónde vas a trabajar hoy.</p>
                  {renderWorkstation()}
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </>
  )
}
