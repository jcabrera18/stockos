'use client'

import { useEffect } from 'react'

// Error boundary de segmento (App Router). Captura errores de render en
// cualquier página y muestra un fallback en vez de una pantalla en blanco.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('Route error:', error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h2 className="text-lg font-semibold text-gray-900">
        Algo salió mal
      </h2>
      <p className="max-w-sm text-sm text-gray-500">
        Ocurrió un error inesperado. Podés reintentar; si persiste, actualizá la
        página.
      </p>
      {error.digest && (
        <p className="text-xs text-gray-400">Código: {error.digest}</p>
      )}
      <button
        onClick={reset}
        className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
      >
        Reintentar
      </button>
    </div>
  )
}
