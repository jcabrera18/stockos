'use client'
import { useState, useEffect, useCallback } from 'react'

export interface Workstation {
  branch_id: string
  branch_name: string
  register_id: string
  register_name: string
  warehouse_id?: string
}

const STORAGE_KEY = 'stockos_workstation'

export function useWorkstation() {
  const [loaded, setLoaded] = useState(false)
  const [workstation, setWorkstationState] = useState<Workstation | null>(null)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) setWorkstationState(JSON.parse(stored))
    } catch { }
    setLoaded(true)
  }, [])

  const setWorkstation = useCallback((ws: Workstation | null) => {
    setWorkstationState(ws)
    if (ws) localStorage.setItem(STORAGE_KEY, JSON.stringify(ws))
    else localStorage.removeItem(STORAGE_KEY)
  }, [])

  const clearWorkstation = useCallback(() => {
    setWorkstationState(null)
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  return { workstation, setWorkstation, clearWorkstation, loaded }
}
