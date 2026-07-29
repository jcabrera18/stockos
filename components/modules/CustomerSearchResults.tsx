'use client'
import { Plus } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'

/** Campos mínimos que el dropdown necesita de un cliente. */
export interface CustomerSearchItem {
  id: string
  full_name: string
  razon_social?: string | null
  nombre_fantasia?: string | null
  document?: string | null
  phone?: string | null
  current_balance: number
  credit_limit?: number | null
}

/** Nombre comercial: razón social o, en su defecto, nombre de fantasía. */
export function customerCompanyName(
  c: { razon_social?: string | null; nombre_fantasia?: string | null },
): string | null {
  return c.razon_social || c.nombre_fantasia || null
}

/** Línea secundaria de identificación (documento · teléfono). */
export function customerDocLine(
  c: { document?: string | null; phone?: string | null },
): string | null {
  const parts = [
    c.document ? `DNI ${c.document}` : null,
    c.phone ? `Tel ${c.phone}` : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

interface Props<T extends CustomerSearchItem> {
  results: T[]
  /** Índice resaltado (navegación con teclado). La fila "Crear" es results.length. */
  highlight?: number
  onHover?: (index: number) => void
  onSelect: (c: T) => void
  /** Si se pasa, se muestra la fila "Crear cliente …". */
  onCreate?: () => void
  createQuery?: string
  /** Muestra el saldo a la derecha cuando es > 0. Default true. */
  showBalance?: boolean
  size?: 'sm' | 'md'
}

/**
 * Lista de resultados de búsqueda de clientes, compartida por POS, pedidos y
 * presupuestos. Antes cada página renderizaba estas filas inline y se
 * desincronizaron (unas mostraban razón social / fantasía y otras no).
 */
export function CustomerSearchResults<T extends CustomerSearchItem>({
  results,
  highlight,
  onHover,
  onSelect,
  onCreate,
  createQuery,
  showBalance = true,
  size = 'sm',
}: Props<T>) {
  const rowPad = size === 'md' ? 'px-3 py-2.5' : 'px-3 py-2'
  const nameSize = size === 'md' ? 'text-sm' : 'text-xs'

  return (
    <>
      {results.map((c, idx) => {
        const active = highlight === idx
        const company = customerCompanyName(c)
        const docLine = customerDocLine(c)
        return (
          <button
            key={c.id}
            onMouseEnter={() => onHover?.(idx)}
            onClick={() => onSelect(c)}
            className={cn(
              'w-full flex items-center justify-between gap-2 text-left border-b border-[var(--border)] last:border-0 transition-colors',
              rowPad,
              active ? 'bg-[var(--accent-subtle)]' : 'hover:bg-[var(--surface2)]',
            )}
          >
            <div className="min-w-0">
              <p className={cn(nameSize, 'font-medium truncate', active ? 'text-[var(--accent)]' : 'text-[var(--text)]')}>
                {c.full_name}
              </p>
              {company && <p className="text-xs text-[var(--text2)] truncate">{company}</p>}
              {docLine && <p className="text-xs text-[var(--text3)] truncate">{docLine}</p>}
            </div>
            {showBalance && Number(c.current_balance) > 0 && (
              <span className="text-xs mono text-[var(--danger)] flex-shrink-0">{formatCurrency(c.current_balance)}</span>
            )}
          </button>
        )
      })}

      {onCreate && (
        <button
          onMouseEnter={() => onHover?.(results.length)}
          onClick={onCreate}
          className={cn(
            'w-full flex items-center gap-2 text-left transition-colors',
            rowPad,
            results.length > 0 ? 'border-t border-[var(--border)]' : '',
            highlight === results.length ? 'bg-[var(--accent-subtle)]' : 'hover:bg-[var(--accent-subtle)]',
          )}
        >
          <Plus size={13} className="text-[var(--accent)]" />
          <span className={cn(nameSize, 'text-[var(--accent)] font-medium')}>
            Crear {results.length > 0 && createQuery ? `"${createQuery}"` : `cliente${createQuery ? ` "${createQuery}"` : ''}`}
          </span>
        </button>
      )}
    </>
  )
}
