'use client'
import { useState } from 'react'
import Link from 'next/link'

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
          <span className="sr-only">StockOS home</span>
          <Logo light size={32} />
        </Link>
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

// ── AuthLayout ────────────────────────────────────────────────────────────────
// Layout de dos columnas (panel de branding + card) compartido por las pantallas
// de autenticación auxiliares (forgot/reset password). Mismo estilo que /login.
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        @keyframes fadeUp  { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin    { to { transform:rotate(360deg); } }
        @keyframes floatUp { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes countUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .login-brand-panel { position: sticky; top: 0; height: 100vh; }
        .login-grid { display: grid; grid-template-columns: clamp(260px,42%,500px) 1fr; min-height: 100vh; }
        .login-mobile-logo { display: none; }
        .login-right-panel {
          background: #f9fafb;
          min-height: 100vh;
          padding: 36px;
          justify-content: center;
          gap: 10px;
        }
        .login-card {
          width: 100%;
          max-width: 440px;
          background: #fff;
          border-radius: 20px;
          border: 1px solid #e5e7eb;
          padding: 36px 36px 28px;
          box-shadow: 0 4px 24px rgba(0,0,0,.06);
        }
        @media (max-width: 767px) {
          .login-grid { display: block !important; }
          .login-brand-panel { display: none !important; }
          .login-mobile-logo { display: flex !important; }
          .login-right-panel {
            justify-content: flex-start;
            padding: 24px 20px 18px;
          }
          .login-card {
            border-radius: 18px;
            padding: 28px 22px 22px;
          }
        }
      `}</style>

      <div className="login-grid">
        {/* Left — branding */}
        <div className="login-brand-panel">
          <div style={{ height: '100%' }}>
            <BrandingPanel />
          </div>
        </div>

        {/* Right — form */}
        <div className="login-right-panel flex flex-col items-center">
          {/* Logo solo en mobile */}
          <div className="login-mobile-logo mb-6">
            <Link href="/home" aria-label="Ir a StockOS home">
              <span className="sr-only">StockOS home</span>
              <Logo size={28} />
            </Link>
          </div>

          <div className="w-full login-card">
            {children}
          </div>
        </div>
      </div>
    </>
  )
}
