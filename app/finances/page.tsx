'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
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
import { TrendingUp, TrendingDown, DollarSign, Plus, FileCheck } from 'lucide-react'
import { toast } from 'sonner'

type Tab = 'ingresos' | 'gastos' | 'balance' | 'afip' | 'commissions'

interface AfipTypeSummary { count: number; total: number; net: number; iva: number }
interface AfipSummary {
  by_type: Record<string, AfipTypeSummary>
  facturas: number
  nc_total: number
  nd_total: number
  total_net: number
  total_iva: number
}
interface BusinessUser {
  id: string
  full_name: string | null
  email: string | null
  role: string
  is_active: boolean
  branch_id: string | null
  warehouse_id: string | null
  commission_pct: number | null
  branch: { name: string } | null
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
  const [afipSummary, setAfipSummary] = useState<AfipSummary | null>(null)
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo] = useState('')
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null)
  const [commissionRows, setCommissionRows] = useState<SellerCommissionRow[]>([])
  const [commissionsLoading, setCommissionsLoading] = useState(false)

  const periodRef = useRef(period)
  const expPageRef = useRef(expPage)
  const incomePageRef = useRef(incomePage)
  const customRangeRef = useRef(customRange)
  useEffect(() => { periodRef.current = period }, [period])
  useEffect(() => { customRangeRef.current = customRange }, [customRange])

  const getActiveRange = useCallback(() => {
    const periodKey = periodRef.current
    const custom = customRangeRef.current
    return custom ?? (periodKey === 'all' ? null : getPeriodDates(periodKey))
  }, [])

  const fetchAfipSummary = useCallback(async (from?: string, to?: string) => {
    try {
      const params: Record<string, string> = {}
      if (from) params.from = from
      if (to) params.to = to
      const afip = await api.get<AfipSummary>('/api/invoices/summary', params)
      setAfipSummary(afip)
    } catch (err) {
      console.error(err)
    }
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const baseRange = getActiveRange()
      const dateParams = baseRange ? { from: baseRange.from, to: baseRange.to } : undefined
      const [sum, exp, inc] = await Promise.all([
        api.get<FinanceSummary>('/api/finances/summary', dateParams),
        api.get<PaginatedResponse<Expense>>('/api/finances/expenses', {
          ...(dateParams ?? {}),
          page:  expPageRef.current,
          limit: 50,
        }),
        api.get<PaginatedResponse<Sale>>('/api/finances/income', {
          ...(dateParams ?? {}),
          page:  incomePageRef.current,
          limit: 50,
        }),
      ])
      setSummary(sum)
      setExpenses(exp.data)
      setExpPag(exp.pagination)
      setIncome(inc.data)
      setIncomePag(inc.pagination)
      fetchAfipSummary(baseRange?.from, baseRange?.to)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [fetchAfipSummary, getActiveRange])

  const fetchCommissionRows = useCallback(async () => {
    setCommissionsLoading(true)
    try {
      const activeRange = getActiveRange()
      const salesParamsBase: Record<string, string | number> = {
        page: 1,
        limit: 100,
      }

      if (activeRange) {
        salesParamsBase.from = activeRange.from
        salesParamsBase.to = activeRange.to
      }

      const users = await api.get<BusinessUser[]>('/api/auth/users')
      const sellers = (users ?? []).filter(user => user.role === 'seller')

      if (sellers.length === 0) {
        setCommissionRows([])
        return
      }

      const firstSalesPage = await api.get<PaginatedResponse<Sale>>('/api/sales', salesParamsBase)
      const allSales = [...(firstSalesPage.data ?? [])]

      for (let currentPage = 2; currentPage <= (firstSalesPage.pagination?.pages ?? 0); currentPage += 1) {
        const pageResponse = await api.get<PaginatedResponse<Sale>>('/api/sales', {
          ...salesParamsBase,
          page: currentPage,
        })
        allSales.push(...(pageResponse.data ?? []))
      }

      const rowsBySeller = new Map<string, SellerCommissionRow>(
        sellers.map(seller => [
          seller.id,
          {
            sellerId: seller.id,
            sellerName: seller.full_name?.trim() || seller.email?.trim() || 'Sin nombre',
            branchName: seller.branch?.name ?? 'Sin sucursal',
            commissionPct: Number(seller.commission_pct ?? 0),
            salesCount: 0,
            soldAmount: 0,
            costNetAmount: 0,
            costWithVatAmount: 0,
            commissionAmount: 0,
            isActive: seller.is_active,
          },
        ])
      )

      for (const sale of allSales) {
        if (!sale.user_id) continue
        const sellerRow = rowsBySeller.get(sale.user_id)
        if (!sellerRow) continue

        const saleItems = sale.sale_items ?? []
        const saleGross = saleItems.length > 0
          ? saleItems.reduce((total, item) => total + (Number(item.unit_price ?? 0) * Number(item.quantity ?? 0)), 0)
          : Number(sale.total ?? 0)
        const saleDiscount = Number(sale.discount ?? 0)
        const soldAmount = Math.max(saleGross - saleDiscount, 0)

        const costNetAmount = saleItems.reduce((total, item) => {
          const quantity = Number(item.quantity ?? 0)
          const product = item.products
          return total + (Number(product?.cost_price_net ?? 0) * quantity)
        }, 0)

        const costWithVatAmount = saleItems.reduce((total, item) => {
          const quantity = Number(item.quantity ?? 0)
          const product = item.products
          const netCost = Number(product?.cost_price_net ?? 0)
          const explicitCostWithVat = product?.cost_price_with_vat
          const vatRate = Number(product?.vat_rate ?? 0)
          const costWithVat = explicitCostWithVat != null
            ? Number(explicitCostWithVat)
            : netCost * (1 + vatRate / 100)
          return total + (costWithVat * quantity)
        }, 0)

        sellerRow.salesCount += 1
        sellerRow.soldAmount += soldAmount
        sellerRow.costNetAmount += costNetAmount
        sellerRow.costWithVatAmount += costWithVatAmount
        sellerRow.commissionAmount += costNetAmount * (sellerRow.commissionPct / 100)
      }

      const nextRows = Array.from(rowsBySeller.values()).sort((a, b) => {
        if (b.commissionAmount !== a.commissionAmount) return b.commissionAmount - a.commissionAmount
        if (b.soldAmount !== a.soldAmount) return b.soldAmount - a.soldAmount
        return a.sellerName.localeCompare(b.sellerName)
      })

      setCommissionRows(nextRows)
    } catch (error) {
      console.error(error)
      setCommissionRows([])
      toast.error(error instanceof Error ? error.message : 'No se pudieron calcular las comisiones')
    } finally {
      setCommissionsLoading(false)
    }
  }, [getActiveRange])

  useEffect(() => {
    expPageRef.current = 1
    incomePageRef.current = 1
    setExpPage(1)
    setIncomePage(1)
    fetchData()
  }, [period, fetchData])

  useEffect(() => {
    if (tab !== 'commissions') return
    void fetchCommissionRows()
  }, [tab, period, customRange, fetchCommissionRows])

  const handleExpPageChange = useCallback((newPage: number) => {
    expPageRef.current = newPage
    setExpPage(newPage)
    fetchData()
  }, [fetchData])

  const handleIncomePageChange = useCallback((newPage: number) => {
    incomePageRef.current = newPage
    setIncomePage(newPage)
    fetchData()
  }, [fetchData])

  const applyCustomRange = useCallback(() => {
    if (!rangeFrom || !rangeTo) return
    const from = `${rangeFrom}T00:00:00.000Z`
    const to = `${rangeTo}T23:59:59.999Z`
    const next = { from, to }
    setCustomRange(next)
    customRangeRef.current = next
    fetchData()
  }, [rangeFrom, rangeTo, fetchData])

  const clearCustomRange = useCallback(() => {
    setRangeFrom('')
    setRangeTo('')
    setCustomRange(null)
    customRangeRef.current = null
    fetchData()
  }, [fetchData])

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
    { key: 'today', label: 'Hoy' },
    { key: 'week', label: 'Semana' },
    { key: 'month', label: 'Mes' },
    { key: 'year', label: 'Año' },
    { key: 'all', label: 'Todas' },
  ]

  const tabs: { key: Tab; label: string }[] = [
    { key: 'balance', label: 'Balance' },
    { key: 'ingresos', label: 'Ingresos' },
    { key: 'gastos', label: 'Gastos' },
    { key: 'afip', label: 'ARCA / AFIP' },
    { key: 'commissions', label: 'Comisiones' },
  ]

  const handlePeriodChange = (newPeriod: Period) => {
    if (customRange) {
      setCustomRange(null)
      customRangeRef.current = null
    }
    setPeriod(newPeriod)
  }

  const activePeriod: Period = customRange ? 'all' : period
  const isRangeValid = Boolean(rangeFrom && rangeTo && rangeFrom <= rangeTo)

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
            <Button
              size="sm"
              variant="secondary"
              onClick={applyCustomRange}
              disabled={!isRangeValid}
            >Aplicar</Button>
            {(customRange || rangeFrom || rangeTo) && (
              <button
                type="button"
                onClick={clearCustomRange}
                className="text-xs text-[var(--text3)] hover:text-[var(--text)] underline"
              >Limpiar</button>
            )}
          </div>
        </div>
        {customRange && (
          <p className="text-xs text-[var(--text3)]">
            Mostrando rango personalizado: {rangeFrom} → {rangeTo}
          </p>
        )}

        {loading ? <PageLoader /> : (
          <>
            {/* Stats rápidas */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <StatCard title="Ingresos" value={formatCurrency(summary?.revenue ?? 0)} icon={TrendingUp} accent />
              <StatCard title="Gastos" value={formatCurrency(summary?.expenses ?? 0)} icon={TrendingDown} />
              <StatCard
                title="Ganancia neta"
                value={formatCurrency(summary?.net ?? 0)}
                subtitle={`Margen ${summary?.margin_pct ?? 0}%`}
                icon={DollarSign}
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
                  <Pagination pagination={incomePag} onPageChange={handleIncomePageChange} />
                </div>
              )
            )}

            {tab === 'commissions' && (() => {
              const sellersWithSales = commissionRows.filter(row => row.salesCount > 0)
              const totalSold = commissionRows.reduce((total, row) => total + row.soldAmount, 0)
              const totalCommission = commissionRows.reduce((total, row) => total + row.commissionAmount, 0)
              const totalCostWithVat = commissionRows.reduce((total, row) => total + row.costWithVatAmount, 0)

              if (commissionsLoading) {
                return <PageLoader />
              }

              return (
                <div className="space-y-4">
                  <p className="text-xs text-[var(--text3)] -mt-1">
                    Comisión calculada sobre el costo neto del período, usando el porcentaje fijo configurado en cada vendedor.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <StatCard
                      title="Comisiones a pagar"
                      value={formatCurrency(totalCommission)}
                      subtitle={`${sellersWithSales.length} vendedores con ventas`}
                      icon={DollarSign}
                      accent
                    />
                    <StatCard
                      title="Vendido neto"
                      value={formatCurrency(totalSold)}
                      subtitle="Total usado para comisión"
                      icon={TrendingUp}
                    />
                    <StatCard
                      title="Costo c/IVA"
                      value={formatCurrency(totalCostWithVat)}
                      subtitle="Acumulado del período"
                      icon={TrendingDown}
                    />
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
                          <p><strong>Ventas:</strong> muestra cuántas ventas hizo ese vendedor dentro del período seleccionado.</p>
                          <p><strong>Vendido:</strong> muestra el total vendido por ese vendedor, descontando rebajas o descuentos aplicados en cada operación.</p>
                          <p><strong>Costo neto:</strong> muestra el costo base de los productos vendidos, sin impuestos.</p>
                          <p><strong>Costo c/IVA:</strong> muestra ese mismo costo pero incluyendo el IVA de cada producto.</p>
                          <p><strong>Comisión:</strong> se calcula tomando el costo neto total vendido por ese vendedor y aplicando el porcentaje de comisión que tenga configurado.</p>
                        </div>
                      </Card>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Tab: ARCA / AFIP */}
            {tab === 'afip' && (() => {
              const activeRange = customRange ?? (period === 'all' ? null : getPeriodDates(period))
              const fmtDate = (d: string) =>
                new Date(d + (d.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
              return (
              <div className="space-y-4">
                <p className="text-xs text-[var(--text3)] -mt-1">
                  {activeRange
                    ? <>Período del selector: <span className="font-medium text-[var(--text2)]">{fmtDate(activeRange.from.slice(0, 10))} → {fmtDate(activeRange.to.slice(0, 10))}</span></>
                    : <>Período del selector: <span className="font-medium text-[var(--text2)]">Todo el histórico</span></>
                  }
                  <span className="ml-2">· Solo comprobantes autorizados con CAE</span>
                </p>

                {/* Stat cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <StatCard
                    title="Total facturado"
                    value={formatCurrency(afipSummary?.facturas ?? 0)}
                    subtitle="Facturas A+B+C con CAE"
                    icon={FileCheck}
                    accent
                  />
                  <StatCard
                    title="Neto gravado"
                    value={formatCurrency(afipSummary?.total_net ?? 0)}
                    subtitle="Base imponible"
                    icon={DollarSign}
                  />
                  <StatCard
                    title="IVA facturado"
                    value={formatCurrency(afipSummary?.total_iva ?? 0)}
                    subtitle="IVA 21% acumulado"
                    icon={TrendingUp}
                  />
                  <StatCard
                    title="NC emitidas"
                    value={formatCurrency(afipSummary?.nc_total ?? 0)}
                    subtitle="Notas de crédito"
                    icon={TrendingDown}
                  />
                </div>

                {/* Tabla por tipo */}
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
                        { key: 'A',   label: 'Factura A',       showIva: true  },
                        { key: 'B',   label: 'Factura B',       showIva: false },
                        { key: 'C',   label: 'Factura C',       showIva: false },
                        { key: 'NCA', label: 'Nota de Crédito A', showIva: true  },
                        { key: 'NCB', label: 'Nota de Crédito B', showIva: false },
                        { key: 'NCC', label: 'Nota de Crédito C', showIva: false },
                        { key: 'NDA', label: 'Nota de Débito A',  showIva: true  },
                        { key: 'NDB', label: 'Nota de Débito B',  showIva: false },
                        { key: 'NDC', label: 'Nota de Débito C',  showIva: false },
                      ] as const).map(({ key, label, showIva }) => {
                        const row = afipSummary?.by_type?.[key]
                        if (!row || row.count === 0) return null
                        return (
                          <tr key={key} className="hover:bg-[var(--surface2)] transition-colors">
                            <td className="px-4 py-3 text-[var(--text)]">{label}</td>
                            <td className="px-4 py-3 text-right mono text-[var(--text2)]">{row.count}</td>
                            <td className="px-4 py-3 text-right mono font-semibold text-[var(--text)]">
                              {formatCurrency(row.total)}
                            </td>
                            <td className="px-4 py-3 text-right mono text-[var(--text2)] hidden md:table-cell">
                              {showIva ? formatCurrency(row.net) : '—'}
                            </td>
                            <td className="px-4 py-3 text-right mono text-[var(--text2)] hidden md:table-cell">
                              {showIva ? formatCurrency(row.iva) : '—'}
                            </td>
                          </tr>
                        )
                      })}
                      {/* Si no hay nada */}
                      {!afipSummary || Object.values(afipSummary.by_type).every(r => r.count === 0) ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-sm text-[var(--text3)]">
                            Sin comprobantes autorizados en el período
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                    {/* Totales footer */}
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
                          <td className="px-4 py-3 text-right mono font-semibold text-[var(--text)] hidden md:table-cell">
                            {formatCurrency(afipSummary.total_net)}
                          </td>
                          <td className="px-4 py-3 text-right mono font-semibold text-[var(--text)] hidden md:table-cell">
                            {formatCurrency(afipSummary.total_iva)}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>

                {/* ND info si hay */}
                {(afipSummary?.nd_total ?? 0) > 0 && (
                  <p className="text-xs text-[var(--text3)] px-1">
                    Notas de débito: {formatCurrency(afipSummary!.nd_total)} — incluidas en el total neto.
                  </p>
                )}
              </div>
              )
            })()}

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
                <Pagination pagination={expPagination} onPageChange={handleExpPageChange} />
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
