'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Package, Boxes, ShoppingCart,
  Truck, BarChart3, Settings, Sun, Moon, LogOut, Zap, Tag, Users, PercentCircle, Warehouse, ClipboardList
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/hooks/useTheme'
import { useAuth } from '@/hooks/useAuth'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/products', label: 'Productos', icon: Package },
  { href: '/stock', label: 'Stock', icon: Boxes },
  { href: '/sales', label: 'Ventas', icon: ShoppingCart },
  { href: '/categories', label: 'Categorías', icon: Tag },
  { href: '/purchases', label: 'Compras', icon: Truck },
  { href: '/finances', label: 'Finanzas', icon: BarChart3 },
  { href: '/customers', label: 'Cuentas', icon: Users },
  { href: '/price-lists', label: 'Precios',    icon: PercentCircle },
  { href: '/warehouses', label: 'Depósitos', icon: Warehouse },
  { href: '/orders', label: 'Pedidos', icon: ClipboardList },
  { href: '/settings', label: 'Config', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const { theme, toggle } = useTheme()
  const { signOut } = useAuth()

  return (
    <aside className="hidden md:flex flex-col w-56 h-screen bg-[var(--surface)] border-r border-[var(--border)] sticky top-0 flex-shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-5 border-b border-[var(--border)]">
        <div className="w-7 h-7 rounded-lg bg-[var(--accent)] flex items-center justify-center">
          <Zap size={14} className="text-white" />
        </div>
        <span className="text-sm font-bold text-[var(--text)] tracking-tight">StockOS</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius-md)] text-sm transition-colors',
                active
                  ? 'bg-[var(--accent-subtle)] text-[var(--accent)] font-medium'
                  : 'text-[var(--text2)] hover:bg-[var(--surface2)] hover:text-[var(--text)]'
              )}
            >
              <Icon size={16} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-2 py-3 border-t border-[var(--border)] space-y-0.5">
        <button
          onClick={toggle}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius-md)] text-sm text-[var(--text2)] hover:bg-[var(--surface2)] hover:text-[var(--text)] transition-colors"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
        </button>
        <button
          onClick={signOut}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius-md)] text-sm text-[var(--text2)] hover:bg-[var(--danger-subtle)] hover:text-[var(--danger)] transition-colors"
        >
          <LogOut size={16} />
          Salir
        </button>
      </div>
    </aside>
  )
}
