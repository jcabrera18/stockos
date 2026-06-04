'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { AuthLayout } from '@/components/layout/AuthLayout'

export default function ForgotPasswordPage() {
  const supabase = createClient()

  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) { setError('Ingresá tu email'); return }
    setLoading(true)
    setError('')

    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    setLoading(false)
    if (err) { setError('No pudimos enviar el correo. Probá de nuevo en unos minutos.'); return }
    // Por seguridad Supabase no revela si el email existe — siempre éxito genérico
    setSent(true)
  }

  return (
    <AuthLayout>
      {!sent ? (
        <form onSubmit={handleSubmit} style={{ animation: 'fadeUp .35s ease both' }}>
          <h1 className="text-gray-900 mb-1.5" style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em' }}>
            Recuperar contraseña
          </h1>
          <p className="text-gray-500 text-[15px] mb-7">
            Ingresá tu email y te enviamos un enlace para crear una contraseña nueva.
          </p>

          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-semibold text-gray-700">Email</label>
            <input
              type="email"
              placeholder="tu@email.com"
              value={email}
              autoFocus
              onChange={e => setEmail(e.target.value)}
              style={{
                width: '100%',
                padding: '11px 14px',
                fontSize: 16,
                color: '#111827',
                background: '#fff',
                border: '1.5px solid #e5e7eb',
                borderRadius: 12,
                outline: 'none',
                fontFamily: 'inherit',
              }}
              onFocus={e => { e.target.style.borderColor = '#16a34a'; e.target.style.boxShadow = '0 0 0 3px #f0fdf4' }}
              onBlur={e => { e.target.style.borderColor = '#e5e7eb'; e.target.style.boxShadow = 'none' }}
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
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full" style={{ animation: 'spin .8s linear infinite' }} />
            ) : (
              'Enviar enlace'
            )}
          </button>

          <p className="text-center text-[13px] text-gray-400 mt-5">
            <Link href="/login" className="text-[#16a34a] font-semibold hover:underline">
              ← Volver a iniciar sesión
            </Link>
          </p>
        </form>
      ) : (
        <div style={{ animation: 'fadeUp .35s ease both' }} className="text-center">
          <div
            className="mx-auto flex items-center justify-center mb-5"
            style={{ width: 56, height: 56, borderRadius: 16, background: '#f0fdf4' }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 6l-10 7L2 6" />
              <rect x="2" y="4" width="20" height="16" rx="2" />
            </svg>
          </div>
          <h1 className="text-gray-900 mb-2" style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em' }}>
            Revisá tu correo
          </h1>
          <p className="text-gray-500 text-[15px] leading-relaxed mb-1">
            Si existe una cuenta con <strong className="text-gray-700">{email}</strong>, te enviamos un enlace para restablecer tu contraseña.
          </p>
          <p className="text-gray-400 text-[13px] mb-7">
            Revisá también la carpeta de spam. El enlace vence en 1 hora.
          </p>
          <Link
            href="/login"
            className="inline-block text-[#16a34a] font-semibold text-[14px] hover:underline"
          >
            ← Volver a iniciar sesión
          </Link>
        </div>
      )}
    </AuthLayout>
  )
}
