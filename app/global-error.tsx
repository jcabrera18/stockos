'use client'

// Boundary de último recurso: captura errores lanzados en el root layout,
// que el error.tsx de segmento no alcanza. Debe renderizar su propio <html>.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="es">
      <body>
        <div
          style={{
            display: 'flex',
            minHeight: '100vh',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            fontFamily: 'system-ui, sans-serif',
            textAlign: 'center',
            padding: '1.5rem',
          }}
        >
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>
            Algo salió mal
          </h2>
          <p style={{ maxWidth: '24rem', color: '#6b7280', fontSize: '0.875rem' }}>
            Ocurrió un error inesperado. Actualizá la página para continuar.
          </p>
          <button
            onClick={reset}
            style={{
              borderRadius: '0.5rem',
              background: '#111827',
              color: '#fff',
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  )
}
