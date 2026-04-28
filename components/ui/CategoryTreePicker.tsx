'use client'
import { ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Category } from '@/types'

export function CategoryTreePicker({
  categoryMap,
  childrenMap,
  value,
  onChange,
  rootLabel = '— Sin categoría —',
  selectClass,
}: {
  categoryMap: Map<string, Category>
  childrenMap: Map<string | null, Category[]>
  value: string
  onChange: (id: string) => void
  rootLabel?: string
  selectClass: string
}) {
  const path: string[] = []
  if (value) {
    let cur: string | undefined = value
    while (cur) {
      path.unshift(cur)
      cur = categoryMap.get(cur)?.parent_id ?? undefined
    }
  }

  const children = childrenMap.get(value || null) ?? []

  return (
    <div className="flex flex-col gap-1.5">
      {path.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 py-0.5">
          {path.map((id, i) => {
            const cat = categoryMap.get(id)
            const isLast = i === path.length - 1
            return (
              <span key={id} className="flex items-center gap-1">
                {i > 0 && <ChevronRight size={11} className="text-[var(--text3)] flex-shrink-0" />}
                <button
                  type="button"
                  onClick={() => onChange(id)}
                  className={cn(
                    'text-xs px-2 py-0.5 rounded-full border transition-colors',
                    isLast
                      ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                      : 'bg-[var(--surface2)] border-[var(--border)] text-[var(--text2)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
                  )}
                >
                  {cat?.name}
                </button>
              </span>
            )
          })}
          <button
            type="button"
            onClick={() => {
              const parentId = categoryMap.get(value)?.parent_id ?? ''
              onChange(parentId)
            }}
            className="p-0.5 text-[var(--text3)] hover:text-[var(--danger,#ef4444)] transition-colors"
            title="Subir un nivel"
          >
            <X size={11} />
          </button>
        </div>
      )}

      {children.length > 0 || !value ? (
        <select
          value=""
          onChange={e => { if (e.target.value) onChange(e.target.value) }}
          className={selectClass}
        >
          <option value="">
            {value ? 'Subcategoría (opcional)...' : rootLabel}
          </option>
          {children.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      ) : (
        <p className="text-xs text-[var(--text3)] italic pl-1">Sin subcategorías</p>
      )}
    </div>
  )
}
