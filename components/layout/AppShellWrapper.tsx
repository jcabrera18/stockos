'use client'
import { usePathname } from 'next/navigation'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'

// Rutas que manejan su propio layout full-screen (no necesitan shell)
const NO_SHELL = ['/login', '/pos']

export function AppShellWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const hasShell = !NO_SHELL.some(r => pathname === r || pathname.startsWith(r + '/'))

  if (!hasShell) return <>{children}</>

  return (
    <div className="flex h-screen bg-[var(--bg)] overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
