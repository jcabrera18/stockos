'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

interface RegisterData {
  biz: string
  name: string
  email: string
  pass: string
  pass2: string
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
        <Link href="/home" aria-label="Ir a StockOS home">
          <Logo light size={32} />
        </Link>
      </div>

      <div className="relative flex-1 flex flex-col justify-center gap-7 mt-12 brand-panel-extras">
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
        className="relative brand-panel-extras"
        style={{ color: 'rgba(255,255,255,.3)', fontSize: 12, marginTop: 28 }}
      >
        POS · Stock · Facturación ARCA · Multi-sucursal
      </p>
    </div>
  )
}

// ── Step Indicator ────────────────────────────────────────────────────────────
function StepIndicator({ step }: { step: number }) {
  return (
    <div className="flex items-start mb-8">
      {(['Tu negocio', 'Tu cuenta'] as const).map((label, i) => {
        const n = i + 1
        const done = step > n
        const active = step === n
        return (
          <div key={i} className={`flex items-center ${i === 0 ? '' : ''}`} style={{ flex: i === 0 ? 'none' : 'none' }}>
            <div className="flex flex-col items-center gap-1.5">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300"
                style={{
                  background: done || active ? '#16a34a' : '#e5e7eb',
                  border: `2px solid ${done || active ? '#16a34a' : '#e5e7eb'}`,
                  boxShadow: active ? '0 0 0 4px #f0fdf4' : 'none',
                }}
              >
                {done ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2.5 7L5.5 10L11.5 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <span style={{ fontSize: 12, fontWeight: 700, color: active ? '#fff' : '#9ca3af' }}>{n}</span>
                )}
              </div>
              <span
                className="text-[11px] font-medium whitespace-nowrap"
                style={{ color: done || active ? '#16a34a' : '#9ca3af' }}
              >
                {label}
              </span>
            </div>
            {i === 0 && (
              <div
                className="transition-all duration-500"
                style={{
                  height: 2,
                  width: 48,
                  background: step > 1 ? '#16a34a' : '#e5e7eb',
                  margin: '0 8px 18px',
                  flexShrink: 0,
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Field ─────────────────────────────────────────────────────────────────────
function Field({
  label, placeholder, value, onChange, type = 'text', error, showToggle, autoFocus,
}: {
  label: string
  placeholder: string
  value: string
  onChange: (v: string) => void
  type?: string
  error?: string
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
          fontSize: 16,
          color: '#111827',
          background: '#fff',
          border: `1.5px solid ${error ? '#ef4444' : focused ? '#16a34a' : '#e5e7eb'}`,
          borderRadius: 12,
          outline: 'none',
          boxShadow: focused ? `0 0 0 3px ${error ? '#fee2e2' : '#f0fdf4'}` : 'none',
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
      {error && <span className="text-[12px] font-medium text-red-500">{error}</span>}
    </div>
  )
}

// ── Password Strength ─────────────────────────────────────────────────────────
function PasswordStrength({ password }: { password: string }) {
  if (!password) return null
  const strength = password.length < 6 ? 1 : password.length < 10 ? 2 : 3
  const colors = ['', '#ef4444', '#f59e0b', '#16a34a']
  const labels = ['', 'Débil', 'Regular', 'Segura']
  return (
    <div className="flex items-center gap-2 mt-1.5">
      <div className="flex gap-1 flex-1">
        {[1, 2, 3].map(i => (
          <div
            key={i}
            className="h-[3px] flex-1 rounded-full transition-all duration-300"
            style={{ background: strength >= i ? colors[strength] : '#e5e7eb' }}
          />
        ))}
      </div>
      <span className="text-[11px] font-semibold min-w-[44px]" style={{ color: colors[strength] }}>
        {labels[strength]}
      </span>
    </div>
  )
}

// ── Trust Badges ──────────────────────────────────────────────────────────────
function TrustBadges() {
  return (
    <div
      className="flex flex-wrap gap-x-4 gap-y-1.5 mt-5 pt-4 justify-center"
      style={{ borderTop: '1px solid #f3f4f6' }}
    >
      {['Sin tarjeta de crédito', 'Gratis para empezar', 'Soporte en español'].map(t => (
        <div key={t} className="flex items-center gap-1.5">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <circle cx="6.5" cy="6.5" r="6.5" fill="#f0fdf4" />
            <path d="M3.5 6.5L5.5 8.5L9.5 4.5" stroke="#16a34a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[12px] font-medium text-gray-500">{t}</span>
        </div>
      ))}
    </div>
  )
}

// ── Step 1 ────────────────────────────────────────────────────────────────────
function Step1({ data, onNext }: { data: RegisterData; onNext: (d: Partial<RegisterData>) => void }) {
  const [biz, setBiz] = useState(data.biz || '')
  const [name, setName] = useState(data.name || '')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const go = (e: React.FormEvent) => {
    e.preventDefault()
    const err: Record<string, string> = {}
    if (!biz.trim()) err.biz = 'Ingresá el nombre de tu negocio'
    if (!name.trim()) err.name = 'Ingresá tu nombre completo'
    setErrors(err)
    if (!Object.keys(err).length) onNext({ biz, name })
  }

  return (
    <form onSubmit={go} style={{ animation: 'fadeUp .35s ease both' }}>
      <StepIndicator step={1} />
      <h1 className="text-gray-900 mb-1.5" style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em' }}>
        Contanos tu negocio
      </h1>
      <p className="text-gray-500 text-[15px] mb-7">En menos de 2 minutos tu cuenta está lista.</p>
      <div className="flex flex-col gap-[18px]">
        <Field
          label="Nombre del negocio"
          placeholder="Ej: El Económico, Ferretería López..."
          value={biz}
          onChange={setBiz}
          error={errors.biz}
          autoFocus
        />
        <Field
          label="Tu nombre completo"
          placeholder="Ej: Juan García"
          value={name}
          onChange={setName}
          error={errors.name}
        />
      </div>
      <button
        type="submit"
        className="w-full mt-6 bg-[#16a34a] hover:bg-[#15803d] active:scale-[.98] text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
        style={{ padding: '13px', fontSize: 15, letterSpacing: '-0.01em' }}
      >
        Continuar <span style={{ fontSize: 16 }}>→</span>
      </button>
      <p className="text-center mt-4 text-[13px] text-gray-500">
        ¿Ya tenés cuenta?{' '}
        <Link href="/login" className="text-[#16a34a] font-semibold hover:underline">
          Ingresá acá
        </Link>
      </p>
      <TrustBadges />
    </form>
  )
}

// ── Step 2 ────────────────────────────────────────────────────────────────────
function Step2({
  data, onNext, onBack, loading, apiError,
}: {
  data: RegisterData
  onNext: (d: Partial<RegisterData>) => void
  onBack: () => void
  loading: boolean
  apiError: string
}) {
  const [email, setEmail] = useState(data.email || '')
  const [pass, setPass]   = useState(data.pass  || '')
  const [pass2, setPass2] = useState(data.pass2 || '')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const go = (e: React.FormEvent) => {
    e.preventDefault()
    const err: Record<string, string> = {}
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) err.email = 'Ingresá un email válido'
    if (pass.length < 6) err.pass = 'Mínimo 6 caracteres'
    if (pass !== pass2)  err.pass2 = 'Las contraseñas no coinciden'
    setErrors(err)
    if (!Object.keys(err).length) onNext({ email, pass, pass2 })
  }

  return (
    <form onSubmit={go} style={{ animation: 'fadeUp .35s ease both' }}>
      <StepIndicator step={2} />
      <h1 className="text-gray-900 mb-1.5" style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em' }}>
        Creá tu cuenta
      </h1>
      <p className="text-gray-500 text-[15px] mb-7">Usarás este email para ingresar a StockOS.</p>
      <div className="flex flex-col gap-[18px]">
        <Field
          label="Email"
          placeholder="juan@ferreteria.com"
          value={email}
          onChange={setEmail}
          type="email"
          error={errors.email}
          autoFocus
        />
        <div>
          <Field
            label="Contraseña"
            placeholder="Mínimo 6 caracteres"
            value={pass}
            onChange={setPass}
            showToggle
            error={errors.pass}
          />
          <PasswordStrength password={pass} />
        </div>
        <Field
          label="Confirmar contraseña"
          placeholder="Repetí tu contraseña"
          value={pass2}
          onChange={setPass2}
          showToggle
          error={errors.pass2}
        />
      </div>

      {apiError && (
        <div className="mt-4 px-3 py-2.5 rounded-xl bg-red-50 border border-red-100">
          <p className="text-sm text-red-500 text-center">{apiError}</p>
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
          <>Crear mi cuenta gratis <span style={{ fontSize: 16 }}>→</span></>
        )}
      </button>
      <button
        type="button"
        onClick={onBack}
        className="w-full mt-2.5 text-[14px] font-semibold text-gray-500 hover:text-gray-700 hover:border-gray-400 rounded-xl transition-all"
        style={{ padding: '11px', border: '1.5px solid #e5e7eb' }}
      >
        ← Volver
      </button>
      <TrustBadges />
    </form>
  )
}

// ── Step 3 — Éxito ────────────────────────────────────────────────────────────
function Step3({ bizName }: { bizName: string }) {
  const [phase, setPhase] = useState(0)

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 1000)
    const t2 = setTimeout(() => setPhase(2), 2800)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  return (
    <div style={{ animation: 'fadeUp .4s ease both' }} className="text-center py-4">
      <div
        className="w-[88px] h-[88px] rounded-full flex items-center justify-center mx-auto mb-7"
        style={{
          background: '#f0fdf4',
          border: '2px solid #bbf7d0',
          animation: 'scaleIn .5s cubic-bezier(.34,1.56,.64,1) both',
        }}
      >
        <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
          <circle cx="22" cy="22" r="20" fill="#16a34a" />
          <path
            d="M13 22L19 28L31 16"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ strokeDasharray: 30, strokeDashoffset: 30, animation: 'drawCheck .5s ease .2s forwards' }}
          />
        </svg>
      </div>
      <h1
        className="text-gray-900 mb-2.5 leading-tight"
        style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em' }}
      >
        ¡<span style={{ color: '#16a34a' }}>{bizName || 'Tu negocio'}</span> ya está en StockOS!
      </h1>
      <p className="text-gray-500 text-[15px] mb-7">
        {phase === 0 ? 'Preparando tu cuenta…' : 'Entrando al sistema…'}
      </p>
      {phase >= 1 && (
        <div
          className="flex items-center justify-center gap-2.5 mb-6"
          style={{ animation: 'fadeUp .3s ease both' }}
        >
          <div
            className="w-[18px] h-[18px] rounded-full"
            style={{ border: '2.5px solid #e5e7eb', borderTopColor: '#16a34a', animation: 'spin .8s linear infinite' }}
          />
          <span className="text-gray-500 text-[14px]">Configurando tu espacio de trabajo</span>
        </div>
      )}
      <div className="bg-gray-50 rounded-lg h-1 overflow-hidden">
        <div
          className="h-full rounded-lg"
          style={{
            background: 'linear-gradient(90deg,#16a34a,#4ade80)',
            width: phase === 0 ? '35%' : phase === 1 ? '72%' : '100%',
            transition: 'width .9s cubic-bezier(.4,0,.2,1)',
          }}
        />
      </div>
      <div className="mt-7 p-3.5 rounded-xl" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
        <p className="text-[13px] font-medium" style={{ color: '#166534' }}>
          Tu prueba gratuita de 14 dias arranca ahora. Sin tarjeta requerida.
        </p>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function RegisterPage() {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep]         = useState(1)
  const [animKey, setAnimKey]   = useState(0)
  const [loading, setLoading]   = useState(false)
  const [apiError, setApiError] = useState('')
  const [formData, setFormData] = useState<RegisterData>({ biz: '', name: '', email: '', pass: '', pass2: '' })

  const next = (data: Partial<RegisterData>) => {
    setFormData(d => ({ ...d, ...data }))
    setAnimKey(k => k + 1)
    setStep(s => s + 1)
  }

  const back = () => {
    setAnimKey(k => k + 1)
    setStep(s => s - 1)
    setApiError('')
  }

  const handleRegister = async (data: Partial<RegisterData>) => {
    const merged = { ...formData, ...data }
    setFormData(merged)
    setLoading(true)
    setApiError('')

    try {
      const res = await fetch(`${API_URL}/api/auth/onboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: merged.biz.trim(),
          full_name:     merged.name.trim(),
          email:         merged.email.trim().toLowerCase(),
          password:      merged.pass,
        }),
      })

      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setApiError(d.error ?? 'Error al crear la cuenta')
        setLoading(false)
        return
      }

      const { error: loginErr } = await supabase.auth.signInWithPassword({
        email:    merged.email.trim().toLowerCase(),
        password: merged.pass,
      })

      if (loginErr) {
        router.replace('/login')
        return
      }

      setAnimKey(k => k + 1)
      setStep(3)
      setTimeout(() => router.replace('/dashboard'), 3000)
    } catch {
      setApiError('Error de conexión. Intentá de nuevo.')
      setLoading(false)
    }
  }

  return (
    <>
      <style>{`
        @keyframes fadeUp    { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @keyframes drawCheck { from { stroke-dashoffset:30; } to { stroke-dashoffset:0; } }
        @keyframes scaleIn   { 0%{transform:scale(.6);opacity:0} 70%{transform:scale(1.08)} 100%{transform:scale(1);opacity:1} }
        @keyframes spin      { to { transform:rotate(360deg); } }
        @keyframes floatUp   { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes countUp   { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .register-brand-panel { position: sticky; top: 0; height: 100vh; }
        .register-grid { display: grid; grid-template-columns: clamp(260px,42%,500px) 1fr; min-height: 100vh; }
        .register-mobile-logo { display: none; }

        .register-right-panel {
          background: #f9fafb;
          min-height: 100vh;
          padding: 36px;
          justify-content: center;
          gap: 10px;
        }
        .register-card {
          width: 100%;
          max-width: 440px;
          background: #fff;
          border-radius: 20px;
          border: 1px solid #e5e7eb;
          padding: 36px 36px 28px;
          box-shadow: 0 4px 24px rgba(0,0,0,.06);
        }
        .register-terms {
          margin-top: 18px;
        }

        @media (max-width: 767px) {
          .register-grid { display: block !important; }
          .register-brand-panel { display: none !important; }
          .register-mobile-logo { display: flex !important; }
          .register-right-panel {
            justify-content: flex-start;
            padding: 24px 20px 18px;
          }
          .register-card {
            border-radius: 18px;
            padding: 28px 22px 22px;
          }
          .register-terms {
            margin-top: 12px;
            padding-bottom: 6px;
          }
        }
      `}</style>

      <div
        className="register-grid"
      >
        {/* Left — branding */}
        <div className="register-brand-panel">
          <div className="register-brand-inner" style={{ height: '100%' }}>
            <BrandingPanel />
          </div>
        </div>

        {/* Right — form */}
        <div className="register-right-panel flex flex-col items-center">
          {/* Logo solo en mobile */}
          <div className="register-mobile-logo mb-6" style={{ display: 'none' }}>
            <Link href="/home" aria-label="Ir a StockOS home">
              <Logo size={28} />
            </Link>
          </div>
          <div
            className="w-full register-card"
          >
            <div key={animKey}>
              {step === 1 && <Step1 data={formData} onNext={next} />}
              {step === 2 && <Step2 data={formData} onNext={handleRegister} onBack={back} loading={loading} apiError={apiError} />}
              {step === 3 && <Step3 bizName={formData.biz} />}
            </div>
          </div>
          <p className="register-terms mt-4 text-[12px] text-gray-400 text-center">
            Al continuar aceptás los{' '}
            <Link href="#" className="text-[#16a34a] hover:underline">Términos</Link>
            {' '}y la{' '}
            <Link href="#" className="text-[#16a34a] hover:underline">Política de privacidad</Link>
          </p>
        </div>
      </div>
    </>
  )
}
