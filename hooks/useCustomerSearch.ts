'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { searchCustomersLocal } from '@/lib/pos-cache'
import type { CustomerSummary } from '@/app/customers/page'

interface Options {
  /** Deshabilita la búsqueda (ej: ya hay un cliente seleccionado). Default true. */
  enabled?: boolean
  /** Mínimo de caracteres para disparar. Default 2. */
  minChars?: number
  /** Debounce en ms. Default 180. */
  debounceMs?: number
  /** Máximo de resultados del cache local. Default 8. */
  limit?: number
}

/**
 * Búsqueda de clientes unificada para POS, pedidos y presupuestos.
 *
 * Estrategia: cache local (IndexedDB vía pos-cache) primero → resultados
 * instantáneos y soporte offline; luego refresca contra el server para tener
 * saldos al día. Los campos que el server pudiera no traer se completan desde
 * el cache local para que no "parpadeen" (aparecer/desaparecer).
 *
 * Antes esta lógica estaba duplicada e inline en cada página, y se
 * desincronizó (unos mostraban razón social / fantasía y otros no). Centralizar
 * acá evita que vuelva a divergir.
 */
export function useCustomerSearch(query: string, opts: Options = {}) {
  const { enabled = true, minChars = 2, debounceMs = 180, limit = 8 } = opts
  const [results, setResults] = useState<CustomerSummary[]>([])
  const [searching, setSearching] = useState(false)
  const requestRef = useRef(0)

  useEffect(() => {
    const q = query.trim()
    if (!enabled || q.length < minChars) {
      requestRef.current += 1
      setResults([])
      setSearching(false)
      return
    }
    const requestId = ++requestRef.current
    const timer = setTimeout(async () => {
      const local = await searchCustomersLocal(q, limit)
      if (requestRef.current === requestId && local.length > 0) setResults(local)

      setSearching(true)
      try {
        const data = await api.get<CustomerSummary[]>(`/api/customers/search?q=${encodeURIComponent(q)}`)
        if (requestRef.current === requestId) {
          // El server manda saldos al día pero puede no traer todos los campos →
          // completamos desde el cache local para que no parpadeen.
          const localById = new Map(local.map(c => [c.id, c]))
          setResults(data.map(c => {
            const l = localById.get(c.id)
            if (!l) return c
            return {
              ...l,
              ...c,
              phone:           c.phone           ?? l.phone,
              document:        c.document        ?? l.document,
              razon_social:    c.razon_social    ?? l.razon_social,
              nombre_fantasia: c.nombre_fantasia ?? l.nombre_fantasia,
            }
          }))
        }
      } catch {
        // Sin red → quedarse con los resultados del cache local.
        if (requestRef.current === requestId && local.length === 0) setResults([])
      } finally {
        if (requestRef.current === requestId) setSearching(false)
      }
    }, debounceMs)
    return () => clearTimeout(timer)
  }, [query, enabled, minChars, debounceMs, limit])

  const clear = useCallback(() => {
    requestRef.current += 1
    setResults([])
    setSearching(false)
  }, [])

  return { results, searching, clear }
}
