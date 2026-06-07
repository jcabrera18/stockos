'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { api } from '@/lib/api'
import {
  AlertTriangle, Lightbulb, Info, CheckCircle2, Sparkles,
  ArrowRight, RefreshCw,
} from 'lucide-react'

// ─── Tipos (espejo de financialInsightsService del backend) ───────────────────
type InsightType   = 'warning' | 'opportunity' | 'info' | 'success'
type InsightImpact = 'low' | 'medium' | 'high'

interface Insight {
  id:           string
  type:         InsightType
  area:         string
  title:        string
  message:      string
  impact:       InsightImpact
  actionLabel?: string
  actionUrl?:   string
}

interface InsightsResponse {
  insights:     Insight[]
  generated_at: string
}

// ─── Estilo visual por tipo (icono + color de acento) ─────────────────────────
const TYPE_STYLE: Record<InsightType, { Icon: typeof Info; color: string; bg: string; border: string }> = {
  warning:     { Icon: AlertTriangle, color: 'var(--danger)',  bg: 'var(--danger-subtle)',  border: 'var(--danger)'  },
  opportunity: { Icon: Lightbulb,     color: 'var(--accent)',  bg: 'var(--accent-subtle)',  border: 'var(--accent)'  },
  info:        { Icon: Info,          color: 'var(--text2)',   bg: 'var(--surface2)',       border: 'var(--border)'  },
  success:     { Icon: CheckCircle2,  color: 'var(--accent)',  bg: 'var(--accent-subtle)',  border: 'var(--accent)'  },
}

const IMPACT_LABEL: Record<InsightImpact, string> = { high: 'Alta', medium: 'Media', low: 'Baja' }

// ═══════════════════════════════════════════════════════════════════════════════
export function SmartInsightsCard() {
  const [insights, setInsights] = useState<Insight[] | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(false)

  const fetchInsights = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await api.get<InsightsResponse>('/api/dashboard/insights')
      setInsights(res?.insights ?? [])
    } catch (err) {
      console.error(err)
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchInsights() }, [fetchInsights])

  return (
    <Card padding="none" className="flex flex-col">
      <CardHeader className="px-4 pt-4 pb-3">
        <CardTitle>
          <span className="flex items-center gap-1.5">
            <Sparkles size={15} className="text-[var(--accent)]" />
            Para tener en cuenta
          </span>
        </CardTitle>
        {!loading && !error && (
          <button
            onClick={fetchInsights}
            className="p-1 rounded-md text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors"
            aria-label="Actualizar insights"
          >
            <RefreshCw size={13} />
          </button>
        )}
      </CardHeader>

      <div className="flex-1">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState onRetry={fetchInsights} />
        ) : (insights?.length ?? 0) === 0 ? (
          <EmptyState />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {insights!.map((it) => <InsightRow key={it.id} insight={it} />)}
          </ul>
        )}
      </div>
    </Card>
  )
}

// ─── Fila de insight ──────────────────────────────────────────────────────────
function InsightRow({ insight }: { insight: Insight }) {
  const style = TYPE_STYLE[insight.type]
  const { Icon } = style

  return (
    <li className="flex gap-3 px-4 py-3">
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ background: style.bg }}
      >
        <Icon size={15} style={{ color: style.color }} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-[var(--text)] truncate">{insight.title}</p>
          {insight.impact === 'high' && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0"
              style={{ background: style.bg, color: style.color }}
              title={`Impacto: ${IMPACT_LABEL[insight.impact]}`}
            >
              {IMPACT_LABEL[insight.impact]}
            </span>
          )}
        </div>
        <p className="text-xs text-[var(--text3)] mt-0.5 leading-relaxed">{insight.message}</p>

        {insight.actionLabel && insight.actionUrl && (
          <Link
            href={insight.actionUrl}
            className="inline-flex items-center gap-1 text-xs font-medium mt-1.5 hover:underline"
            style={{ color: style.color }}
          >
            {insight.actionLabel}
            <ArrowRight size={12} />
          </Link>
        )}
      </div>
    </li>
  )
}

// ─── Estados ──────────────────────────────────────────────────────────────────
function LoadingState() {
  return (
    <ul className="divide-y divide-[var(--border)]">
      {Array.from({ length: 3 }).map((_, i) => (
        <li key={i} className="flex gap-3 px-4 py-3">
          <div className="w-7 h-7 rounded-lg bg-[var(--surface2)] animate-pulse flex-shrink-0" />
          <div className="flex-1 space-y-2 py-0.5">
            <div className="h-3.5 w-1/3 rounded bg-[var(--surface2)] animate-pulse" />
            <div className="h-3 w-3/4 rounded bg-[var(--surface2)] animate-pulse opacity-60" />
          </div>
        </li>
      ))}
    </ul>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center text-center px-4 py-10">
      <div className="w-11 h-11 rounded-xl bg-[var(--accent-subtle)] flex items-center justify-center mb-3">
        <CheckCircle2 size={20} className="text-[var(--accent)]" />
      </div>
      <p className="text-sm font-medium text-[var(--text)]">Todo estable por ahora</p>
      <p className="text-xs text-[var(--text3)] max-w-[16rem] mt-1">
        No detectamos desvíos importantes en tus números.
      </p>
    </div>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-4 py-10">
      <div className="w-11 h-11 rounded-xl bg-[var(--surface2)] flex items-center justify-center mb-3">
        <AlertTriangle size={20} className="text-[var(--text3)]" />
      </div>
      <p className="text-sm font-medium text-[var(--text)]">No pudimos cargar los insights</p>
      <button
        onClick={onRetry}
        className="text-xs font-medium text-[var(--accent)] hover:underline mt-2"
      >
        Reintentar
      </button>
    </div>
  )
}
