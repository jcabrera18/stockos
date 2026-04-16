import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'StockOS — Gestión de stock y ventas para retail LATAM'
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
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Logo / icon area */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 96,
            height: 96,
            borderRadius: 24,
            background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
            marginBottom: 32,
          }}
        >
          <span style={{ fontSize: 48 }}>📦</span>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            color: '#f8fafc',
            letterSpacing: '-2px',
            marginBottom: 16,
          }}
        >
          Stock<span style={{ color: '#3b82f6' }}>OS</span>
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 28,
            color: '#94a3b8',
            textAlign: 'center',
            maxWidth: 700,
            lineHeight: 1.4,
          }}
        >
          Gestión de stock y ventas para retail LATAM
        </div>

        {/* Features row */}
        <div
          style={{
            display: 'flex',
            gap: 24,
            marginTop: 48,
          }}
        >
          {['Multi-sucursal', 'POS', 'Inventario', 'Finanzas'].map((feature) => (
            <div
              key={feature}
              style={{
                display: 'flex',
                padding: '10px 20px',
                borderRadius: 999,
                background: 'rgba(59, 130, 246, 0.15)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                color: '#93c5fd',
                fontSize: 20,
              }}
            >
              {feature}
            </div>
          ))}
        </div>

        {/* URL */}
        <div
          style={{
            position: 'absolute',
            bottom: 40,
            color: '#475569',
            fontSize: 20,
          }}
        >
          stockos.digital
        </div>
      </div>
    ),
    size,
  )
}
