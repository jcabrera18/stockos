'use client'
import { createContext, useContext, useEffect, useState } from 'react'

interface SidePanelCtx {
  /** True cuando una página tiene su panel master-detail abierto. */
  collapsed: boolean
  setCollapsed: (v: boolean) => void
}

const Ctx = createContext<SidePanelCtx>({ collapsed: false, setCollapsed: () => {} })

export function SidePanelProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  return <Ctx.Provider value={{ collapsed, setCollapsed }}>{children}</Ctx.Provider>
}

export function useSidePanel() {
  return useContext(Ctx)
}

/**
 * Las páginas con layout master-detail llaman a este hook con su estado de panel.
 * Mientras el panel esté abierto, el Sidebar se colapsa a solo-iconos para dar
 * más espacio al detalle. Al desmontar se restaura.
 */
export function useCollapseSidebar(open: boolean) {
  const { setCollapsed } = useSidePanel()
  useEffect(() => {
    setCollapsed(open)
    return () => setCollapsed(false)
  }, [open, setCollapsed])
}
