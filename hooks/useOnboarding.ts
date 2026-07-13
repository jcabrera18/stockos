'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { fetchOnboardingCounts } from '@/lib/onboarding/counts'
import { getMeta, saveMeta } from '@/lib/onboarding/meta'
import { MISSIONS, STAGES, REQUIRED_STAGES, ACHIEVEMENTS } from '@/lib/onboarding/missions'
import { EMPTY_META, type OnbMeta, type OnbCounts, type OnbState, type MissionState, type StageNum } from '@/lib/onboarding/types'
import type { Rubro } from '@/lib/onboarding/rubros'
import type { WizardId } from '@/lib/onboarding/types'

// ─────────────────────────────────────────────────────────────
// Cálculo puro del estado del onboarding a partir del snapshot.
// Aislado para poder testearlo sin React.
// ─────────────────────────────────────────────────────────────
export function computeOnboarding(state: OnbState) {
  const rubro = state.meta.rubro ?? 'otro'

  // Misiones aplicables al rubro (undefined rubros = todas)
  const applicable = MISSIONS.filter((m) => !m.rubros || m.rubros.includes(rubro))

  const missions: MissionState[] = applicable.map((m) => ({
    ...m,
    done: m.isDone(state),
    isNext: false,
  }))

  // Próxima misión = primera no-completada dentro de las etapas requeridas (1-3)
  const next = missions.find((m) => REQUIRED_STAGES.includes(m.stage as 1 | 2 | 3) && !m.done)
  if (next) {
    const nm = missions.find((m) => m.id === next.id)
    if (nm) nm.isNext = true
  }

  // % global ponderado sobre etapas requeridas (la 4 es aditiva, no cuenta)
  const required = missions.filter((m) => REQUIRED_STAGES.includes(m.stage as 1 | 2 | 3))
  const totalW = required.reduce((a, m) => a + (m.weight ?? 1), 0)
  const doneW = required.filter((m) => m.done).reduce((a, m) => a + (m.weight ?? 1), 0)
  const pct = totalW === 0 ? 0 : Math.round((doneW / totalW) * 100)

  // Etapa activa = la de la próxima misión (o 4 si terminó lo requerido)
  const activeStage: StageNum = (next?.stage ?? 4) as StageNum

  // Progreso de cada etapa (para los dots / tabs)
  const stageProgress = STAGES.map((s) => {
    const ms = missions.filter((m) => m.stage === s.n)
    const done = ms.filter((m) => m.done).length
    return { ...s, total: ms.length, done, pct: ms.length ? Math.round((done / ms.length) * 100) : 0 }
  })

  // Logros desbloqueados: por misión + por etapa completa + graduación
  const unlocked = new Set<string>()
  for (const m of missions) if (m.done && m.achievement) unlocked.add(m.achievement)
  for (const s of REQUIRED_STAGES) {
    const ms = missions.filter((m) => m.stage === s)
    if (ms.length && ms.every((m) => m.done)) unlocked.add(`stage_${s}_complete`)
  }
  const complete = REQUIRED_STAGES.every((s) => {
    const ms = missions.filter((m) => m.stage === s)
    return ms.length > 0 && ms.every((m) => m.done)
  })
  if (complete) unlocked.add('graduated')

  const achievements = [...unlocked]
    .map((id) => ACHIEVEMENTS[id])
    .filter(Boolean)

  // "Recién registrado": aún no arrancó nada real
  const fresh =
    (state.counts.products ?? 0) === 0 &&
    (state.counts.sales ?? 0) === 0 &&
    !state.meta.wizards_run.includes('reviewed_setup')

  const newlyUnlocked = [...unlocked].filter((id) => !state.meta.celebrated.includes(id))

  return {
    rubro: rubro as Rubro,
    missions,
    next,
    pct,
    activeStage,
    stageProgress,
    achievements,
    unlocked: [...unlocked],
    newlyUnlocked,
    complete,
    fresh,
  }
}

// ─────────────────────────────────────────────────────────────
// Hook público: carga meta + counts y expone estado + acciones.
// ─────────────────────────────────────────────────────────────
export function useOnboarding() {
  const { user } = useAuth()
  const businessId = user?.business_id ?? null

  const [meta, setMetaState] = useState<OnbMeta>(EMPTY_META)
  const [counts, setCounts] = useState<OnbCounts>({})
  const [loading, setLoading] = useState(true)
  const metaRef = useRef(meta)
  metaRef.current = meta

  // Cargar meta al conocer el negocio
  useEffect(() => {
    if (!businessId) return
    setMetaState(getMeta(businessId))
  }, [businessId])

  // Persistencia helper
  const patchMeta = useCallback((patch: Partial<OnbMeta>) => {
    if (!businessId) return
    const nextMeta = { ...metaRef.current, ...patch }
    setMetaState(nextMeta)
    saveMeta(businessId, nextMeta)
  }, [businessId])

  // Fetch de counts (reutiliza endpoints existentes).
  // Guarda anti-carga: si el negocio ya descartó la guía o ya se graduó,
  // NO disparamos las ~15 requests de counts (leemos el meta persistido en
  // vez del state, que puede no haber cargado aún en el primer commit).
  const refresh = useCallback(async () => {
    if (!businessId) return
    const persisted = getMeta(businessId)
    if (persisted.dismissed || persisted.completed_at) { setLoading(false); return }
    try {
      const c = await fetchOnboardingCounts(persisted)
      setCounts(c)
    } catch { /* red caída: dejamos counts previos */ }
    finally { setLoading(false) }
  }, [businessId])

  useEffect(() => {
    if (!businessId) return
    setLoading(true)
    refresh()
  }, [businessId, refresh])

  const derived = useMemo(() => computeOnboarding({ counts, meta }), [counts, meta])

  // Al graduarse (etapas 1-3 completas), sellamos completed_at una sola vez.
  // A partir de ahí `refresh` deja de pegarle a los endpoints de counts.
  useEffect(() => {
    if (derived.complete && !metaRef.current.completed_at) {
      patchMeta({ completed_at: new Date().toISOString() })
    }
  }, [derived.complete, patchMeta])

  // ── Acciones ────────────────────────────────────────────────
  const setRubro = useCallback((rubro: Rubro) => patchMeta({ rubro }), [patchMeta])

  const completeWizard = useCallback((id: WizardId | 'reviewed_setup' | 'config_printer' | 'config_scanner' | 'personalize') => {
    const runs = metaRef.current.wizards_run
    if (!runs.includes(id)) patchMeta({ wizards_run: [...runs, id] })
  }, [patchMeta])

  const trackEvent = useCallback((key: string, inc = 1) => {
    const events = { ...metaRef.current.events }
    events[key] = (events[key] ?? 0) + inc
    patchMeta({ events })
  }, [patchMeta])

  const celebrate = useCallback((id: string) => {
    const m = metaRef.current
    patchMeta({
      celebrated: m.celebrated.includes(id) ? m.celebrated : [...m.celebrated, id],
      achievements: m.achievements.includes(id) ? m.achievements : [...m.achievements, id],
    })
  }, [patchMeta])

  const dismiss = useCallback(() => patchMeta({ dismissed: true }), [patchMeta])

  return {
    loading,
    meta,
    ...derived,
    actions: { setRubro, completeWizard, trackEvent, celebrate, dismiss, refresh },
  }
}
