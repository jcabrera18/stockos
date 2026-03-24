'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Package, Boxes, ShoppingCart,
  Truck, BarChart3, Settings, Sun, Moon, LogOut, Zap, Layers, Tag, Users, PercentCircle, Warehouse, ClipboardList, CreditCard, Building2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/hooks/useTheme'
import { useAuth } from '@/hooks/useAuth'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { useWorkstation } from '@/hooks/useWorkstation'

export function Sidebar() {
  const pathname = usePathname()
  const { theme, toggle } = useTheme()
  const { signOut, user } = useAuth()
  const role = (user?.role as string) ?? 'cashier'
  const [cajaAbierta, setCajaAbierta] = useState(false)
  const { workstation } = useWorkstation()

  const ALL_NAV_ITEMS = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['owner', 'admin'] },
    { href: '/pos', label: 'POS', icon: Zap, roles: ['owner', 'admin', 'cashier'] },
    { href: '/sales', label: 'Ventas', icon: ShoppingCart, roles: ['owner', 'admin', 'cashier'] },
    { href: '/orders', label: 'Pedidos', icon: ClipboardList, roles: ['owner', 'admin', 'cashier', 'stocker', 'seller'] },
    { href: '/stock', label: 'Inventario', icon: Boxes, roles: ['owner', 'admin', 'stocker'] },
    { href: '/products', label: 'Productos', icon: Package, roles: ['owner', 'admin'] },
    { href: '/purchases', label: 'Compras', icon: Truck, roles: ['owner', 'admin', 'stocker'] },
    { href: '/customers', label: 'Cuentas ctes.', icon: Users, roles: ['owner', 'admin', 'cashier'] },
    { href: '/finances', label: 'Finanzas', icon: BarChart3, roles: ['owner', 'admin'] },
    { href: '/cash-register', label: 'Caja', icon: CreditCard, roles: ['owner', 'admin', 'cashier'] },
    { href: '/warehouses', label: 'Depósitos', icon: Warehouse, roles: ['owner', 'admin', 'stocker'] },
    { href: '/branches', label: 'Sucursales', icon: Building2, roles: ['owner', 'admin'] },
    { href: '/price-lists', label: 'Precios', icon: Tag, roles: ['owner', 'admin'] },
    { href: '/categories', label: 'Categorías', icon: Layers, roles: ['owner', 'admin'] },]

  const NAV_ITEMS = ALL_NAV_ITEMS.filter(item => item.roles.includes(role))

  useEffect(() => {
    api.get('/api/cash-register/current')
      .then((data: unknown) => setCajaAbierta(data !== null))
      .catch(() => { })
  }, [])

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
            <Link key={href} href={href}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius-md)] text-sm transition-colors',
                active ? 'bg-[var(--accent-subtle)] text-[var(--accent)] font-medium' : 'text-[var(--text2)] hover:bg-[var(--surface2)] hover:text-[var(--text)]'
              )}>
              <Icon size={16} />
              <span className="flex-1">{label}</span>
              {href === '/cash-register' && (
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cajaAbierta
                  ? 'bg-[var(--accent)] animate-pulse'
                  : 'bg-[var(--danger)]'
                  }`} />
              )}
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
        {workstation && (
          <div className="px-3 py-2 border-t border-[var(--border)]">
            <p className="text-xs text-[var(--text3)] truncate">{workstation.branch_name}</p>
            <p className="text-xs font-medium text-[var(--text)] truncate">{workstation.register_name}</p>
          </div>
        )}
      </div>
    </aside>
  )
}
