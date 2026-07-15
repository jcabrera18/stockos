'use client'
import { useEffect, useRef, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { HelpBanner } from '@/components/ui/HelpBanner'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Pagination } from '@/components/ui/Pagination'
import { PageLoader } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { MoneyInput } from '@/components/ui/MoneyInput'
import { Select } from '@/components/ui/Select'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { formatCurrency, formatDate, getPeriodDates, getPaymentMethodLabel } from '@/lib/utils'
import type { FinanceSummary, Expense, PaginatedResponse, Pagination as PaginationType } from '@/types'
import { TrendingUp, TrendingDown, DollarSign, Plus, FileCheck, AlertTriangle, Gauge } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'
import { toast } from 'sonner'

type Tab = 'facturacion' | 'balance' | 'gastos' | 'comisiones'

interface AfipTypeSummary { count: number; total: number; net: number; iva: number }
interface AfipSummary {
  by_type: Record<string, AfipTypeSummary>
  facturas: number
  nc_total: number
  nd_total: number
  total_net: number
  total_iva: number
}
interface Billing12m {
  rolling_total: number
  monthly: { month: string; total: number }[]
  window_from: string
  window_to: string
  next_close: string
}
interface SellerCommissionRow {
  sellerId: string
  sellerName: string
  branchName: string
  commissionPct: number
  salesCount: number
  soldAmount: number
  costNetAmount: number
  costWithVatAmount: number
  commissionAmount: number
  isActive: boolean
}
type BasePeriod = 'today' | 'week' | 'month' | 'year'
type Period = BasePeriod | 'all'
type DateRange = { from: string; to: string }

const EXPENSE_CATEGORIES = [
  { value: 'proveedores', label: 'Proveedores' },
  { value: 'personal', label: 'Personal' },
  { value: 'alquiler', label: 'Alquiler' },
  { value: 'servicios', label: 'Servicios' },
  { value: 'impuestos', label: 'Impuestos' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'otro', label: 'Otro' },
]

function rangeFor(period: Period, customRange: DateRange | null): DateRange | null {
  return customRange ?? (period === 'all' ? null : getPeriodDates(period))
}

const fmtMonthShort = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'short' })
}
const fmtDateShort = (d: string) =>
  new Date(d + (d.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

export default function FinancesPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('facturacion')
  const [period, setPeriod] = useState<Period>('month')
  const [customRange, setCustomRange] = useState<DateRange | null>(null)
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo] = useState('')

  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<FinanceSummary | null>(null)
  const [afipSummary, setAfipSummary] = useState<AfipSummary | null>(null)
  const [billing12m, setBilling12m] = useState<Billing12m | null>(null)
  const [commissionRows, setCommissionRows] = useState<SellerCommissionRow[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [expPagination, setExpPag] = useState<PaginationType>({ total: 0, page: 1, limit: 50, pages: 0 })
  const [expPage, setExpPage] = useState(1)

  const [addModal, setAddModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ category: 'otro', amount: '', description: '' })
  const [refreshTick, setRefreshTick] = useState(0)

  const periodKey = customRange ? `c:${customRange.from}:${customRange.to}` : `p:${period}`

  // Cache: última clave (tab, período) cargada por dataset, para no re-fetchear al alternar tabs
  const summaryKeyRef = useRef<string | null>(null)
  const afipKeyRef = useRef<string | null>(null)
  const commissionsKeyRef = useRef<string | null>(null)
  const expensesKeyRef = useRef<string | null>(null)

  // Medidor 12m: se carga una sola vez, es independiente del selector de período
  useEffect(() => {
    let cancel = false
    api.get<Billing12m>('/api/invoices/billing-12m')
      .then(d => { if (!cancel) setBilling12m(d) })
      .catch(console.error)
    return () => { cancel = true }
  }, [])

  // Reset de página de gastos al cambiar el período
  useEffect(() => { setExpPage(1) }, [periodKey])

  // Carga lazy por tab: cada tab trae solo su data, cacheada por (tab, período)
  useEffect(() => {
    let cancel = false
    const range = rangeFor(period, customRange)
    const dateParams = range ? { from: range.from, to: range.to } : undefined

    async function run() {
      try {
        if (tab === 'balance') {
          if (summaryKeyRef.current === periodKey) return
          setLoading(true)
          const sum = await api.get<FinanceSummary>('/api/finances/summary', dateParams)
          if (!cancel) { setSummary(sum); summaryKeyRef.current = periodKey }
        } else if (tab === 'facturacion') {
          if (afipKeyRef.current === periodKey) return
          setLoading(true)
          const afip = await api.get<AfipSummary>('/api/invoices/summary', dateParams)
          if (!cancel) { setAfipSummary(afip); afipKeyRef.current = periodKey }
        } else if (tab === 'comisiones') {
          if (commissionsKeyRef.current === periodKey) return
          setLoading(true)
          const rows = await api.get<SellerCommissionRow[]>('/api/finances/commissions', dateParams)
          if (!cancel) { setCommissionRows(rows ?? []); commissionsKeyRef.current = periodKey }
        } else if (tab === 'gastos') {
          const key = `${periodKey}:${expPage}`
          if (expensesKeyRef.current === key) return
          setLoading(true)
          const exp = await api.get<PaginatedResponse<Expense>>('/api/finances/expenses', {
            ...(dateParams ?? {}),
            page: expPage,
            limit: 50,
          })
          if (!cancel) { setExpenses(exp.data); setExpPag(exp.pagination); expensesKeyRef.current = key }
        }
      } catch (err) {
        console.error(err)
        if (tab === 'comisiones') toast.error('No se pudieron calcular las comisiones')
      } finally {
        if (!cancel) setLoading(false)
      }
    }
    void run()
    return () => { cancel = true }
  }, [tab, period, customRange, expPage, refreshTick])

  const applyCustomRange = () => {
    if (!rangeFrom || !rangeTo) return
    setCustomRange({ from: `${rangeFrom}T00:00:00.000Z`, to: `${rangeTo}T23:59:59.999Z` })
  }
  const clearCustomRange = () => {
    setRangeFrom('')
    setRangeTo('')
    setCustomRange(null)
  }
  const handlePeriodChange = (newPeriod: Period) => {
    setCustomRange(null)
    setPeriod(newPeriod)
  }

  const handleAddExpense = async () => {
    if (!form.amount || !form.description) return
    setSaving(true)
    try {
      await api.post('/api/finances/expenses', {
        category: form.category,
        amount: parseFloat(form.amount),
        description: form.description,
      })
      toast.success('Gasto registrado')
      setAddModal(false)
      setForm({ category: 'otro', amount: '', description: '' })
      // Invalidar caches afectados por el nuevo gasto y refrescar
      expensesKeyRef.current = null
      summaryKeyRef.current = null
      setExpPage(1)
      setTab('gastos')
      setRefreshTick(t => t + 1)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const periods: { key: Period; label: string }[] = [
    { key: 'today', label: 'Hoy' },
    { key: 'week', label: 'Semana' },
    { key: 'month', label: 'Mes' },
    { key: 'year', label: 'Año' },
    { key: 'all', label: 'Todas' },
  ]
  const tabs: { key: Tab; label: string }[] = [
    { key: 'facturacion', label: 'Facturación' },
    { key: 'balance', label: 'Balance' },
    { key: 'gastos', label: 'Gastos' },
    { key: 'comisiones', label: 'Comisiones' },
  ]

  const activePeriod: Period = customRange ? 'all' : period
  const isRangeValid = Boolean(rangeFrom && rangeTo && rangeFrom <= rangeTo)
  const activeRange = rangeFor(period, customRange)

  // ── Medidor de recategorización ──
  const limit = Number(user?.business?.monotributo_limite_anual ?? 0)
  const hasLimit = limit > 0
  const rolling = billing12m?.rolling_total ?? 0
  const pct = hasLimit ? Math.round((rolling / limit) * 100) : 0
  const remaining = limit - rolling
  const monthlyPace = rolling / 12
  const monthsToLimit = monthlyPace > 0 && remaining > 0 ? Math.round(remaining / monthlyPace) : null
  const meterColor = pct >= 100 ? 'var(--danger)' : pct >= 80 ? '#f59e0b' : 'var(--accent)'

  return (
    <AppShell>
      <PageHeader
        title="Finanzas"
        action={
          <Button onClick={() => setAddModal(true)}>
            <Plus size={15} /> Nuevo gasto
          </Button>
        }
      />

      <div className="p-5 space-y-4">
        <HelpBanner id="finances" title="Finanzas">
          <p>Seguí tus ingresos y gastos con gráficos de evolución. Cargá y categorizá los gastos del negocio para entender mejor tu rentabilidad.</p>
        </HelpBanner>
        {/* Período */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex gap-2 flex-wrap">
            {periods.map(p => (
              <button key={p.key} onClick={() => handlePeriodChange(p.key)}
                className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors ${activePeriod === p.key ? 'bg-[var(--accent)] text-white' : 'bg-[var(--surface2)] text-[var(--text2)] hover:bg-[var(--surface3)]'
                  }`}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-l border-[var(--border)] pl-3">
            <span className="text-xs text-[var(--text3)]">Rango personalizado:</span>
            <input
              type="date"
              value={rangeFrom}
              onChange={e => setRangeFrom(e.target.value)}
              className="text-xs px-2.5 py-1 rounded-[var(--radius-md)] bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
            />
            <span className="text-xs text-[var(--text3)]">→</span>
            <input
              type="date"
              value={rangeTo}
              onChange={e => setRangeTo(e.target.value)}
              className="text-xs px-2.5 py-1 rounded-[var(--radius-md)] bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
            />
            <Button size="sm" variant="secondary" onClick={applyCustomRange} disabled={!isRangeValid}>Aplicar</Button>
            {(customRange || rangeFrom || rangeTo) && (
              <button type="button" onClick={clearCustomRange}
                className="text-xs text-[var(--text3)] hover:text-[var(--text)] underline">Limpiar</button>
            )}
          </div>
        </div>
        {customRange && (
          <p className="text-xs text-[var(--text3)]">Mostrando rango personalizado: {rangeFrom} → {rangeTo}</p>
        )}

        {/* Tabs */}
        <div className="flex border-b border-[var(--border)]">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === t.key
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--text3)] hover:text-[var(--text)]'
                }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Tab: Facturación ── */}
        {tab === 'facturacion' && (
          <div className="space-y-4">
            {/* Medidor de recategorización (12 meses móviles) */}
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <Gauge size={15} className="text-[var(--accent)]" />
                <p className="text-sm font-semibold text-[var(--text)]">Facturación últimos 12 meses</p>
                <span className="text-xs text-[var(--text3)]">(ventana móvil · con CAE, neto de NC)</span>
              </div>

              {!billing12m ? (
                <p className="text-sm text-[var(--text3)] py-4">Calculando…</p>
              ) : !hasLimit ? (
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                  <div>
                    <p className="text-3xl font-bold mono text-[var(--text)]">{formatCurrency(rolling)}</p>
                    <p className="text-xs text-[var(--text3)] mt-1">
                      {fmtDateShort(billing12m.window_from)} → {fmtDateShort(billing12m.window_to)}
                    </p>
                  </div>
                  <p className="text-xs text-[var(--text3)] max-w-xs">
                    Cargá tu <strong>tope anual de monotributo</strong> en Ajustes → ARCA para ver qué tan cerca estás de recategorizarte.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-end justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-3xl font-bold mono" style={{ color: meterColor }}>{formatCurrency(rolling)}</p>
                      <p className="text-xs text-[var(--text3)] mt-1">de {formatCurrency(limit)} · tope de tu categoría</p>
                    </div>
                    <p className="text-2xl font-bold mono" style={{ color: meterColor }}>{pct}%</p>
                  </div>

                  <div className="h-3 bg-[var(--surface2)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: meterColor }} />
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    {pct >= 100 ? (
                      <span className="flex items-center gap-1 font-medium text-[var(--danger)]">
                        <AlertTriangle size={13} /> Superaste el tope — riesgo de recategorización o exclusión.
                      </span>
                    ) : (
                      <span className="text-[var(--text2)]">
                        Te quedan <strong className="mono">{formatCurrency(remaining)}</strong> antes del tope.
                      </span>
                    )}
                    {monthsToLimit != null && (
                      <span className="text-[var(--text3)]">
                        A este ritmo lo alcanzás en ~{monthsToLimit} {monthsToLimit === 1 ? 'mes' : 'meses'}.
                      </span>
                    )}
                    <span className="text-[var(--text3)]">
                      Próximo cierre de recategorización: <strong>{fmtDateShort(billing12m.next_close)}</strong>
                    </span>
                  </div>

                  {/* Gráfico mensual */}
                  <div className="h-40 -mx-2 mt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[...billing12m.monthly]} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <XAxis dataKey="month" tickFormatter={fmtMonthShort} tick={{ fontSize: 11, fill: 'var(--text3)' }} axisLine={false} tickLine={false} />
                        <YAxis hide />
                        <Tooltip
                          cursor={{ fill: 'var(--surface2)' }}
                          contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                          labelFormatter={l => fmtMonthShort(String(l))}
                          formatter={v => [formatCurrency(Number(v)), 'Facturado']}
                        />
                        <ReferenceLine y={limit / 12} stroke="var(--danger)" strokeDasharray="4 4"
                          label={{ value: 'prom. p/ tope', position: 'insideTopRight', fontSize: 10, fill: 'var(--danger)' }} />
                        <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                          {billing12m.monthly.map((m, i) => (
                            <Cell key={i} fill={m.total >= limit / 12 ? 'var(--danger)' : 'var(--accent)'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </Card>

            {/* Resumen del período (selector) */}
            <p className="text-xs text-[var(--text3)]">
              {activeRange
                ? <>Desglose del período: <span className="font-medium text-[var(--text2)]">{fmtDateShort(activeRange.from.slice(0, 10))} → {fmtDateShort(activeRange.to.slice(0, 10))}</span></>
                : <>Desglose del período: <span className="font-medium text-[var(--text2)]">Todo el histórico</span></>}
              <span className="ml-2">· Solo comprobantes autorizados con CAE</span>
            </p>

            {loading && !afipSummary ? <PageLoader /> : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <StatCard title="Total facturado" value={formatCurrency(afipSummary?.facturas ?? 0)} subtitle="Facturas A+B+C con CAE" icon={FileCheck} accent />
                  <StatCard title="Neto gravado" value={formatCurrency(afipSummary?.total_net ?? 0)} subtitle="Base imponible" icon={DollarSign} />
                  <StatCard title="IVA facturado" value={formatCurrency(afipSummary?.total_iva ?? 0)} subtitle="IVA acumulado" icon={TrendingUp} />
                  <StatCard title="NC emitidas" value={formatCurrency(afipSummary?.nc_total ?? 0)} subtitle="Notas de crédito" icon={TrendingDown} />
                </div>

                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
                  <div className="px-4 py-3 border-b border-[var(--border)]">
                    <p className="text-xs font-medium text-[var(--text3)]">Desglose por tipo de comprobante — solo autorizados con CAE</p>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)]">Tipo</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)]">Cantidad</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)]">Total</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)] hidden md:table-cell">Neto</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)] hidden md:table-cell">IVA</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {([
                        { key: 'A', label: 'Factura A', showIva: true },
                        { key: 'B', label: 'Factura B', showIva: false },
                        { key: 'C', label: 'Factura C', showIva: false },
                        { key: 'NCA', label: 'Nota de Crédito A', showIva: true },
                        { key: 'NCB', label: 'Nota de Crédito B', showIva: false },
                        { key: 'NCC', label: 'Nota de Crédito C', showIva: false },
                        { key: 'NDA', label: 'Nota de Débito A', showIva: true },
                        { key: 'NDB', label: 'Nota de Débito B', showIva: false },
                        { key: 'NDC', label: 'Nota de Débito C', showIva: false },
                      ] as const).map(({ key, label, showIva }) => {
                        const row = afipSummary?.by_type?.[key]
                        if (!row || row.count === 0) return null
                        return (
                          <tr key={key} className="hover:bg-[var(--surface2)] transition-colors">
                            <td className="px-4 py-3 text-[var(--text)]">{label}</td>
                            <td className="px-4 py-3 text-right mono text-[var(--text2)]">{row.count}</td>
                            <td className="px-4 py-3 text-right mono font-semibold text-[var(--text)]">{formatCurrency(row.total)}</td>
                            <td className="px-4 py-3 text-right mono text-[var(--text2)] hidden md:table-cell">{showIva ? formatCurrency(row.net) : '—'}</td>
                            <td className="px-4 py-3 text-right mono text-[var(--text2)] hidden md:table-cell">{showIva ? formatCurrency(row.iva) : '—'}</td>
                          </tr>
                        )
                      })}
                      {!afipSummary || Object.values(afipSummary.by_type).every(r => r.count === 0) ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-sm text-[var(--text3)]">Sin comprobantes autorizados en el período</td>
                        </tr>
                      ) : null}
                    </tbody>
                    {afipSummary && Object.values(afipSummary.by_type).some(r => r.count > 0) && (
                      <tfoot>
                        <tr className="border-t-2 border-[var(--border)] bg-[var(--surface2)]">
                          <td className="px-4 py-3 text-xs font-semibold text-[var(--text2)]">TOTAL</td>
                          <td className="px-4 py-3 text-right mono text-xs font-semibold text-[var(--text2)]">
                            {Object.values(afipSummary.by_type).reduce((s, r) => s + r.count, 0)}
                          </td>
                          <td className="px-4 py-3 text-right mono font-bold text-[var(--accent)]">
                            {formatCurrency(afipSummary.facturas + afipSummary.nd_total - afipSummary.nc_total)}
                          </td>
                          <td className="px-4 py-3 text-right mono font-semibold text-[var(--text)] hidden md:table-cell">{formatCurrency(afipSummary.total_net)}</td>
                          <td className="px-4 py-3 text-right mono font-semibold text-[var(--text)] hidden md:table-cell">{formatCurrency(afipSummary.total_iva)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>

                {(afipSummary?.nd_total ?? 0) > 0 && (
                  <p className="text-xs text-[var(--text3)] px-1">
                    Notas de débito: {formatCurrency(afipSummary!.nd_total)} — incluidas en el total neto.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Tab: Balance ── */}
        {tab === 'balance' && (
          loading && !summary ? <PageLoader /> : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <StatCard title="Ingresos" value={formatCurrency(summary?.revenue ?? 0)} icon={TrendingUp} accent />
                <StatCard title="Gastos" value={formatCurrency(summary?.expenses ?? 0)} icon={TrendingDown} />
                <StatCard title="Ganancia neta" value={formatCurrency(summary?.net ?? 0)} subtitle={`Margen ${summary?.margin_pct ?? 0}%`} icon={DollarSign} />
              </div>

              {(summary?.revenue ?? 0) > 0 && (
                <Card>
                  <p className="text-xs text-[var(--text3)] mb-2">Gastos vs ingresos</p>
                  <div className="h-2 bg-[var(--surface2)] rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--danger)] rounded-full transition-all"
                      style={{ width: `${Math.min(((summary?.expenses ?? 0) / (summary?.revenue ?? 1)) * 100, 100)}%` }} />
                  </div>
                  <div className="flex justify-between mt-1.5 text-xs text-[var(--text3)]">
                    <span>{Math.round(((summary?.expenses ?? 0) / (summary?.revenue ?? 1)) * 100)}% de los ingresos</span>
                    <span>Margen: {summary?.margin_pct ?? 0}%</span>
                  </div>
                </Card>
              )}

              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <p className="text-xs font-medium text-[var(--text3)] mb-3">Por método de pago</p>
                  <div className="space-y-2">
                    {Object.entries(summary?.by_payment ?? {}).map(([method, amount]) => (
                      <div key={method} className="flex justify-between items-center">
                        <span className="text-sm text-[var(--text2)]">{getPaymentMethodLabel(method)}</span>
                        <span className="text-sm mono font-medium text-[var(--text)]">{formatCurrency(amount)}</span>
                      </div>
                    ))}
                  </div>
                </Card>
                <Card>
                  <p className="text-xs font-medium text-[var(--text3)] mb-3">Gastos por categoría</p>
                  <div className="space-y-2">
                    {Object.entries(summary?.by_expense_category ?? {}).map(([cat, amount]) => (
                      <div key={cat} className="flex justify-between items-center">
                        <span className="text-sm text-[var(--text2)] capitalize">{cat}</span>
                        <span className="text-sm mono font-medium text-[var(--danger)]">{formatCurrency(amount)}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </div>
          )
        )}

        {/* ── Tab: Gastos ── */}
        {tab === 'gastos' && (
          loading && expenses.length === 0 ? <PageLoader /> : (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)]">Descripción</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden sm:table-cell">Categoría</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden md:table-cell">Fecha</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)]">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {expenses.map(exp => (
                    <tr key={exp.id} className="hover:bg-[var(--surface2)] transition-colors">
                      <td className="px-4 py-3 text-[var(--text)]">{exp.description}</td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <Badge variant="default" className="capitalize">{exp.category}</Badge>
                      </td>
                      <td className="px-4 py-3 text-xs mono text-[var(--text3)] hidden md:table-cell">{formatDate(exp.date)}</td>
                      <td className="px-4 py-3 text-right mono font-semibold text-[var(--danger)]">{formatCurrency(exp.amount)}</td>
                    </tr>
                  ))}
                  {expenses.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-[var(--text3)]">Sin gastos en el período</td></tr>
                  )}
                </tbody>
              </table>
              <Pagination pagination={expPagination} onPageChange={setExpPage} />
            </div>
          )
        )}

        {/* ── Tab: Comisiones ── */}
        {tab === 'comisiones' && (() => {
          if (loading && commissionRows.length === 0) return <PageLoader />
          const sellersWithSales = commissionRows.filter(row => row.salesCount > 0)
          const totalSold = commissionRows.reduce((t, r) => t + r.soldAmount, 0)
          const totalCommission = commissionRows.reduce((t, r) => t + r.commissionAmount, 0)
          const totalCostWithVat = commissionRows.reduce((t, r) => t + r.costWithVatAmount, 0)

          return (
            <div className="space-y-4">
              <p className="text-xs text-[var(--text3)] -mt-1">
                Comisión calculada sobre el costo neto del período, usando el porcentaje fijo configurado en cada vendedor.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <StatCard title="Comisiones a pagar" value={formatCurrency(totalCommission)} subtitle={`${sellersWithSales.length} vendedores con ventas`} icon={DollarSign} accent />
                <StatCard title="Vendido neto" value={formatCurrency(totalSold)} subtitle="Total usado para comisión" icon={TrendingUp} />
                <StatCard title="Costo c/IVA" value={formatCurrency(totalCostWithVat)} subtitle="Acumulado del período" icon={TrendingDown} />
              </div>

              {commissionRows.length === 0 ? (
                <p className="text-sm text-[var(--text3)] text-center py-8">No hay vendedores configurados para calcular comisiones</p>
              ) : (
                <div className="space-y-3">
                  <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border)]">
                          <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)]">Vendedor</th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden lg:table-cell">Sucursal</th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)]">%</th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)] hidden md:table-cell">Ventas</th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)]">Vendido</th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)] hidden xl:table-cell">Costo neto</th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)] hidden lg:table-cell">Costo c/IVA</th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)]">Comisión</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {commissionRows.map(row => (
                          <tr key={row.sellerId} className="hover:bg-[var(--surface2)] transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="text-[var(--text)]">{row.sellerName}</span>
                                {!row.isActive && <Badge variant="default">Inactivo</Badge>}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-[var(--text2)] hidden lg:table-cell">{row.branchName}</td>
                            <td className="px-4 py-3 text-right mono text-[var(--text2)]">{row.commissionPct}%</td>
                            <td className="px-4 py-3 text-right mono text-[var(--text2)] hidden md:table-cell">{row.salesCount}</td>
                            <td className="px-4 py-3 text-right mono font-medium text-[var(--text)]">{formatCurrency(row.soldAmount)}</td>
                            <td className="px-4 py-3 text-right mono text-[var(--text2)] hidden xl:table-cell">{formatCurrency(row.costNetAmount)}</td>
                            <td className="px-4 py-3 text-right mono text-[var(--text2)] hidden lg:table-cell">{formatCurrency(row.costWithVatAmount)}</td>
                            <td className="px-4 py-3 text-right mono font-semibold text-[var(--accent)]">{formatCurrency(row.commissionAmount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <Card>
                    <p className="text-xs font-medium text-[var(--text2)]">Cómo se calcula</p>
                    <div className="mt-2 space-y-1 text-xs text-[var(--text3)]">
                      <p><strong>Ventas:</strong> cuántas ventas hizo ese vendedor dentro del período seleccionado.</p>
                      <p><strong>Vendido:</strong> total vendido por ese vendedor, descontando rebajas o descuentos aplicados.</p>
                      <p><strong>Costo neto:</strong> costo base de los productos vendidos, sin impuestos.</p>
                      <p><strong>Costo c/IVA:</strong> ese mismo costo pero incluyendo el IVA de cada producto.</p>
                      <p><strong>Comisión:</strong> costo neto total vendido por el porcentaje de comisión configurado.</p>
                    </div>
                  </Card>
                </div>
              )}
            </div>
          )
        })()}
      </div>

      {/* Modal nuevo gasto */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="Registrar gasto">
        <div className="space-y-4">
          <Select label="Categoría" options={EXPENSE_CATEGORIES} value={form.category}
            onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
          <MoneyInput label="Monto" placeholder="0" value={form.amount}
            onChange={v => setForm(f => ({ ...f, amount: v }))} />
          <Input label="Descripción" placeholder="Ej: Pago de alquiler enero" value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 mt-4 border-t border-[var(--border)]">
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setAddModal(false)}>Cancelar</Button>
              <Button onClick={handleAddExpense} loading={saving}>Guardar</Button>
            </div>
          </div>
        </div>
      </Modal>
    </AppShell>
  )
}
