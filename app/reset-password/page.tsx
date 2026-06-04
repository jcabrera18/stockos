'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import type { EmailOtpType } from '@supabase/supabase-js'
import { AuthLayout } from '@/components/layout/AuthLayout'

// ── Password field con toggle ─────────────────────────────────────────────────
function PasswordField({
  label, value, onChange, autoFocus,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  autoFocus?: boolean
}) {
  const [show, setShow] = useState(false)
  const [focused, setFocused] = useState(false)
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[13px] font-semibold text-gray-700">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          placeholder="••••••••"
          value={value}
          autoFocus={autoFocus}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: '100%',
            padding: '11px 14px',
            paddingRight: 44,
            fontSize: 16,
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
      </div>
    </div>
  )
}

type Phase = 'verifying' | 'ready' | 'invalid' | 'done'

export default function ResetPasswordPage() {
  const router = useRouter()
  const supabase = createClient()

  const [phase, setPhase]       = useState<Phase>('verifying')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  // ── Validar el token del email y abrir la sesión de recovery ────────────────
  useEffect(() => {
    let active = true

    // El evento PASSWORD_RECOVERY se dispara cuando la sesión se resuelve
    // automáticamente desde la URL (flujo con ?code= o #access_token=).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setPhase('ready')
      }
    })

    const resolve = async () => {
      // 1) Link expirado/usado → Supabase devuelve el error en el hash
      const hash = window.location.hash
      if (hash.includes('error')) {
        const params = new URLSearchParams(hash.slice(1))
        if (active) {
          setError(params.get('error_description')?.replace(/\+/g, ' ') || 'El enlace no es válido o expiró.')
          setPhase('invalid')
        }
        return
      }

      const url = new URL(window.location.href)
      const token_hash = url.searchParams.get('token_hash')
      const type = url.searchParams.get('type') as EmailOtpType | null

      // 2) Template con {{ .TokenHash }} (robusto cross-device, sin PKCE)
      if (token_hash && type) {
        const { error: err } = await supabase.auth.verifyOtp({ token_hash, type })
        if (!active) return
        if (err) { setError('El enlace no es válido o expiró.'); setPhase('invalid') }
        else setPhase('ready')
        return
      }

      // 3) Template default ({{ .ConfirmationURL }}): detectSessionInUrl ya
      //    resolvió el ?code= / #access_token=. getSession espera esa init.
      const { data: { session } } = await supabase.auth.getSession()
      if (!active) return
      if (session) { setPhase('ready'); return }

      // Margen para que onAuthStateChange dispare PASSWORD_RECOVERY
      setTimeout(() => {
        if (!active) return
        setPhase(p => (p === 'verifying' ? 'invalid' : p))
      }, 1500)
    }

    resolve()
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  // ── Guardar la contraseña nueva ─────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return }
    if (password !== confirm) { setError('Las contraseñas no coinciden'); return }
    setLoading(true)
    setError('')

    const { error: err } = await supabase.auth.updateUser({ password })
    if (err) {
      setError(err.message === 'New password should be different from the old password.'
        ? 'La nueva contraseña debe ser distinta a la anterior.'
        : 'No pudimos actualizar la contraseña. Pedí un nuevo enlace.')
      setLoading(false)
      return
    }

    // Cerramos la sesión de recovery para forzar un login limpio con la nueva clave
    await supabase.auth.signOut()
    setPhase('done')
    setTimeout(() => router.replace('/login'), 2500)
  }

  return (
    <AuthLayout>
      {/* ── Verificando token ── */}
      {phase === 'verifying' && (
        <div className="flex flex-col items-center py-8" style={{ animation: 'fadeUp .35s ease both' }}>
          <div
            className="w-7 h-7 rounded-full mb-4"
            style={{ border: '2.5px solid #e5e7eb', borderTopColor: '#16a34a', animation: 'spin .8s linear infinite' }}
          />
          <p className="text-gray-500 text-[14px]">Verificando el enlace…</p>
        </div>
      )}

      {/* ── Enlace inválido / expirado ── */}
      {phase === 'invalid' && (
        <div style={{ animation: 'fadeUp .35s ease both' }} className="text-center">
          <div
            className="mx-auto flex items-center justify-center mb-5"
            style={{ width: 56, height: 56, borderRadius: 16, background: '#fef2f2' }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="13" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h1 className="text-gray-900 mb-2" style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em' }}>
            Enlace no válido
          </h1>
          <p className="text-gray-500 text-[15px] leading-relaxed mb-7">
            {error || 'El enlace para restablecer tu contraseña expiró o ya fue usado.'}
          </p>
          <Link
            href="/forgot-password"
            className="inline-block w-full bg-[#16a34a] hover:bg-[#15803d] text-white font-bold rounded-xl transition-all"
            style={{ padding: '13px', fontSize: 15 }}
          >
            Pedir un nuevo enlace
          </Link>
        </div>
      )}

      {/* ── Formulario nueva contraseña ── */}
      {phase === 'ready' && (
        <form onSubmit={handleSubmit} style={{ animation: 'fadeUp .35s ease both' }}>
          <h1 className="text-gray-900 mb-1.5" style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em' }}>
            Nueva contraseña
          </h1>
          <p className="text-gray-500 text-[15px] mb-7">Elegí una contraseña nueva para tu cuenta.</p>

          <div className="flex flex-col gap-[18px]">
            <PasswordField label="Contraseña" value={password} onChange={setPassword} autoFocus />
            <PasswordField label="Repetir contraseña" value={confirm} onChange={setConfirm} />
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
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full" style={{ animation: 'spin .8s linear infinite' }} />
            ) : (
              'Guardar contraseña'
            )}
          </button>
        </form>
      )}

      {/* ── Éxito ── */}
      {phase === 'done' && (
        <div style={{ animation: 'fadeUp .35s ease both' }} className="text-center">
          <div
            className="mx-auto flex items-center justify-center mb-5"
            style={{ width: 56, height: 56, borderRadius: 16, background: '#f0fdf4' }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <h1 className="text-gray-900 mb-2" style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em' }}>
            ¡Contraseña actualizada!
          </h1>
          <p className="text-gray-500 text-[15px] leading-relaxed mb-7">
            Te llevamos al inicio de sesión para que entres con tu nueva contraseña…
          </p>
          <Link
            href="/login"
            className="inline-block text-[#16a34a] font-semibold text-[14px] hover:underline"
          >
            Ir a iniciar sesión
          </Link>
        </div>
      )}
    </AuthLayout>
  )
}
