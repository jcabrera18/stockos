'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoader } from '@/components/ui/Spinner'
import { Pagination } from '@/components/ui/Pagination'
import { api } from '@/lib/api'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import type { Pagination as PaginationType } from '@/types'
import { DollarSign, CheckCircle, Clock, TrendingUp, TrendingDown, Minus, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useWorkstation } from '@/hooks/useWorkstation'
import { useAuth } from '@/hooks/useAuth'

interface Branch { id: string; name: string }
interface Register { id: string; name: string; branch_id: string }

interface CashRegister {
  id: string
  user_id: string
  closed_by?: string
  branch_id?: string
  register_id?: string
  opening_amount: number
  closing_amount?: number
  status: 'open' | 'closed'
  notes?: string
  system_efectivo: number
  system_debito: number
  system_credito: number
  system_transferencia: number
  system_qr: number
  system_cuenta_corriente: number
  system_cash_in?: number
  system_cc_collected?: number
  system_cash_out?: number
  system_total: number
  difference?: number
  opened_at: string
  closed_at?: string
  opener?: { full_name: string }
  closer?: { full_name: string }
  branches?: { name: string }
  registers?: { name: string }
}

const RESTRICTED_ROLES = ['cashier', 'stocker', 'seller']

export default function CashRegisterPage() {
  const { workstation, loaded } = useWorkstation()
  const { user } = useAuth()
  const isRestrictedRef = useRef(false)

  const [openRegisters, setOpenRegisters] = useState<CashRegister[]>([])
  const [history, setHistory] = useState<CashRegister[]>([])
  const [pagination, setPagination] = useState<PaginationType>({ total: 0, page: 1, limit: 20, pages: 0 })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  // Target para cerrar (para owner/admin que puede cerrar cualquier caja)
  const [closeTarget, setCloseTarget] = useState<CashRegister | null>(null)

  // Sucursales y cajas para el selector
  const [branches, setBranches] = useState<Branch[]>([])
  const [registers, setRegisters] = useState<Register[]>([])
  const [openBranchId, setOpenBranchId] = useState('')
  const [openRegisterId, setOpenRegisterId] = useState('')

  // Modales
  const [openModal, setOpenModal] = useState(false)
  const [closeModal, setCloseModal] = useState(false)
  const [detailModal, setDetailModal] = useState(false)
  const [selectedRegister, setSelectedRegister] = useState<CashRegister | null>(null)

  // Forms
  const [openingAmount, setOpeningAmount] = useState('')
  const [closingAmount, setClosingAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // Movimientos de caja (ingreso/egreso de efectivo)
  const [movementModal, setMovementModal] = useState(false)
  const [movementTarget, setMovementTarget] = useState<CashRegister | null>(null)
  const [movementType, setMovementType] = useState<'in' | 'out'>('out')
  const [movementAmount, setMovementAmount] = useState('')
  const [movementReason, setMovementReason] = useState('')
  const [movementCategory, setMovementCategory] = useState('proveedores')

  // Refresh
  const [refreshing, setRefreshing] = useState(false)

  // Caja del cajero actual
  const current = openRegisters.find(r =>
    workstation ? r.register_id === workstation.register_id : true
  ) ?? null
  const isMyCaja = !isRestrictedRef.current || current?.register_id === workstation?.register_id

  useEffect(() => {
    isRestrictedRef.current = RESTRICTED_ROLES.includes(user?.role ?? '')
  }, [user])

  // Precargar sucursal y caja del workstation
  useEffect(() => {
    if (workstation) {
      setOpenBranchId(workstation.branch_id)
      setOpenRegisterId(workstation.register_id)
    }
  }, [workstation])

  const pageRef = useRef(page)
  const registerIdRef = useRef(workstation?.register_id)
  useEffect(() => { registerIdRef.current = workstation?.register_id }, [workstation?.register_id])

  const fetchData = useCallback(async () => {
    if (!loaded) return
    setLoading(true)
    try {
      const cashParams = registerIdRef.current && isRestrictedRef.current
        ? { page: pageRef.current, limit: 20, register_id: registerIdRef.current }
        : { page: pageRef.current, limit: 20 }

      const openParams = registerIdRef.current && isRestrictedRef.current
        ? { register_id: registerIdRef.current }
        : {}

      const [hist, br, regs, opens] = await Promise.all([
        api.get<{ data: CashRegister[]; pagination: PaginationType }>('/api/cash-register', cashParams),
        api.get<Branch[]>('/api/branches'),
        api.get<Register[]>('/api/branches/all-registers'),
        api.get<CashRegister[]>('/api/cash-register/open', openParams),
      ])

      setOpenRegisters(opens)
      setHistory(hist.data)
      setPagination(hist.pagination)
      setBranches(br)
      setRegisters(regs)
    } catch (err) {
      console.error('fetchData error:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [loaded])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchData()
  }

  useEffect(() => { fetchData() }, [fetchData])

  const handlePageChange = useCallback((newPage: number) => {
    pageRef.current = newPage
    setPage(newPage)
    fetchData()
  }, [fetchData])

  // Cajas disponibles para abrir (excluir las ya abiertas)
  const openRegisterIds = new Set(openRegisters.map(r => r.register_id))
  const availableRegisters = registers.filter(r =>
    (!openBranchId || r.branch_id === openBranchId) &&
    !openRegisterIds.has(r.id)
  )

  const handleOpen = async () => {
    if (!openBranchId) { toast.error('Seleccioná una sucursal'); return }
    if (!openRegisterId) { toast.error('Seleccioná una caja'); return }
    if (openingAmount === '') { toast.error('Ingresá el fondo inicial'); return }

    setSaving(true)
    try {
      await api.post('/api/cash-register/open', {
        branch_id: openBranchId,
        register_id: openRegisterId,
        opening_amount: Number(openingAmount),
        notes: notes.trim() || null,
      })
      toast.success('Caja abierta correctamente')
      setOpenModal(false)
      setOpeningAmount(''); setNotes('')
      window.dispatchEvent(new Event('caja-changed'))
      fetchData()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al abrir caja')
    } finally { setSaving(false) }
  }

  const handleClose = async () => {
    const target = closeTarget ?? current
    if (!target) return
    if (closingAmount === '') { toast.error('Ingresá el efectivo en caja'); return }
    setSaving(true)
    try {
      await api.post(`/api/cash-register/${target.id}/close`, {
        closing_amount: Number(closingAmount),
        notes: notes.trim() || null,
      })
      toast.success('Caja cerrada correctamente')
      setCloseModal(false)
      setCloseTarget(null)
      setClosingAmount(''); setNotes('')
      window.dispatchEvent(new Event('caja-changed'))
      fetchData()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al cerrar caja')
    } finally { setSaving(false) }
  }

  const openCloseModal = (register: CashRegister) => {
    setCloseTarget(register)
    setClosingAmount('')
    setNotes('')
    setCloseModal(true)
  }

  const openMovementModal = (register: CashRegister, type: 'in' | 'out') => {
    setMovementTarget(register)
    setMovementType(type)
    setMovementAmount('')
    setMovementReason('')
    setMovementCategory('proveedores')
    setMovementModal(true)
  }

  const handleMovement = async () => {
    if (!movementTarget) return
    if (movementAmount === '' || Number(movementAmount) <= 0) { toast.error('Ingresá un monto válido'); return }
    if (!movementReason.trim()) { toast.error('Ingresá un motivo'); return }
    setSaving(true)
    try {
      await api.post(`/api/cash-register/${movementTarget.id}/movement`, {
        type: movementType,
        amount: Number(movementAmount),
        reason: movementReason.trim(),
        ...(movementType === 'out' ? { category: movementCategory } : {}),
      })
      toast.success(movementType === 'out' ? 'Egreso registrado' : 'Ingreso registrado')
      setMovementModal(false)
      setMovementTarget(null)
      window.dispatchEvent(new Event('caja-changed'))
      fetchData()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al registrar el movimiento')
    } finally { setSaving(false) }
  }

  // Efectivo esperado = fondo + ventas efectivo + ingresos + cobros CC efectivo − egresos
  const expectedCash = (r: CashRegister) =>
    Number(r.opening_amount) + r.system_efectivo
      + (r.system_cash_in ?? 0) + (r.system_cc_collected ?? 0) - (r.system_cash_out ?? 0)

  const diffColor = (diff?: number) => {
    if (diff === undefined || diff === null) return 'text-[var(--text3)]'
    if (Math.abs(diff) < 1) return 'text-[var(--accent)]'
    return diff > 0 ? 'text-[var(--accent)]' : 'text-[var(--danger)]'
  }

  const diffIcon = (diff?: number) => {
    if (diff === undefined || diff === null) return <Minus size={14} />
    if (Math.abs(diff) < 1) return <CheckCircle size={14} />
    return diff > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />
  }

  const modalTarget = closeTarget ?? current

  return (
    <AppShell>
      <PageHeader
        title="Caja"
        description={workstation
          ? `${workstation.branch_name} · ${workstation.register_name}`
          : 'Apertura y cierre de caja'
        }
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleRefresh} loading={refreshing}>
              <RefreshCw size={15} /> Actualizar
            </Button>
            <Button onClick={() => { setNotes(''); setOpeningAmount(''); setOpenModal(true) }}>
              <DollarSign size={15} /> Abrir caja
            </Button>
          </div>
        }
      />

      <div className="p-5 space-y-5">
        {loading ? <PageLoader /> : (
          <>
            {/* ── Cajas abiertas ── */}
            {openRegisters.length > 0 ? (
              <div>
                {/* Para owner/admin: cards de todas las cajas abiertas */}
                {!isRestrictedRef.current && openRegisters.length > 1 ? (
                  <div>
                    <h2 className="text-sm font-semibold text-[var(--text)] mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
                      Cajas abiertas ahora
                    </h2>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {openRegisters.map(r => (
                        <div key={r.id}
                          className="bg-[var(--surface)] border-2 border-[var(--accent)] rounded-[var(--radius-lg)] p-4 space-y-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-sm font-semibold text-[var(--text)]">
                                {(r.registers as { name: string } | undefined)?.name ?? 'Caja'}
                              </p>
                              <p className="text-xs text-[var(--text3)]">
                                {(r.branches as { name: string } | undefined)?.name ?? ''}
                              </p>
                            </div>
                            <Badge variant="success">Abierta</Badge>
                          </div>
                          <div className="bg-[var(--surface2)] rounded-[var(--radius-md)] px-3">
                            {[
                              { label: 'Fondo', value: r.opening_amount, accent: false },
                              { label: 'Efectivo', value: r.system_efectivo, accent: false },
                              { label: 'Débito', value: r.system_debito, accent: false },
                              { label: 'Crédito', value: r.system_credito, accent: false },
                              { label: 'Transferencia', value: r.system_transferencia, accent: false },
                              { label: 'QR', value: r.system_qr, accent: false },
                              { label: 'Cta. Cte.', value: (r as CashRegister & { system_cuenta_corriente?: number }).system_cuenta_corriente ?? 0, accent: false },
                            ].map(row => (
                              <div key={row.label}
                                className="flex items-center justify-between gap-3 py-1.5 border-b border-[var(--border)] last:border-0">
                                <span className={`text-xs ${row.accent ? 'text-[var(--accent)] font-medium' : 'text-[var(--text3)]'}`}>{row.label}</span>
                                <span className={`text-xs font-semibold mono whitespace-nowrap ${row.accent ? 'text-[var(--accent)]' : 'text-[var(--text)]'}`}>
                                  {formatCurrency(row.value)}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center justify-between gap-3 px-1">
                            <span className="text-xs font-semibold text-[var(--text)]">Total vendido</span>
                            <span className="text-sm font-bold mono whitespace-nowrap text-[var(--text)]">{formatCurrency(r.system_total)}</span>
                          </div>
                          {!!r.system_cc_collected && (
                            <div className="flex items-center justify-between gap-3 px-1">
                              <span className="text-xs text-[var(--text3)]">Cobros cta. cte.</span>
                              <span className="text-xs font-semibold mono whitespace-nowrap text-[var(--accent)]">+{formatCurrency(r.system_cc_collected)}</span>
                            </div>
                          )}
                          {!!r.system_cash_out && (
                            <div className="flex items-center justify-between gap-3 px-1">
                              <span className="text-xs text-[var(--text3)]">Egresos de caja</span>
                              <span className="text-xs font-semibold mono whitespace-nowrap text-[var(--danger)]">−{formatCurrency(r.system_cash_out)}</span>
                            </div>
                          )}
                          <p className="text-xs text-[var(--text3)]">Desde {formatDateTime(r.opened_at)}</p>
                          <div className="grid grid-cols-2 gap-2">
                            <Button variant="secondary" onClick={() => openMovementModal(r, 'out')} className="w-full">
                              <TrendingDown size={14} /> Egreso
                            </Button>
                            <Button variant="secondary" onClick={() => openMovementModal(r, 'in')} className="w-full">
                              <TrendingUp size={14} /> Ingreso
                            </Button>
                          </div>
                          <Button variant="danger" onClick={() => openCloseModal(r)} className="w-full">
                            Cerrar caja
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : current ? (
                  // Vista cajero o owner con una sola caja
                  <div className="bg-[var(--surface)] border-2 border-[var(--accent)] rounded-[var(--radius-lg)] p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-[var(--accent)] animate-pulse" />
                        <span className="text-sm font-semibold text-[var(--accent)]">Caja abierta</span>
                        {(current.branches as { name: string } | undefined)?.name && (
                          <span className="text-xs text-[var(--text3)]">
                            · {(current.branches as { name: string }).name}
                            {(current.registers as { name: string } | undefined)?.name &&
                              ` · ${(current.registers as { name: string }).name}`
                            }
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-[var(--text3)]">Desde {formatDateTime(current.opened_at)}</span>
                    </div>

                    <div className="bg-[var(--surface2)] rounded-[var(--radius-lg)] overflow-hidden">
                      <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-x-6 px-3">
                        {[
                          { label: 'Fondo inicial', value: current.opening_amount, accent: false },
                          { label: 'Débito', value: current.system_debito, accent: false },
                          { label: 'Efectivo', value: current.system_efectivo, accent: false },
                          { label: 'Crédito', value: current.system_credito, accent: false },
                          { label: 'Transferencia', value: current.system_transferencia, accent: false },
                          { label: 'QR', value: current.system_qr, accent: false },
                          { label: 'Cuenta Corriente', value: current.system_cuenta_corriente, accent: false },
                        ].map(row => (
                          <div key={row.label}
                            className="flex items-center justify-between gap-3 py-2.5 border-b border-[var(--border)]">
                            <span className={`text-sm flex items-center gap-1.5 ${row.accent ? 'text-[var(--accent)] font-medium' : 'text-[var(--text3)]'}`}>
                              {row.accent && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />}
                              {row.label}
                            </span>
                            <span className={`text-sm font-semibold mono whitespace-nowrap ${row.accent ? 'text-[var(--accent)]' : 'text-[var(--text)]'}`}>
                              {formatCurrency(row.value)}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="px-3 py-3 bg-[var(--surface)] space-y-1.5">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold text-[var(--text)]">Total vendido</span>
                          <span className="text-base font-bold mono whitespace-nowrap text-[var(--text)]">
                            {formatCurrency(current.system_total)}
                          </span>
                        </div>
                        {!!current.system_cc_collected && (
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm text-[var(--text3)]">Cobros de cuenta corriente</span>
                            <span className="text-sm font-semibold mono whitespace-nowrap text-[var(--accent)]">
                              +{formatCurrency(current.system_cc_collected)}
                            </span>
                          </div>
                        )}
                        {!!current.system_cash_in && (
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm text-[var(--text3)]">Ingresos de caja</span>
                            <span className="text-sm font-semibold mono whitespace-nowrap text-[var(--accent)]">
                              +{formatCurrency(current.system_cash_in)}
                            </span>
                          </div>
                        )}
                        {!!current.system_cash_out && (
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm text-[var(--text3)]">Egresos de caja</span>
                            <span className="text-sm font-semibold mono whitespace-nowrap text-[var(--danger)]">
                              −{formatCurrency(current.system_cash_out)}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-3 pt-1.5 border-t border-[var(--border)]">
                          <span className="text-sm font-semibold text-[var(--accent)]">Efectivo esperado</span>
                          <span className="text-base font-bold mono whitespace-nowrap text-[var(--accent)]">
                            {formatCurrency(expectedCash(current))}
                          </span>
                        </div>
                      </div>
                    </div>

                    <p className="mt-2 text-xs text-[var(--text3)]">
                      Efectivo esperado = fondo inicial + ventas en efectivo + cobros cta. cte. + ingresos − egresos de caja
                    </p>

                    {isMyCaja && (
                      <div className="mt-4 flex flex-wrap justify-end gap-2">
                        <Button variant="secondary" onClick={() => openMovementModal(current, 'out')}>
                          <TrendingDown size={15} /> Retiro / Egreso
                        </Button>
                        <Button variant="secondary" onClick={() => openMovementModal(current, 'in')}>
                          <TrendingUp size={15} /> Ingreso
                        </Button>
                        <Button variant="danger" onClick={() => openCloseModal(current)}>
                          Cerrar caja
                        </Button>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ) : (
              // Sin cajas abiertas
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[var(--surface2)] flex items-center justify-center">
                    <DollarSign size={18} className="text-[var(--text3)]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--text)]">Caja cerrada</p>
                    <p className="text-xs text-[var(--text3)]">Abrí la caja para comenzar a operar</p>
                  </div>
                </div>
                <Button onClick={() => { setNotes(''); setOpeningAmount(''); setOpenModal(true) }}>
                  <DollarSign size={15} /> Abrir caja
                </Button>
              </div>
            )}

            {/* ── Historial ── */}
            <div>
              <h2 className="text-sm font-semibold text-[var(--text)] mb-3">Historial de cierres</h2>
              {history.filter(r => r.status === 'closed').length === 0 ? (
                <EmptyState icon={Clock} title="Sin cierres aún" description="Los cierres de caja aparecerán acá." />
              ) : (
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)]">Fecha</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden md:table-cell">Cajero</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)] hidden lg:table-cell">Sucursal / Caja</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)]">Esperado</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)] hidden sm:table-cell">Declarado</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)]">Diferencia</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {history.filter(r => r.status === 'closed').map(r => (
                        <tr key={r.id}
                          onClick={() => { setSelectedRegister(r); setDetailModal(true) }}
                          className="hover:bg-[var(--surface2)] transition-colors cursor-pointer">
                          <td className="px-4 py-3 text-xs mono text-[var(--text2)]">{formatDateTime(r.opened_at)}</td>
                          <td className="px-4 py-3 text-[var(--text2)] hidden md:table-cell">{r.opener?.full_name ?? '—'}</td>
                          <td className="px-4 py-3 hidden lg:table-cell">
                            <p className="text-sm text-[var(--text)]">{(r.branches as { name: string } | undefined)?.name ?? '—'}</p>
                            <p className="text-xs text-[var(--text3)]">{(r.registers as { name: string } | undefined)?.name ?? ''}</p>
                          </td>
                          <td className="px-4 py-3 text-right mono font-semibold text-[var(--text)]">{formatCurrency((r.closing_amount ?? 0) - (r.difference ?? 0))}</td>
                          <td className="px-4 py-3 text-right mono text-[var(--text2)] hidden sm:table-cell">{formatCurrency(r.closing_amount ?? 0)}</td>
                          <td className="px-4 py-3 text-right">
                            <div className={`flex items-center justify-end gap-1 font-semibold mono text-sm ${diffColor(r.difference)}`}>
                              {diffIcon(r.difference)}
                              {r.difference !== null && r.difference !== undefined
                                ? Math.abs(r.difference) < 1 ? 'OK' : formatCurrency(Math.abs(r.difference))
                                : '—'
                              }
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <Pagination pagination={pagination} onPageChange={handlePageChange} />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Modal abrir caja ── */}
      <Modal open={openModal} onClose={() => setOpenModal(false)} title="Abrir caja" size="sm">
        <div className="space-y-4">
          <div className="px-3 py-2.5 bg-[var(--surface2)] rounded-[var(--radius-md)] text-xs text-[var(--text3)]">
            Ingresá el efectivo con el que arrancás el día (fondo de caja).
          </div>

          {isRestrictedRef.current ? (
            <div className="px-3 py-2.5 bg-[var(--surface2)] rounded-[var(--radius-md)] text-sm text-[var(--text2)]">
              <span className="font-medium text-[var(--text)]">{workstation?.branch_name}</span>
              <span className="text-[var(--text3)]"> · </span>
              <span>{workstation?.register_name}</span>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-[var(--text2)]">Sucursal *</label>
                <select value={openBranchId}
                  onChange={e => { setOpenBranchId(e.target.value); setOpenRegisterId('') }}
                  className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]">
                  <option value="">Seleccionar sucursal...</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-[var(--text2)]">Caja *</label>
                <select value={openRegisterId}
                  onChange={e => setOpenRegisterId(e.target.value)}
                  disabled={!openBranchId}
                  className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-50">
                  <option value="">{openBranchId ? 'Seleccionar caja...' : 'Primero elegí la sucursal'}</option>
                  {availableRegisters.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            </>
          )}

          <Input label="Fondo inicial *" type="number" min="0" step="100"
            value={openingAmount} onChange={e => setOpeningAmount(e.target.value)} placeholder="Ej: 5000" />
          <Input label="Notas" value={notes}
            onChange={e => setNotes(e.target.value)} placeholder="Observaciones (opcional)" />

          <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 mt-4 border-t border-[var(--border)]">
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpenModal(false)} disabled={saving}>Cancelar</Button>
              <Button onClick={handleOpen} loading={saving}>Abrir caja</Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* ── Modal cerrar caja ── */}
      <Modal open={closeModal} onClose={() => { setCloseModal(false); setCloseTarget(null) }} title="Cerrar caja" size="sm">
        {modalTarget && (
          <div className="space-y-4">
            {/* Info de la caja */}
            {(modalTarget.branches as { name: string } | undefined)?.name && (
              <div className="px-3 py-2 bg-[var(--surface2)] rounded-[var(--radius-md)]">
                <p className="text-sm font-semibold text-[var(--text)]">
                  {(modalTarget.branches as { name: string }).name}
                </p>
                <p className="text-xs text-[var(--text3)]">
                  {(modalTarget.registers as { name: string } | undefined)?.name ?? ''}
                </p>
              </div>
            )}

            <div className="bg-[var(--surface2)] rounded-[var(--radius-lg)] overflow-hidden">
              <div className="px-3 py-2 border-b border-[var(--border)]">
                <p className="text-xs font-medium text-[var(--text3)]">Ventas registradas en el sistema</p>
              </div>
              <div className="divide-y divide-[var(--border)]">
                {[
                  { label: 'Efectivo', value: modalTarget.system_efectivo },
                  { label: 'Débito', value: modalTarget.system_debito },
                  { label: 'Crédito', value: modalTarget.system_credito },
                  { label: 'Transferencia', value: modalTarget.system_transferencia },
                  { label: 'QR', value: modalTarget.system_qr },
                ].map(row => (
                  <div key={row.label} className="flex justify-between px-3 py-2 text-sm">
                    <span className="text-[var(--text2)]">{row.label}</span>
                    <span className="mono font-medium text-[var(--text)]">{formatCurrency(row.value)}</span>
                  </div>
                ))}
                <div className="flex justify-between px-3 py-2.5 text-sm font-bold">
                  <span className="text-[var(--text)]">Total</span>
                  <span className="mono text-[var(--accent)]">{formatCurrency(modalTarget.system_total)}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-between text-sm px-1">
              <span className="text-[var(--text3)]">Fondo inicial</span>
              <span className="mono text-[var(--text2)]">{formatCurrency(modalTarget.opening_amount)}</span>
            </div>
            {!!modalTarget.system_cc_collected && (
              <div className="flex justify-between text-sm px-1">
                <span className="text-[var(--text3)]">Cobros de cuenta corriente</span>
                <span className="mono text-[var(--accent)]">+{formatCurrency(modalTarget.system_cc_collected)}</span>
              </div>
            )}
            {!!modalTarget.system_cash_in && (
              <div className="flex justify-between text-sm px-1">
                <span className="text-[var(--text3)]">Ingresos de caja</span>
                <span className="mono text-[var(--accent)]">+{formatCurrency(modalTarget.system_cash_in)}</span>
              </div>
            )}
            {!!modalTarget.system_cash_out && (
              <div className="flex justify-between text-sm px-1">
                <span className="text-[var(--text3)]">Egresos de caja</span>
                <span className="mono text-[var(--danger)]">−{formatCurrency(modalTarget.system_cash_out)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm px-1">
              <span className="text-[var(--text3)]">Efectivo esperado en caja</span>
              <span className="mono font-semibold text-[var(--text)]">
                {formatCurrency(expectedCash(modalTarget))}
              </span>
            </div>

            <Input label="Efectivo físico en caja *" type="number" min="0" step="100"
              value={closingAmount} onChange={e => setClosingAmount(e.target.value)}
              placeholder="Contá los billetes e ingresá el total" autoFocus />

            {closingAmount !== '' && !isNaN(Number(closingAmount)) && (() => {
              const expected = expectedCash(modalTarget)
              const declared = Number(closingAmount)
              const diff = declared - expected
              const isOk = Math.abs(diff) < 1
              return (
                <div className={`flex items-center justify-between px-3 py-2.5 rounded-[var(--radius-md)] border ${isOk || diff > 0 ? 'bg-[var(--accent-subtle)] border-[var(--accent)]' : 'bg-[var(--danger-subtle)] border-[var(--danger)]'}`}>
                  <span className="text-sm font-medium text-[var(--text)]">
                    {isOk ? '✓ Cuadra exacto' : diff > 0 ? 'Sobran' : 'Faltan'}
                  </span>
                  <span className={`mono font-bold text-base ${isOk ? 'text-[var(--accent)]' : diff > 0 ? 'text-[var(--accent)]' : 'text-[var(--danger)]'}`}>
                    {isOk ? 'OK' : formatCurrency(Math.abs(diff))}
                  </span>
                </div>
              )
            })()}

            <Input label="Notas del cierre" value={notes}
              onChange={e => setNotes(e.target.value)} placeholder="Observaciones, novedades del día..." />

            <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 mt-4 border-t border-[var(--border)]">
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => { setCloseModal(false); setCloseTarget(null) }} disabled={saving}>Cancelar</Button>
                <Button onClick={handleClose} loading={saving} variant="danger">Cerrar caja</Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Modal detalle ── */}
      <Modal open={detailModal} onClose={() => { setDetailModal(false); setSelectedRegister(null) }}
        title="Detalle de cierre" size="sm">
        {selectedRegister && (
          <div className="space-y-4 pb-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[var(--surface2)] rounded-[var(--radius-md)] p-3">
                <p className="text-xs text-[var(--text3)] mb-0.5">Apertura</p>
                <p className="text-sm font-medium text-[var(--text)]">{formatDateTime(selectedRegister.opened_at)}</p>
              </div>
              <div className="bg-[var(--surface2)] rounded-[var(--radius-md)] p-3">
                <p className="text-xs text-[var(--text3)] mb-0.5">Cierre</p>
                <p className="text-sm font-medium text-[var(--text)]">
                  {selectedRegister.closed_at ? formatDateTime(selectedRegister.closed_at) : '—'}
                </p>
              </div>
            </div>

            {(selectedRegister.branches as { name: string } | undefined)?.name && (
              <div className="px-3 py-2 bg-[var(--surface2)] rounded-[var(--radius-md)]">
                <p className="text-sm font-medium text-[var(--text)]">
                  {(selectedRegister.branches as { name: string }).name}
                </p>
                <p className="text-xs text-[var(--text3)]">
                  {(selectedRegister.registers as { name: string } | undefined)?.name ?? ''}
                </p>
              </div>
            )}

            <div className="bg-[var(--surface2)] rounded-[var(--radius-lg)] overflow-hidden">
              <div className="px-3 py-2 border-b border-[var(--border)]">
                <p className="text-xs font-medium text-[var(--text3)]">Desglose</p>
              </div>
              <div className="divide-y divide-[var(--border)]">
                <div className="flex justify-between px-3 py-2 text-sm">
                  <span className="text-[var(--text3)]">Fondo inicial</span>
                  <span className="mono text-[var(--text2)]">{formatCurrency(selectedRegister.opening_amount)}</span>
                </div>
                {[
                  { label: 'Efectivo', value: selectedRegister.system_efectivo },
                  { label: 'Débito', value: selectedRegister.system_debito },
                  { label: 'Crédito', value: selectedRegister.system_credito },
                  { label: 'Transferencia', value: selectedRegister.system_transferencia },
                  { label: 'QR', value: selectedRegister.system_qr },
                ].map(row => (
                  <div key={row.label} className="flex justify-between px-3 py-2 text-sm">
                    <span className="text-[var(--text2)]">{row.label}</span>
                    <span className="mono text-[var(--text)]">{formatCurrency(row.value)}</span>
                  </div>
                ))}
                {!!selectedRegister.system_cuenta_corriente && (
                  <div className="flex justify-between px-3 py-2 text-sm">
                    <span className="text-[var(--text2)]">Cuenta Corriente</span>
                    <span className="mono text-[var(--text)]">{formatCurrency(selectedRegister.system_cuenta_corriente)}</span>
                  </div>
                )}
                <div className="flex justify-between px-3 py-2 text-sm font-bold border-t-2 border-[var(--border)]">
                  <span>Total vendido (todos los medios)</span>
                  <span className="mono text-[var(--text)]">{formatCurrency(selectedRegister.system_total)}</span>
                </div>
                {!!selectedRegister.system_cc_collected && (
                  <div className="flex justify-between px-3 py-2 text-sm">
                    <span className="text-[var(--text3)]">Cobros de cuenta corriente</span>
                    <span className="mono text-[var(--accent)]">+{formatCurrency(selectedRegister.system_cc_collected)}</span>
                  </div>
                )}
                {!!selectedRegister.system_cash_in && (
                  <div className="flex justify-between px-3 py-2 text-sm">
                    <span className="text-[var(--text3)]">Ingresos de caja</span>
                    <span className="mono text-[var(--accent)]">+{formatCurrency(selectedRegister.system_cash_in)}</span>
                  </div>
                )}
                {!!selectedRegister.system_cash_out && (
                  <div className="flex justify-between px-3 py-2 text-sm">
                    <span className="text-[var(--text3)]">Egresos de caja</span>
                    <span className="mono text-[var(--danger)]">−{formatCurrency(selectedRegister.system_cash_out)}</span>
                  </div>
                )}
                <div className="flex justify-between px-3 py-2 text-sm border-t-2 border-[var(--border)]">
                  <span className="text-[var(--text2)]">Efectivo esperado en caja</span>
                  <span className="mono font-medium text-[var(--text)]">
                    {formatCurrency((selectedRegister.closing_amount ?? 0) - (selectedRegister.difference ?? 0))}
                  </span>
                </div>
                <div className="flex justify-between px-3 py-2 text-sm">
                  <span className="text-[var(--text3)]">Efectivo declarado</span>
                  <span className="mono font-semibold text-[var(--text)]">{formatCurrency(selectedRegister.closing_amount ?? 0)}</span>
                </div>
                <div className={`flex justify-between px-3 py-2.5 text-sm font-bold ${diffColor(selectedRegister.difference)}`}>
                  <span>Diferencia</span>
                  <div className={`flex items-center gap-1 mono ${diffColor(selectedRegister.difference)}`}>
                    {diffIcon(selectedRegister.difference)}
                    {selectedRegister.difference !== null && selectedRegister.difference !== undefined
                      ? Math.abs(selectedRegister.difference) < 1
                        ? 'OK — Sin diferencia'
                        : `${selectedRegister.difference > 0 ? '+' : ''}${formatCurrency(selectedRegister.difference)}`
                      : '—'
                    }
                  </div>
                </div>
              </div>
            </div>

            {selectedRegister.notes && (
              <p className="text-sm text-[var(--text2)] italic px-1">"{selectedRegister.notes}"</p>
            )}
          </div>
        )}
      </Modal>

      {/* ── Modal movimiento de caja ── */}
      <Modal open={movementModal} onClose={() => { setMovementModal(false); setMovementTarget(null) }}
        title={movementType === 'out' ? 'Retiro / Egreso de caja' : 'Ingreso de caja'} size="sm">
        <div className="space-y-4 pb-4">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setMovementType('out')}
              className={`flex items-center justify-center gap-1.5 py-2.5 rounded-[var(--radius-md)] text-sm font-medium border transition-colors ${movementType === 'out' ? 'bg-[var(--danger-subtle)] border-[var(--danger)] text-[var(--danger)]' : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text3)]'}`}>
              <TrendingDown size={15} /> Egreso
            </button>
            <button type="button" onClick={() => setMovementType('in')}
              className={`flex items-center justify-center gap-1.5 py-2.5 rounded-[var(--radius-md)] text-sm font-medium border transition-colors ${movementType === 'in' ? 'bg-[var(--accent-subtle)] border-[var(--accent)] text-[var(--accent)]' : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text3)]'}`}>
              <TrendingUp size={15} /> Ingreso
            </button>
          </div>

          <Input label="Monto *" type="number" min="0" step="100"
            value={movementAmount} onChange={e => setMovementAmount(e.target.value)}
            placeholder="Ej: 5000" autoFocus />

          <Input label="Motivo *" value={movementReason}
            onChange={e => setMovementReason(e.target.value)}
            placeholder={movementType === 'out' ? 'Ej: Pago a proveedor Coca-Cola' : 'Ej: Aporte de fondo'} />

          {movementType === 'out' && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-[var(--text2)]">Categoría del gasto</label>
              <select value={movementCategory}
                onChange={e => setMovementCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]">
                {['proveedores', 'personal', 'alquiler', 'servicios', 'impuestos', 'marketing', 'otro'].map(c => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
              <p className="text-xs text-[var(--text3)] mt-0.5">
                El egreso resta del efectivo esperado y se registra como gasto en Finanzas.
              </p>
            </div>
          )}

          <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 mt-4 border-t border-[var(--border)]">
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { setMovementModal(false); setMovementTarget(null) }} disabled={saving}>Cancelar</Button>
              <Button onClick={handleMovement} loading={saving} variant={movementType === 'out' ? 'danger' : 'primary'}>
                Registrar {movementType === 'out' ? 'egreso' : 'ingreso'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </AppShell>
  )
}
