'use client'
import { useEffect, useState, useCallback } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Pagination } from '@/components/ui/Pagination'
import { PageLoader } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { api } from '@/lib/api'
import { formatCurrency, formatDate, formatDateTime, getPeriodDates, getPaymentMethodLabel } from '@/lib/utils'
import type { FinanceSummary, Expense, Sale, PaginatedResponse, Pagination as PaginationType } from '@/types'
import { TrendingUp, TrendingDown, DollarSign, Plus } from 'lucide-react'
import { toast } from 'sonner'

type Tab = 'ingresos' | 'gastos' | 'balance'
type Period = 'week' | 'month' | 'year'

const EXPENSE_CATEGORIES = [
  { value: 'proveedores', label: 'Proveedores' },
  { value: 'personal', label: 'Personal' },
  { value: 'alquiler', label: 'Alquiler' },
  { value: 'servicios', label: 'Servicios' },
  { value: 'impuestos', label: 'Impuestos' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'otro', label: 'Otro' },
]

export default function FinancesPage() {
  const [tab, setTab] = useState<Tab>('balance')
  const [period, setPeriod] = useState<Period>('month')
  const [summary, setSummary] = useState<FinanceSummary | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [expPagination, setExpPag] = useState<PaginationType>({ total: 0, page: 1, limit: 50, pages: 0 })
  const [expPage, setExpPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [addModal, setAddModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ category: 'otro', amount: '', description: '' })
  // Agregar estados para ingresos
  const [income, setIncome] = useState<Sale[]>([])
  const [incomePag, setIncomePag] = useState<PaginationType>({ total: 0, page: 1, limit: 50, pages: 0 })
  const [incomePage, setIncomePage] = useState(1)

  const dates = getPeriodDates(period)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [sum, exp, inc] = await Promise.all([
        api.get<FinanceSummary>('/api/finances/summary', { from: dates.from, to: dates.to }),
        api.get<PaginatedResponse<Expense>>('/api/finances/expenses', {
          from: dates.from, to: dates.to, page: expPage, limit: 50
        }),
        api.get<PaginatedResponse<Sale>>('/api/finances/income', {
          from: dates.from, to: dates.to, page: incomePage, limit: 50
        }),
      ])
      setSummary(sum)
      setExpenses(exp.data)
      setExpPag(exp.pagination)
      setIncome(inc.data)
      setIncomePag(inc.pagination)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [period, expPage, incomePage]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { setExpPage(1) }, [period])

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
      fetchData()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const periods: { key: Period; label: string }[] = [
    { key: 'week', label: 'Semana' },
    { key: 'month', label: 'Mes' },
    { key: 'year', label: 'Año' },
  ]

  const tabs: { key: Tab; label: string }[] = [
    { key: 'balance', label: 'Balance' },
    { key: 'ingresos', label: 'Ingresos' },
    { key: 'gastos', label: 'Gastos' },
  ]

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
        {/* Período */}
        <div className="flex gap-2">
          {periods.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors ${period === p.key ? 'bg-[var(--accent)] text-white' : 'bg-[var(--surface2)] text-[var(--text2)] hover:bg-[var(--surface3)]'
                }`}>
              {p.label}
            </button>
          ))}
        </div>

        {loading ? <PageLoader /> : (
          <>
            {/* Stats rápidas */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatCard title="Ingresos" value={formatCurrency(summary?.revenue ?? 0)} icon={TrendingUp} accent />
              <StatCard title="Gastos" value={formatCurrency(summary?.expenses ?? 0)} icon={TrendingDown} />
              <StatCard
                title="Ganancia neta"
                value={formatCurrency(summary?.net ?? 0)}
                subtitle={`Margen ${summary?.margin_pct ?? 0}%`}
                icon={DollarSign}
                className="col-span-2 md:col-span-1"
              />
            </div>

            {/* Barra progreso gastos/ingresos */}
            {(summary?.revenue ?? 0) > 0 && (
              <Card>
                <p className="text-xs text-[var(--text3)] mb-2">Gastos vs ingresos</p>
                <div className="h-2 bg-[var(--surface2)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--danger)] rounded-full transition-all"
                    style={{ width: `${Math.min(((summary?.expenses ?? 0) / (summary?.revenue ?? 1)) * 100, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1.5 text-xs text-[var(--text3)]">
                  <span>{Math.round(((summary?.expenses ?? 0) / (summary?.revenue ?? 1)) * 100)}% de los ingresos</span>
                  <span>Margen: {summary?.margin_pct ?? 0}%</span>
                </div>
              </Card>
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

            {/* Tab: Balance */}
            {tab === 'balance' && (
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
            )}

            {tab === 'ingresos' && (
              income.length === 0 ? (
                <p className="text-sm text-[var(--text3)] text-center py-8">Sin ingresos en el período</p>
              ) : (
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)]">Fecha</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden md:table-cell">Vendedor</th>
                        <th className="text-center px-4 py-3 text-xs font-medium text-[var(--text3)]">Método</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)] hidden sm:table-cell">Descuento</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)]">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {income.map(sale => (
                        <tr key={sale.id} className="hover:bg-[var(--surface2)] transition-colors">
                          <td className="px-4 py-3 text-xs mono text-[var(--text2)]">
                            {formatDateTime(sale.created_at)}
                          </td>
                          <td className="px-4 py-3 text-[var(--text2)] hidden md:table-cell">
                            {(sale.users as { full_name: string } | undefined)?.full_name ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge variant="default">{getPaymentMethodLabel(sale.payment_method)}</Badge>
                          </td>
                          <td className="px-4 py-3 text-right mono text-[var(--text3)] hidden sm:table-cell">
                            {Number(sale.discount) > 0 ? `- ${formatCurrency(sale.discount)}` : '—'}
                          </td>
                          <td className="px-4 py-3 text-right mono font-semibold text-[var(--text)]">
                            {formatCurrency(sale.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <Pagination pagination={incomePag} onPageChange={setIncomePage} />
                </div>
              )
            )}

            {/* Tab: Gastos */}
            {tab === 'gastos' && (
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
                        <td className="px-4 py-3 text-xs mono text-[var(--text3)] hidden md:table-cell">
                          {formatDate(exp.date)}
                        </td>
                        <td className="px-4 py-3 text-right mono font-semibold text-[var(--danger)]">
                          {formatCurrency(exp.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pagination pagination={expPagination} onPageChange={setExpPage} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal nuevo gasto */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="Registrar gasto">
        <div className="space-y-4">
          <Select
            label="Categoría"
            options={EXPENSE_CATEGORIES}
            value={form.category}
            onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
          />
          <Input
            label="Monto"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={form.amount}
            onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
          />
          <Input
            label="Descripción"
            placeholder="Ej: Pago de alquiler enero"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setAddModal(false)}>Cancelar</Button>
            <Button onClick={handleAddExpense} loading={saving}>Guardar</Button>
          </div>
        </div>
      </Modal>
    </AppShell>
  )
}
