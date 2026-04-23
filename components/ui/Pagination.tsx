'use client'
import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Pagination as PaginationType } from '@/types'

const LIMIT_OPTIONS = [10, 20, 50, 100]

interface PaginationProps {
  pagination: PaginationType
  onPageChange: (page: number) => void
  onLimitChange?: (limit: number) => void
}

function getPageNumbers(page: number, pages: number): (number | '...')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
  const nums: (number | '...')[] = [1]
  if (page > 3) nums.push('...')
  for (let i = Math.max(2, page - 1); i <= Math.min(pages - 1, page + 1); i++) nums.push(i)
  if (page < pages - 2) nums.push('...')
  nums.push(pages)
  return nums
}

export function Pagination({ pagination, onPageChange, onLimitChange }: PaginationProps) {
  const { page, pages, total, limit } = pagination
  const [jumpInput, setJumpInput] = useState('')

  if (total === 0) return null

  const from = (page - 1) * limit + 1
  const to   = Math.min(page * limit, total)
  const pageNums = getPageNumbers(page, pages)

  function handleJump(e: React.FormEvent) {
    e.preventDefault()
    const n = parseInt(jumpInput, 10)
    if (!isNaN(n) && n >= 1 && n <= pages && n !== page) {
      onPageChange(n)
    }
    setJumpInput('')
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t border-[var(--border)]">
      <div className="flex items-center gap-3">
        <p className="text-xs text-[var(--text3)]">
          {from}–{to} de {total}
        </p>
        {onLimitChange && (
          <select
            value={limit}
            onChange={e => onLimitChange(Number(e.target.value))}
            className="text-xs px-2 py-1 rounded-[var(--radius-sm)] bg-[var(--surface2)] border border-[var(--border)] text-[var(--text2)] focus:outline-none focus:border-[var(--accent)]"
          >
            {LIMIT_OPTIONS.map(o => (
              <option key={o} value={o}>{o} por página</option>
            ))}
          </select>
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="p-2 rounded-[var(--radius-md)] text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface2)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
          {pageNums.map((n, i) =>
            n === '...' ? (
              <span key={`e${i}`} className="px-1 text-xs text-[var(--text3)] select-none">…</span>
            ) : (
              <button
                key={n}
                onClick={() => onPageChange(n as number)}
                className={`min-w-[28px] h-7 text-xs rounded-[var(--radius-sm)] transition-colors ${
                  n === page
                    ? 'bg-[var(--accent)] text-white font-semibold'
                    : 'text-[var(--text2)] hover:bg-[var(--surface2)]'
                }`}
              >
                {n}
              </button>
            )
          )}
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pages}
            className="p-2 rounded-[var(--radius-md)] text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface2)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight size={14} />
          </button>
          {pages > 7 && (
            <form onSubmit={handleJump} className="flex items-center gap-1 ml-1">
              <input
                type="number"
                min={1}
                max={pages}
                value={jumpInput}
                onChange={e => setJumpInput(e.target.value)}
                placeholder="Ir a..."
                className="w-16 text-xs px-2 py-1 rounded-[var(--radius-sm)] bg-[var(--surface2)] border border-[var(--border)] text-[var(--text2)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </form>
          )}
        </div>
      )}
    </div>
  )
}
