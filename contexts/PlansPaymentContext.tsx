'use client'
import { createContext, useContext, useState, useCallback } from 'react'
import { PlansPaymentModal } from '@/components/modules/PlansPaymentModal'
import type { PaidPlan } from '@/lib/plans'

interface OpenPlansModalOpts {
  /**
   * Fuerza abrir en el selector de planes en vez de saltar al QR del plan actual.
   * Se usa para "¿Querés actualizar tu plan?": el objetivo es mostrar los planes
   * superiores, no cobrar de una el plan vigente.
   */
  forceSelector?: boolean
}

interface PlansPaymentContextValue {
  /** Abre el modal de pago con QR. Podés pre-seleccionar un plan. */
  openPlansModal: (preselectedPlan?: PaidPlan | null, opts?: OpenPlansModalOpts) => void
  closePlansModal: () => void
}

const PlansPaymentContext = createContext<PlansPaymentContextValue | null>(null)

export function PlansPaymentProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [preselected, setPreselected] = useState<PaidPlan | null>(null)
  const [forceSelector, setForceSelector] = useState(false)

  const openPlansModal = useCallback((plan: PaidPlan | null = null, opts?: OpenPlansModalOpts) => {
    setPreselected(plan)
    setForceSelector(opts?.forceSelector ?? false)
    setOpen(true)
  }, [])

  const closePlansModal = useCallback(() => setOpen(false), [])

  return (
    <PlansPaymentContext.Provider value={{ openPlansModal, closePlansModal }}>
      {children}
      <PlansPaymentModal open={open} onClose={closePlansModal} preselectedPlan={preselected} forceSelector={forceSelector} />
    </PlansPaymentContext.Provider>
  )
}

export function usePlansPayment(): PlansPaymentContextValue {
  const ctx = useContext(PlansPaymentContext)
  if (!ctx) throw new Error('usePlansPayment debe usarse dentro de PlansPaymentProvider')
  return ctx
}
