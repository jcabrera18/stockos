'use client'
import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { api } from '@/lib/api'
import { formatCurrency, formatIntCurrency, normalizeText } from '@/lib/utils'
import { BUCKET_STYLE, BUCKET_ORDER, formatDebtAge, type TopDebtor, type AgingBucketKey } from '@/lib/cc-aging'
import { Search, ArrowUp, ArrowDown } from 'lucide-react'

type SortField = 'full_name' | 'balance' | 'days'
type SortDir = 'asc' | 'desc'

// Resumen por bucket para los chips de arriba (agrupado por antigüedad + monto).
interface BucketChip { bucket: AgingBucketKey; count: number; total: number }

export function AllDebtorsModal({
  open, onClose, onSelectDebtor,
}: {
  open: boolean
  onClose: () => void
  onSelectDebtor?: (id: string) => void
}) {
  const [debtors, setDebtors] = useState<TopDebtor[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ field: SortField; dir: SortDir }>({ field: 'balance', dir: 'desc' })

  // Carga lazy: solo al abrir el modal (el endpoint hace un window-scan pesado).
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(false)
    api.get<{ debtors: TopDebtor[] }>('/api/customers/cc-debtors')
      .then(res => { if (!cancelled) setDebtors(res.debtors) })
      .catch(err => { if (!cancelled) { console.error(err); setError(true) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open])

  // Reset al cerrar para que la próxima apertura recargue (saldos frescos).
  useEffect(() => {
    if (!open) { setDebtors(null); setSearch(''); setSort({ field: 'balance', dir: 'desc' }) }
  }, [open])

  const chips: BucketChip[] = useMemo(() => {
    if (!debtors) return []
    const map = new Map<AgingBucketKey, BucketChip>()
    for (const b of BUCKET_ORDER) map.set(b, { bucket: b, count: 0, total: 0 })
    for (const d of debtors) {
      const c = map.get(d.bucket)!
      c.count += 1
      c.total += Number(d.balance)
    }
    return BUCKET_ORDER.map(b => map.get(b)!).filter(c => c.count > 0)
  }, [debtors])

  const visible = useMemo(() => {
    if (!debtors) return []
    const q = normalizeText(search.trim())
    const filtered = q ? debtors.filter(d => normalizeText(d.full_name).includes(q)) : debtors
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      if (sort.field === 'full_name') return a.full_name.localeCompare(b.full_name) * dir
      const av = sort.field === 'balance' ? Number(a.balance) : a.days
      const bv = sort.field === 'balance' ? Number(b.balance) : b.days
      return (av - bv) * dir
    })
  }, [debtors, search, sort])

  const totalVisible = useMemo(() => visible.reduce((a, d) => a + Number(d.balance), 0), [visible])

  const toggleSort = (field: SortField) => {
    setSort(prev => prev.field === field
      ? { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      // Al cambiar de columna, un default sensato: nombre asc, números desc.
      : { field, dir: field === 'full_name' ? 'asc' : 'desc' })
  }

  return (
    <Modal open={open} onClose={onClose} title="Todos los deudores" size="xl" dismissable>
      <div className="space-y-4">
        {/* Chips resumen por antigüedad */}
        {chips.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {chips.map(c => {
              const s = BUCKET_STYLE[c.bucket]
              return (
                <div key={c.bucket} className="rounded-[var(--radius)] px-3 py-2 border border-[var(--border)]"
                  style={{ background: s.bg }}>
                  <p className="text-xs font-medium" style={{ color: s.text }}>{s.label}</p>
                  <p className="text-sm font-bold text-[var(--text)] mono mt-0.5">{formatIntCurrency(c.total)}</p>
                  <p className="text-xs text-[var(--text3)]">{c.count} {c.count === 1 ? 'cliente' : 'clientes'}</p>
                </div>
              )
            })}
          </div>
        )}

        {/* Buscador */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar cliente..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-[var(--radius)] bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>

        {/* Tabla ordenable */}
        {loading ? (
          <div className="py-10 text-center text-sm text-[var(--text3)]">Cargando deudores…</div>
        ) : error ? (
          <div className="py-10 text-center text-sm text-[var(--danger)]">No se pudo cargar el listado.</div>
        ) : visible.length === 0 ? (
          <div className="py-10 text-center text-sm text-[var(--text3)]">
            {search ? 'Ningún cliente coincide con la búsqueda.' : 'No hay clientes con deuda.'}
          </div>
        ) : (
          <div className="border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
            <div className="max-h-[52vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[var(--surface)] z-10">
                  <tr className="border-b border-[var(--border)]">
                    <SortHeader label="Cliente" field="full_name" sort={sort} onSort={toggleSort} align="left" />
                    <SortHeader label="Saldo" field="balance" sort={sort} onSort={toggleSort} align="right" />
                    <SortHeader label="Antigüedad" field="days" sort={sort} onSort={toggleSort} align="right" className="hidden sm:table-cell" />
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-[var(--text3)]">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {visible.map(d => {
                    const s = BUCKET_STYLE[d.bucket]
                    return (
                      <tr key={d.id}
                        onClick={onSelectDebtor ? () => { onSelectDebtor(d.id); onClose() } : undefined}
                        className={`transition-colors ${onSelectDebtor ? 'cursor-pointer hover:bg-[var(--surface2)]' : ''}`}>
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-[var(--text)] truncate max-w-[16rem]">{d.full_name}</p>
                        </td>
                        <td className="px-4 py-2.5 text-right mono font-bold text-[var(--danger)] whitespace-nowrap">
                          {formatCurrency(d.balance)}
                        </td>
                        <td className="px-4 py-2.5 text-right mono text-[var(--text2)] hidden sm:table-cell whitespace-nowrap">
                          {formatDebtAge(d.days)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
                            style={{ color: s.text, background: s.bg }}>
                            {s.status}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="sticky bottom-0 bg-[var(--surface)]">
                  <tr className="border-t border-[var(--border)]">
                    <td className="px-4 py-2.5 text-xs font-medium text-[var(--text3)]">
                      {visible.length} {visible.length === 1 ? 'cliente' : 'clientes'}
                    </td>
                    <td className="px-4 py-2.5 text-right mono font-bold text-[var(--text)] whitespace-nowrap">
                      {formatCurrency(totalVisible)}
                    </td>
                    <td className="hidden sm:table-cell" />
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

function SortHeader({
  label, field, sort, onSort, align, className = '',
}: {
  label: string
  field: SortField
  sort: { field: SortField; dir: SortDir }
  onSort: (f: SortField) => void
  align: 'left' | 'right'
  className?: string
}) {
  const active = sort.field === field
  return (
    <th className={`px-4 py-2.5 text-xs font-medium text-[var(--text3)] ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}>
      <button
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 hover:text-[var(--text)] transition-colors ${active ? 'text-[var(--text)]' : ''} ${align === 'right' ? 'flex-row-reverse' : ''}`}
      >
        {label}
        {active && (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  )
}
