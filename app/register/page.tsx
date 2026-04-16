'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ArrowRight, Eye, EyeOff, Store, User, CheckCircle, Zap } from 'lucide-react'

type Step = 'negocio' | 'cuenta' | 'exito'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export default function RegisterPage() {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState<Step>('negocio')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  // Paso 1
  const [businessName, setBusinessName] = useState('')
  const [fullName, setFullName]         = useState('')

  // Paso 2
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')

  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (businessName.trim().length < 2) { setError('El nombre del negocio debe tener al menos 2 caracteres'); return }
    if (fullName.trim().length < 2)     { setError('Tu nombre debe tener al menos 2 caracteres'); return }
    setStep('cuenta')
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password !== confirm) { setError('Las contraseñas no coinciden'); return }
    if (password.length < 6)  { setError('La contraseña debe tener al menos 6 caracteres'); return }

    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/auth/onboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: businessName.trim(),
          full_name:     fullName.trim(),
          email:         email.trim().toLowerCase(),
          password,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Error al crear la cuenta')
        setLoading(false)
        return
      }

      // Auto-login
      const { error: loginErr } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })

      if (loginErr) {
        // Si falla el login, de todas formas mandamos al login
        router.replace('/login')
        return
      }

      setStep('exito')
      setTimeout(() => router.replace('/dashboard'), 2500)
    } catch {
      setError('Error de conexión. Intentá de nuevo.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a08] flex items-center justify-center p-4">

      {/* Fondo sutil */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_40%_at_50%_0%,rgba(22,163,74,0.07),transparent_60%)] pointer-events-none" />

      <div className="relative w-full max-w-sm space-y-6">

        {/* Logo */}
        <div className="text-center space-y-2">
          <Link href="/home" className="inline-flex items-center gap-2.5 group">
            <div className="w-11 h-11 rounded-xl bg-[#16a34a] flex items-center justify-center shadow-[0_0_18px_rgba(22,163,74,0.4)] group-hover:shadow-[0_0_28px_rgba(22,163,74,0.55)] transition-shadow">
              <Zap size={20} className="text-white" />
            </div>
            <span className="font-bold text-white text-xl tracking-tight">StockOS</span>
          </Link>
          <p className="text-sm text-white/40">
            {step === 'negocio' && 'Creá tu cuenta gratis en menos de 2 minutos'}
            {step === 'cuenta'  && 'Último paso — tus datos de acceso'}
            {step === 'exito'   && '¡Ya estás adentro!'}
          </p>
        </div>

        {/* Indicador de pasos */}
        {step !== 'exito' && (
          <div className="flex items-center gap-2 justify-center">
            {(['negocio', 'cuenta'] as const).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  step === s
                    ? 'bg-[#16a34a] text-white shadow-[0_0_12px_rgba(22,163,74,0.5)]'
                    : (step === 'cuenta' && s === 'negocio')
                      ? 'bg-[#16a34a]/20 text-[#4ade80]'
                      : 'bg-white/[0.06] text-white/30'
                }`}>
                  {step === 'cuenta' && s === 'negocio' ? <CheckCircle size={13} /> : i + 1}
                </div>
                {i === 0 && (
                  <div className={`w-12 h-px transition-all ${
                    step === 'cuenta' ? 'bg-[#16a34a]/50' : 'bg-white/[0.08]'
                  }`} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Paso 1: Tu negocio ── */}
        {step === 'negocio' && (
          <form onSubmit={handleStep1} className="space-y-4">
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-white/50 block mb-1.5 uppercase tracking-wide">
                  Nombre del negocio
                </label>
                <div className="relative">
                  <Store size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
                  <input
                    type="text"
                    value={businessName}
                    onChange={e => setBusinessName(e.target.value)}
                    placeholder="Ej: El Económico, Ferretería López..."
                    required
                    autoFocus
                    className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl bg-white/[0.05] border border-white/[0.09] text-white placeholder:text-white/20 focus:outline-none focus:border-[#16a34a]/70 focus:bg-white/[0.07] transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-white/50 block mb-1.5 uppercase tracking-wide">
                  Tu nombre completo
                </label>
                <div className="relative">
                  <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Ej: Juan García"
                    required
                    className="w-full pl-9 pr-3 py-2.5 text-sm rounded-xl bg-white/[0.05] border border-white/[0.09] text-white placeholder:text-white/20 focus:outline-none focus:border-[#16a34a]/70 focus:bg-white/[0.07] transition-all"
                  />
                </div>
              </div>
            </div>

            {error && <p className="text-xs text-red-400 text-center">{error}</p>}

            <button
              type="submit"
              className="group w-full flex items-center justify-center gap-2 py-3 bg-[#16a34a] hover:bg-[#15803d] text-white text-sm font-semibold rounded-xl transition-all hover:shadow-[0_0_20px_rgba(22,163,74,0.4)] active:scale-[0.98]"
            >
              Continuar
              <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
            </button>

            <p className="text-center text-xs text-white/25">
              ¿Ya tenés cuenta?{' '}
              <Link href="/login" className="text-white/50 hover:text-white/80 transition-colors underline underline-offset-2">
                Ingresá acá
              </Link>
            </p>
          </form>
        )}

        {/* ── Paso 2: Tu cuenta ── */}
        {step === 'cuenta' && (
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-white/50 block mb-1.5 uppercase tracking-wide">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  required
                  autoFocus
                  className="w-full px-3 py-2.5 text-sm rounded-xl bg-white/[0.05] border border-white/[0.09] text-white placeholder:text-white/20 focus:outline-none focus:border-[#16a34a]/70 focus:bg-white/[0.07] transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-white/50 block mb-1.5 uppercase tracking-wide">
                  Contraseña
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    required
                    className="w-full px-3 py-2.5 pr-10 text-sm rounded-xl bg-white/[0.05] border border-white/[0.09] text-white placeholder:text-white/20 focus:outline-none focus:border-[#16a34a]/70 focus:bg-white/[0.07] transition-all"
                  />
                  <button type="button" onClick={() => setShowPassword(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors">
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-white/50 block mb-1.5 uppercase tracking-wide">
                  Confirmar contraseña
                </label>
                <div className="relative">
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Repetí la contraseña"
                    required
                    className="w-full px-3 py-2.5 pr-10 text-sm rounded-xl bg-white/[0.05] border border-white/[0.09] text-white placeholder:text-white/20 focus:outline-none focus:border-[#16a34a]/70 focus:bg-white/[0.07] transition-all"
                  />
                  <button type="button" onClick={() => setShowConfirm(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors">
                    {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
            </div>

            {error && <p className="text-xs text-red-400 text-center">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="group w-full flex items-center justify-center gap-2 py-3 bg-[#16a34a] hover:bg-[#15803d] text-white text-sm font-semibold rounded-xl transition-all hover:shadow-[0_0_20px_rgba(22,163,74,0.4)] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  Crear mi cuenta gratis
                  <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => { setStep('negocio'); setError('') }}
              className="w-full text-xs text-white/25 hover:text-white/50 transition-colors"
            >
              ← Volver
            </button>
          </form>
        )}

        {/* ── Paso 3: Éxito ── */}
        {step === 'exito' && (
          <div className="text-center space-y-5">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-[#16a34a]/15 border border-[#16a34a]/30 flex items-center justify-center mx-auto shadow-[0_0_40px_rgba(22,163,74,0.2)]">
                <CheckCircle size={40} className="text-[#4ade80]" />
              </div>
            </div>

            <div className="space-y-1.5">
              <h2 className="text-xl font-bold text-white">¡{businessName} ya está en StockOS!</h2>
              <p className="text-sm text-white/40">
                Entrando al sistema...
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 text-xs text-white/25">
              <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-[#4ade80] rounded-full animate-spin" />
              Cargando tu dashboard
            </div>
          </div>
        )}

        {/* Trust badges */}
        {step !== 'exito' && (
          <div className="flex justify-center gap-5 text-[11px] text-white/18">
            {['Sin tarjeta de crédito', 'Gratis para empezar', 'Soporte en español'].map(t => (
              <span key={t} className="flex items-center gap-1">
                <CheckCircle size={10} className="text-[#4ade80]/60" />
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
