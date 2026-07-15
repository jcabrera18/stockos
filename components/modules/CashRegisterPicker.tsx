'use client'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface RegisterWithBranch {
  id: string
  name: string
  is_open?: boolean
  branches?: { id: string; name: string } | null
}

interface Props {
  registers: RegisterWithBranch[]
  branchId: string | null
  registerId: string | null
  onBranchChange: (branchId: string | null) => void
  onRegisterChange: (registerId: string | null) => void
  className?: string
}

const selectCls = cn(
  'w-full px-3 py-2 pr-9 text-sm rounded-md appearance-none',
  'bg-[var(--surface)] border border-[var(--border)] text-[var(--text)]',
  'focus:outline-none focus:border-[var(--accent)] transition-colors cursor-pointer',
)

/**
 * Selector de sucursal + caja para registrar un cobro en efectivo en el arqueo.
 * La caja es opcional: "No registrar en caja" deja el cobro fuera del arqueo.
 * Las cajas cerradas se muestran deshabilitadas (no pueden recibir efectivo).
 */
export function CashRegisterPicker({
  registers, branchId, registerId, onBranchChange, onRegisterChange, className,
}: Props) {
  // Sucursales únicas derivadas de las cajas activas del negocio.
  const branches = Array.from(
    new Map(registers.filter(r => r.branches).map(r => [r.branches!.id, r.branches!])).values()
  ).sort((a, b) => a.name.localeCompare(b.name))

  const cajas = registers.filter(r => r.branches?.id === branchId)

  return (
    <div className={cn('grid grid-cols-1 sm:grid-cols-2 gap-3', className)}>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-[var(--text2)]">Sucursal</label>
        <div className="relative">
          <select
            value={branchId ?? ''}
            onChange={e => onBranchChange(e.target.value || null)}
            className={selectCls}
          >
            {branches.length === 0 && <option value="">—</option>}
            {branches.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <ChevronDown size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-[var(--text2)]">Caja</label>
        <div className="relative">
          <select
            value={registerId ?? ''}
            onChange={e => onRegisterChange(e.target.value || null)}
            className={selectCls}
          >
            <option value="">No registrar en caja</option>
            {cajas.map(r => (
              <option key={r.id} value={r.id} disabled={!r.is_open}>
                {r.name}{r.is_open ? '' : ' — cerrada'}
              </option>
            ))}
          </select>
          <ChevronDown size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
        </div>
      </div>
    </div>
  )
}
