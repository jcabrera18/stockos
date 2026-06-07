'use client'

import { WifiOff } from 'lucide-react'

export default function OfflinePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-5 px-6 text-center bg-[var(--bg)]">
      <div className="w-16 h-16 rounded-2xl bg-[var(--surface2)] flex items-center justify-center">
        <WifiOff size={30} className="text-[var(--text3)]" />
      </div>
      <div className="space-y-1.5">
        <h1 className="text-xl font-bold text-[var(--text)]">Sin conexión</h1>
        <p className="text-sm text-[var(--text3)] max-w-xs">
          Esta sección todavía no está disponible offline. Volvé al POS para seguir
          vendiendo; las ventas se sincronizan solas cuando vuelva internet.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <a
          href="/pos"
          className="px-4 py-2 rounded-[var(--radius-md)] bg-[var(--accent)] text-white text-sm font-semibold"
        >
          Ir al POS
        </a>
        <button
          onClick={() => location.reload()}
          className="px-4 py-2 rounded-[var(--radius-md)] border border-[var(--border)] text-[var(--text)] text-sm font-semibold"
        >
          Reintentar
        </button>
      </div>
    </div>
  )
}
