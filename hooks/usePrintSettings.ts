'use client'
import { useState, useEffect, useCallback } from 'react'

export type PaperWidth = 58 | 80

export interface PrintSettings {
  /** Ancho físico del papel térmico en mm */
  paperWidth: PaperWidth
  /** Imprime el ticket automáticamente al cerrar la venta */
  autoPrint: boolean
  /** Cantidad de copias por ticket (cliente + comercio) */
  copies: number
  /** Multiplicador fino del tamaño de fuente (0.8–1.4) para ajustar por impresora */
  fontScale: number
}

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  paperWidth: 80,
  autoPrint: false,
  copies: 1,
  fontScale: 1,
}

// Atado al dispositivo, NO al usuario: la impresora está enchufada a una terminal
// concreta y el cajero puede rotar entre terminales. Misma lógica que stockos_workstation.
const STORAGE_KEY = 'stockos_print_settings'

/**
 * Lectura plana (sin React) de la config de impresión de esta terminal.
 * La usa el módulo de impresión `lib/printTicket` para que cualquier caller
 * (POS, Ventas, Comprobantes, recibos) respete ancho/copias/fuente sin
 * tener que pasar la config a mano.
 */
export function getPrintSettings(): PrintSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return DEFAULT_PRINT_SETTINGS
    const parsed = JSON.parse(stored) as Partial<PrintSettings>
    return {
      paperWidth: parsed.paperWidth === 58 ? 58 : 80,
      autoPrint: Boolean(parsed.autoPrint),
      copies: Math.min(3, Math.max(1, Number(parsed.copies) || 1)),
      fontScale: Math.min(1.4, Math.max(0.8, Number(parsed.fontScale) || 1)),
    }
  } catch {
    return DEFAULT_PRINT_SETTINGS
  }
}

export function usePrintSettings() {
  const [settings, setSettingsState] = useState<PrintSettings>(DEFAULT_PRINT_SETTINGS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setSettingsState(getPrintSettings())
    setLoaded(true)

    // Mantener sincronizadas pestañas/ventanas de la misma terminal
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setSettingsState(getPrintSettings())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setSettings = useCallback((patch: Partial<PrintSettings>) => {
    setSettingsState(prev => {
      const next = { ...prev, ...patch }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }, [])

  return { settings, setSettings, loaded }
}
