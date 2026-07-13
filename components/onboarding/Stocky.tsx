'use client'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────
// Stocky — personaje de StockOS. Renders reales en /public/stocky/.
// A medida que llegan más emociones, agregar el archivo y sumarlo a
// ASSET; los moods sin render propio caen al más cercano vía FALLBACK.
// ─────────────────────────────────────────────────────────────
export type StockyMood = 'happy' | 'excited' | 'wave' | 'wink' | 'thinking' | 'idle'

// Renders disponibles hoy
const ASSET: Partial<Record<StockyMood, string>> = {
  wave: '/stocky/wave.png',
  wink: '/stocky/wink.png',
}

// Mood sin render propio → el más parecido de los disponibles
const FALLBACK: Record<StockyMood, StockyMood> = {
  wave: 'wave',
  happy: 'wave',
  excited: 'wave',
  wink: 'wink',
  idle: 'wink',
  thinking: 'wink',
}

export function Stocky({ mood = 'idle', size = 56, className }: { mood?: StockyMood; size?: number; className?: string }) {
  const key = ASSET[mood] ? mood : FALLBACK[mood]
  const src = ASSET[key]!
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="Stocky"
      height={size}
      style={{ height: size, width: 'auto' }}
      className={cn('object-contain select-none pointer-events-none drop-shadow-sm', className)}
      draggable={false}
    />
  )
}
