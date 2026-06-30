// ════════════════════════════════════════════════════════════════════════════
// Cuenta corriente — generación automática de insights de cartera
// ────────────────────────────────────────────────────────────────────────────
// Función pura: recibe los KPIs y devuelve entre 2 y 4 mensajes accionables,
// ordenados por prioridad. Sin métricas decorativas: cada insight apunta a una
// decisión (cobrar, priorizar un cliente, leer una tendencia).
// ════════════════════════════════════════════════════════════════════════════
import { formatCurrency } from '@/lib/utils'
import type { CcPortfolioKpis } from '@/lib/cc-aging'

export type CcInsightTone = 'success' | 'warning' | 'danger' | 'info'

export interface CcInsight {
  id:      string
  tone:    CcInsightTone
  title:   string
  message: string
  // Prioridad interna para quedarnos con los más relevantes (mayor = primero).
  weight:  number
}

export function buildCcInsights(k: CcPortfolioKpis): CcInsight[] {
  const out: CcInsight[] = []

  // 1. Recuperación del mes (cobrado vs emitido)
  if (k.charged_this_month > 0) {
    const pct = Math.round((k.collected_this_month / k.charged_this_month) * 100)
    if (pct >= 80) {
      out.push({
        id: 'recovery-high', tone: 'success', weight: 60,
        title: `Recuperaste el ${pct}% de las cobranzas este mes`,
        message: `Cobraste ${formatCurrency(k.collected_this_month)} sobre ${formatCurrency(k.charged_this_month)} emitidos.`,
      })
    } else if (pct < 50) {
      out.push({
        id: 'recovery-low', tone: 'warning', weight: 75,
        title: `Sólo recuperaste el ${pct}% de lo emitido este mes`,
        message: `Emitiste ${formatCurrency(k.charged_this_month)} y cobraste ${formatCurrency(k.collected_this_month)}. La cartera se está estirando.`,
      })
    }
  }

  // 2. Deuda vencida (>30 días)
  if (k.overdue_total > 0) {
    const tone: CcInsightTone = k.total_pending > 0 && k.overdue_total / k.total_pending > 0.4 ? 'danger' : 'warning'
    out.push({
      id: 'overdue', tone, weight: 85,
      title: `Hay ${formatCurrency(k.overdue_total)} pendientes hace más de 30 días`,
      message: `${k.overdue_customers} ${k.overdue_customers === 1 ? 'cliente concentra' : 'clientes concentran'} deuda vencida. Conviene priorizar el cobro.`,
    })
  }

  // 3. Concentración: cuánto del total deben los top deudores
  if (k.total_pending > 0 && k.top_debtors.length >= 3) {
    const top3 = k.top_debtors.slice(0, 3).reduce((a, d) => a + d.balance, 0)
    const share = Math.round((top3 / k.total_pending) * 100)
    if (share >= 50) {
      out.push({
        id: 'concentration', tone: 'danger', weight: 70,
        title: `3 clientes concentran el ${share}% de toda la deuda`,
        message: `${formatCurrency(top3)} de ${formatCurrency(k.total_pending)} dependen de pocos clientes. Riesgo concentrado.`,
      })
    }
  }

  // 4. Tendencia del saldo vs mes anterior
  if (k.prev_month_pending > 0) {
    const diff = k.total_pending - k.prev_month_pending
    const pct = Math.round((diff / k.prev_month_pending) * 100)
    if (pct <= -5) {
      out.push({
        id: 'trend-down', tone: 'success', weight: 50,
        title: `La cartera mejoró ${Math.abs(pct)}% respecto al mes pasado`,
        message: `El saldo pendiente bajó de ${formatCurrency(k.prev_month_pending)} a ${formatCurrency(k.total_pending)}.`,
      })
    } else if (pct >= 10) {
      out.push({
        id: 'trend-up', tone: 'warning', weight: 65,
        title: `El saldo pendiente aumentó un ${pct}%`,
        message: `Pasó de ${formatCurrency(k.prev_month_pending)} a ${formatCurrency(k.total_pending)} respecto del mes pasado.`,
      })
    }
  }

  // Sin deuda: un mensaje tranquilizador en vez de panel vacío.
  if (out.length === 0 && k.total_pending === 0) {
    out.push({
      id: 'clean', tone: 'success', weight: 10,
      title: 'Cartera sin deuda pendiente',
      message: 'Ningún cliente tiene saldo a cobrar en este momento.',
    })
  }

  return out
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4)
}
