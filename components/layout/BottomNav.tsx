'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Package, Boxes, ShoppingCart, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Inicio',    icon: LayoutDashboard },
  { href: '/products',  label: 'Productos', icon: Package },
  { href: '/stock',     label: 'Stock',     icon: Boxes },
  { href: '/sales',     label: 'Ventas',    icon: ShoppingCart },
  { href: '/finances',  label: 'Finanzas',  icon: BarChart3 },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--surface)] border-t border-[var(--border)] px-1 pb-safe">
      <div className="flex items-center justify-around">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-2.5 min-w-0',
                active ? 'text-[var(--accent)]' : 'text-[var(--text3)]'
              )}
            >
              <Icon size={20} />
              <span className="text-[10px] font-medium truncate">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
