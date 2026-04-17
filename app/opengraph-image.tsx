import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'StockOS — Control total de tu negocio, en tiempo real'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a08',
          fontFamily: 'system-ui, sans-serif',
          position: 'relative',
        }}
      >
        {/* Glow background */}
        <div
          style={{
            position: 'absolute',
            top: -100,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 800,
            height: 400,
            borderRadius: '50%',
            background: 'radial-gradient(ellipse, rgba(22,163,74,0.18) 0%, transparent 70%)',
          }}
        />

        {/* Logo */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            marginBottom: 40,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 72,
              height: 72,
              borderRadius: 18,
              background: '#16a34a',
            }}
          >
            <svg viewBox="0 0 32 32" width="38" height="38">
              <path d="M18 4 L10 18 L15 18 L14 28 L22 14 L17 14 Z" fill="white" />
            </svg>
          </div>
          <span
            style={{
              fontSize: 52,
              fontWeight: 700,
              color: '#ffffff',
              letterSpacing: '-1px',
            }}
          >
            StockOS
          </span>
        </div>

        {/* Headline */}
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            color: '#ffffff',
            textAlign: 'center',
            letterSpacing: '-2px',
            lineHeight: 1.1,
            maxWidth: 900,
            marginBottom: 20,
          }}
        >
          Control total de tu negocio,{' '}
          <span style={{ color: '#4ade80' }}>en tiempo real</span>
        </div>

        {/* Subheadline */}
        <div
          style={{
            fontSize: 26,
            color: 'rgba(255,255,255,0.45)',
            textAlign: 'center',
            maxWidth: 700,
            lineHeight: 1.4,
            marginBottom: 48,
          }}
        >
          Stock, ventas y precios en un solo lugar. Para vender más y no perder plata.
        </div>

        {/* CTA pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '16px 40px',
            borderRadius: 999,
            background: '#16a34a',
            color: '#ffffff',
            fontSize: 24,
            fontWeight: 600,
          }}
        >
          Empezar gratis — stockos.digital
        </div>
      </div>
    ),
    size,
  )
}
