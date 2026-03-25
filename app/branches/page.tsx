'use client'
import { useEffect, useState, useCallback } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoader } from '@/components/ui/Spinner'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { Building2, Plus, Pencil, Trash2, Star, CreditCard, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'

interface Register {
  id: string
  name: string
  branch_id: string
  is_active: boolean
}

interface Warehouse {
  id: string
  name: string
}

interface Branch {
  id: string
  name: string
  address?: string
  phone?: string
  is_main: boolean
  is_active: boolean
  warehouse_id?: string
  warehouse?: Warehouse
  registers: Register[]
}

interface BranchStats {
  branch_id: string
  branch_name: string
  address?: string
  register_count: number
  sales_today: number
  revenue_today: number
  revenue_month: number
  open_registers: number
}

type Tab = 'branches' | 'stats'

export default function BranchesPage() {
  const [tab, setTab] = useState<Tab>('branches')
  const [branches, setBranches] = useState<Branch[]>([])
  const [stats, setStats] = useState<BranchStats[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading] = useState(true)

  // Modal sucursal
  const [branchModal, setBranchModal] = useState(false)
  const [editBranch, setEditBranch] = useState<Branch | null>(null)
  const [branchForm, setBranchForm] = useState({ name: '', address: '', phone: '', is_main: false, warehouse_id: '' })
  const [savingBranch, setSavingBranch] = useState(false)

  // Modal eliminar sucursal
  const [deleteBranchModal, setDeleteBranchModal] = useState(false)
  const [deleteBranch, setDeleteBranch] = useState<Branch | null>(null)
  const [deletingBranch, setDeletingBranch] = useState(false)

  // Modal caja
  const [registerModal, setRegisterModal] = useState(false)
  const [registerBranch, setRegisterBranch] = useState<Branch | null>(null)
  const [editRegister, setEditRegister] = useState<Register | null>(null)
  const [registerName, setRegisterName] = useState('')
  const [savingRegister, setSavingRegister] = useState(false)

  // Modal eliminar caja
  const [deleteRegisterModal, setDeleteRegisterModal] = useState(false)
  const [deleteRegister, setDeleteRegister] = useState<Register | null>(null)
  const [deletingRegister, setDeletingRegister] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [br, st, wh] = await Promise.all([
        api.get<Branch[]>('/api/branches'),
        api.get<BranchStats[]>('/api/branches/stats'),
        api.get<Warehouse[]>('/api/warehouses'),
      ])
      setBranches(br)
      setStats(st)
      setWarehouses(wh)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Sucursales ────────────────────────────────────────────
  const openCreateBranch = () => {
    setEditBranch(null)
    setBranchForm({ name: '', address: '', phone: '', is_main: false, warehouse_id: '' })
    setBranchModal(true)
  }

  const openEditBranch = (b: Branch) => {
    setEditBranch(b)
    setBranchForm({ name: b.name, address: b.address ?? '', phone: b.phone ?? '', is_main: b.is_main, warehouse_id: b.warehouse_id ?? '' })
    setBranchModal(true)
  }

  const handleSaveBranch = async () => {
    if (!branchForm.name.trim()) { toast.error('El nombre es obligatorio'); return }
    if (!branchForm.warehouse_id) { toast.error('Seleccioná un depósito'); return }
    setSavingBranch(true)
    try {
      const payload = {
        name: branchForm.name.trim(),
        address: branchForm.address.trim() || null,
        phone: branchForm.phone.trim() || null,
        is_main: branchForm.is_main,
        warehouse_id: branchForm.warehouse_id,
      }
      if (editBranch) {
        await api.patch(`/api/branches/${editBranch.id}`, payload)
        toast.success('Sucursal actualizada')
      } else {
        await api.post('/api/branches', payload)
        toast.success('Sucursal creada')
      }
      setBranchModal(false)
      fetchData()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally { setSavingBranch(false) }
  }

  const handleDeleteBranch = async () => {
    if (!deleteBranch) return
    setDeletingBranch(true)
    try {
      await api.delete(`/api/branches/${deleteBranch.id}`)
      toast.success('Sucursal eliminada')
      setDeleteBranchModal(false)
      fetchData()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    } finally { setDeletingBranch(false) }
  }

  // ── Cajas ────────────────────────────────────────────────
  const openCreateRegister = (branch: Branch) => {
    setRegisterBranch(branch)
    setEditRegister(null)
    setRegisterName('')
    setRegisterModal(true)
  }

  const openEditRegister = (branch: Branch, register: Register) => {
    setRegisterBranch(branch)
    setEditRegister(register)
    setRegisterName(register.name)
    setRegisterModal(true)
  }

  const handleSaveRegister = async () => {
    if (!registerName.trim()) { toast.error('El nombre es obligatorio'); return }
    if (!registerBranch) { toast.error('Seleccioná una sucursal'); return }
    setSavingRegister(true)
    try {
      if (editRegister) {
        await api.patch(`/api/branches/registers/${editRegister.id}`, { name: registerName.trim() })
        toast.success('Caja actualizada')
      } else {
        await api.post('/api/branches/registers', {
          name: registerName.trim(),
          branch_id: registerBranch.id,
        })
        toast.success('Caja creada')
      }
      setRegisterModal(false)
      fetchData()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally { setSavingRegister(false) }
  }

  const handleDeleteRegister = async () => {
    if (!deleteRegister) return
    setDeletingRegister(true)
    try {
      await api.delete(`/api/branches/registers/${deleteRegister.id}`)
      toast.success('Caja eliminada')
      setDeleteRegisterModal(false)
      fetchData()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    } finally { setDeletingRegister(false) }
  }

  return (
    <AppShell>
      <PageHeader
        title="Sucursales"
        description={`${branches.length} sucursales activas`}
        action={
          tab === 'branches' ? (
            <Button onClick={openCreateBranch}><Plus size={15} /> Nueva sucursal</Button>
          ) : undefined
        }
      />

      <div className="p-5 space-y-4">

        {/* Tabs */}
        <div className="flex border-b border-[var(--border)]">
          {([['branches', 'Sucursales y cajas'], ['stats', 'Resumen consolidado']] as [Tab, string][]).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === key
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--text3)] hover:text-[var(--text)]'
                }`}>
              {label}
            </button>
          ))}
        </div>

        {loading ? <PageLoader /> : (

          <>
            {/* ── Tab: Sucursales ── */}
            {tab === 'branches' && (
              branches.length === 0 ? (
                <EmptyState icon={Building2} title="Sin sucursales"
                  description="Creá tu primera sucursal para organizar tus cajas."
                  action={<Button onClick={openCreateBranch}><Plus size={15} /> Nueva sucursal</Button>}
                />
              ) : (
                <div className="space-y-4">
                  {branches.map(branch => (
                    <div key={branch.id}
                      className={`bg-[var(--surface)] border rounded-[var(--radius-lg)] overflow-hidden ${branch.is_main ? 'border-[var(--accent)]' : 'border-[var(--border)]'
                        }`}>

                      {/* Header sucursal */}
                      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
                        <div className="flex items-center gap-2">
                          <Building2 size={16} className="text-[var(--accent)]" />
                          <h3 className="text-sm font-semibold text-[var(--text)]">{branch.name}</h3>
                          {branch.is_main && (
                            <Star size={13} className="text-[var(--accent)] fill-[var(--accent)]" />
                          )}
                          {branch.address && (
                            <span className="text-xs text-[var(--text3)]">· {branch.address}</span>
                          )}
                          {branch.warehouse && (
                            <span className="text-xs text-[var(--text3)] bg-[var(--surface2)] px-1.5 py-0.5 rounded">
                              {branch.warehouse.name}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => openCreateRegister(branch)}
                            title="Agregar caja"
                            className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-colors">
                            <Plus size={14} />
                          </button>
                          <button onClick={() => openEditBranch(branch)}
                            className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors">
                            <Pencil size={13} />
                          </button>
                          {!branch.is_main && (
                            <button onClick={() => { setDeleteBranch(branch); setDeleteBranchModal(true) }}
                              className="p-1.5 rounded text-[var(--text3)] hover:text-[var(--danger)] hover:bg-[var(--danger-subtle)] transition-colors">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Cajas */}
                      {branch.registers.length === 0 ? (
                        <div className="px-4 py-3 text-xs text-[var(--text3)]">
                          Sin cajas — <button onClick={() => openCreateRegister(branch)}
                            className="text-[var(--accent)] hover:underline">
                            Agregar caja
                          </button>
                        </div>
                      ) : (
                        <div className="divide-y divide-[var(--border)]">
                          {branch.registers.map(reg => (
                            <div key={reg.id}
                              className="flex items-center justify-between px-4 py-2.5 hover:bg-[var(--surface2)] transition-colors group">
                              <div className="flex items-center gap-2">
                                <CreditCard size={13} className="text-[var(--text3)]" />
                                <span className="text-sm text-[var(--text)]">{reg.name}</span>
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => openEditRegister(branch, reg)}
                                  className="p-1 rounded text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors">
                                  <Pencil size={12} />
                                </button>
                                <button onClick={() => { setDeleteRegister(reg); setDeleteRegisterModal(true) }}
                                  className="p-1 rounded text-[var(--text3)] hover:text-[var(--danger)] hover:bg-[var(--danger-subtle)] transition-colors">
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            )}

            {/* ── Tab: Resumen consolidado ── */}
            {tab === 'stats' && (
              stats.length === 0 ? (
                <EmptyState icon={TrendingUp} title="Sin datos"
                  description="Las estadísticas aparecerán cuando haya ventas registradas." />
              ) : (
                <div className="space-y-3">
                  {/* Total consolidado */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 sm:col-span-1">
                      <p className="text-xs text-[var(--text3)] mb-1">Total hoy (todas las sucursales)</p>
                      <p className="text-2xl font-bold mono text-[var(--accent)]">
                        {formatCurrency(stats.reduce((a, s) => a + Number(s.revenue_today), 0))}
                      </p>
                    </div>
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4">
                      <p className="text-xs text-[var(--text3)] mb-1">Total del mes</p>
                      <p className="text-2xl font-bold mono text-[var(--text)]">
                        {formatCurrency(stats.reduce((a, s) => a + Number(s.revenue_month), 0))}
                      </p>
                    </div>
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4">
                      <p className="text-xs text-[var(--text3)] mb-1">Cajas abiertas ahora</p>
                      <p className="text-2xl font-bold mono text-[var(--text)]">
                        {stats.reduce((a, s) => a + Number(s.open_registers), 0)}
                      </p>
                    </div>
                  </div>

                  {/* Por sucursal */}
                  <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border)]">
                          <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text3)]">Sucursal</th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)]">Ventas hoy</th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text3)] hidden sm:table-cell">Mes</th>
                          <th className="text-center px-4 py-3 text-xs font-medium text-[var(--text3)]">Cajas</th>
                          <th className="text-center px-4 py-3 text-xs font-medium text-[var(--text3)]">Abiertas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {stats.map(s => (
                          <tr key={s.branch_id} className="hover:bg-[var(--surface2)] transition-colors">
                            <td className="px-4 py-3">
                              <p className="font-medium text-[var(--text)]">{s.branch_name}</p>
                              {s.address && <p className="text-xs text-[var(--text3)]">{s.address}</p>}
                            </td>
                            <td className="px-4 py-3 text-right mono font-semibold text-[var(--accent)]">
                              {formatCurrency(s.revenue_today)}
                            </td>
                            <td className="px-4 py-3 text-right mono text-[var(--text2)] hidden sm:table-cell">
                              {formatCurrency(s.revenue_month)}
                            </td>
                            <td className="px-4 py-3 text-center text-[var(--text2)]">
                              {s.register_count}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {Number(s.open_registers) > 0 ? (
                                <Badge variant="success">{s.open_registers} abiertas</Badge>
                              ) : (
                                <Badge variant="default">Cerradas</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            )}
          </>
        )}
      </div>

      {/* Modal crear/editar sucursal */}
      <Modal open={branchModal} onClose={() => setBranchModal(false)}
        title={editBranch ? 'Editar sucursal' : 'Nueva sucursal'} size="sm">
        <div className="space-y-4">
          <Input label="Nombre *" value={branchForm.name}
            onChange={e => setBranchForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Ej: Sucursal Centro, Local Norte..." />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[var(--text2)]">Depósito *</label>
            <select
              value={branchForm.warehouse_id}
              onChange={e => setBranchForm(f => ({ ...f, warehouse_id: e.target.value }))}
              className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-colors"
            >
              <option value="">Seleccionar depósito...</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
            <p className="text-xs text-[var(--text3)]">Las ventas de esta sucursal descontarán stock de este depósito.</p>
          </div>
          <Input label="Dirección" value={branchForm.address}
            onChange={e => setBranchForm(f => ({ ...f, address: e.target.value }))}
            placeholder="Av. Corrientes 1234, CABA" />
          <Input label="Teléfono" value={branchForm.phone}
            onChange={e => setBranchForm(f => ({ ...f, phone: e.target.value }))}
            placeholder="11-1234-5678" />
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={branchForm.is_main}
              onChange={e => setBranchForm(f => ({ ...f, is_main: e.target.checked }))}
              className="w-4 h-4 accent-[var(--accent)]" />
            <span className="text-sm text-[var(--text2)]">Sucursal principal</span>
          </label>
          <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 mt-4 border-t border-[var(--border)]">
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setBranchModal(false)} disabled={savingBranch}>Cancelar</Button>
              <Button onClick={handleSaveBranch} loading={savingBranch}>
                {editBranch ? 'Guardar' : 'Crear'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal crear/editar caja */}
      <Modal open={registerModal} onClose={() => setRegisterModal(false)}
        title={editRegister ? 'Editar caja' : `Nueva caja — ${registerBranch?.name}`} size="sm">
        <div className="space-y-4">
          <Input label="Nombre de la caja *" value={registerName}
            onChange={e => setRegisterName(e.target.value)}
            placeholder="Ej: Caja 1, Caja Rápida, Caja Express..." autoFocus />
          <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 mt-4 border-t border-[var(--border)]">
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setRegisterModal(false)} disabled={savingRegister}>Cancelar</Button>
              <Button onClick={handleSaveRegister} loading={savingRegister}>
                {editRegister ? 'Guardar' : 'Crear caja'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Confirm eliminar sucursal */}
      <ConfirmDialog
        open={deleteBranchModal}
        onClose={() => { setDeleteBranchModal(false); setDeleteBranch(null) }}
        onConfirm={handleDeleteBranch}
        title="Eliminar sucursal"
        message={`¿Eliminás "${deleteBranch?.name}"? Las cajas asociadas también se desactivarán.`}
        confirmLabel="Eliminar"
        loading={deletingBranch}
        danger
      />

      {/* Confirm eliminar caja */}
      <ConfirmDialog
        open={deleteRegisterModal}
        onClose={() => { setDeleteRegisterModal(false); setDeleteRegister(null) }}
        onConfirm={handleDeleteRegister}
        title="Eliminar caja"
        message={`¿Eliminás "${deleteRegister?.name}"?`}
        confirmLabel="Eliminar"
        loading={deletingRegister}
        danger
      />
    </AppShell>
  )
}
