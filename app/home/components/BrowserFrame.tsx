import type { ReactNode } from 'react'

export function BrowserFrame({
  url,
  className = '',
  children,
}: {
  url: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`rounded-2xl border border-gray-200 bg-white overflow-hidden ${className}`}>
      {/* Top bar */}
      <div className="flex items-center gap-2 px-4 h-9 bg-gray-50 border-b border-gray-100">
        <span className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-amber-400/70" />
        <span className="w-2.5 h-2.5 rounded-full bg-green-400/70" />
        <div className="ml-3 flex-1 max-w-[220px] h-5 rounded-md bg-white border border-gray-200 flex items-center px-2">
          <span className="text-[10px] text-gray-400 truncate">{url}</span>
        </div>
      </div>
      {children}
    </div>
  )
}
