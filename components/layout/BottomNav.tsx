'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Package, Boxes, ShoppingCart, BarChart3, Menu, X, Settings, LogOut, Sun, Moon, Tag, Users, PercentCircle, Warehouse, ClipboardList } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { useTheme } from '@/hooks/useTheme'
import { useAuth } from '@/hooks/useAuth'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Inicio',    icon: LayoutDashboard },
  { href: '/products',  label: 'Productos', icon: Package },
  { href: '/stock',     label: 'Stock',     icon: Boxes },
  { href: '/sales',     label: 'Ventas',    icon: ShoppingCart },
  { href: '/finances',  label: 'Finanzas',  icon: BarChart3 },
]

const EXTRA_ITEMS = [
  { href: '/purchases',   label: 'Compras',         icon: ShoppingCart },
  { href: '/customers',   label: 'Cuentas ctes.',   icon: Users },
  { href: '/categories',  label: 'Categorías',      icon: Tag },
  { href: '/price-lists', label: 'Listas de precio', icon: PercentCircle },
  { href: '/warehouses', label: 'Depósitos', icon: Warehouse },
  { href: '/orders', label: 'Pedidos', icon: ClipboardList },
  { href: '/settings',    label: 'Configuración',   icon: Settings },
]

export function BottomNav() {
  const pathname          = usePathname()
  const { theme, toggle } = useTheme()
  const { signOut }       = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <>
      {/* Bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--surface)] border-t border-[var(--border)] px-1 pb-safe">
        <div className="flex items-center justify-around">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link key={href} href={href}
                className={cn(
                  'flex flex-col items-center gap-0.5 px-3 py-2.5 min-w-0',
                  active ? 'text-[var(--accent)]' : 'text-[var(--text3)]'
                )}>
                <Icon size={20} />
                <span className="text-[10px] font-medium truncate">{label}</span>
              </Link>
            )
          })}

          {/* Botón menú */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex flex-col items-center gap-0.5 px-3 py-2.5 min-w-0 text-[var(--text3)]"
          >
            <Menu size={20} />
            <span className="text-[10px] font-medium">Más</span>
          </button>
        </div>
      </nav>

      {/* Drawer overlay */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 z-50"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setDrawerOpen(false)}
        >
          {/* Drawer panel */}
          <div
            className="absolute bottom-0 left-0 right-0 bg-[var(--surface)] rounded-t-2xl border-t border-[var(--border)] pb-safe"
            onClick={e => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-[var(--border)] rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
              <span className="text-sm font-semibold text-[var(--text)]">Menú</span>
              <button onClick={() => setDrawerOpen(false)}
                className="p-1.5 rounded-full hover:bg-[var(--surface2)] text-[var(--text3)]">
                <X size={16} />
              </button>
            </div>

            {/* Links extra */}
            <div className="px-3 py-2 space-y-0.5">
              {EXTRA_ITEMS.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(href + '/')
                return (
                  <Link key={href} href={href}
                    onClick={() => setDrawerOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-3 rounded-xl transition-colors',
                      active
                        ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
                        : 'text-[var(--text2)] hover:bg-[var(--surface2)]'
                    )}>
                    <Icon size={18} />
                    <span className="text-sm font-medium">{label}</span>
                  </Link>
                )
              })}
            </div>

            {/* Divider */}
            <div className="mx-5 border-t border-[var(--border)] my-1" />

            {/* Tema + Salir */}
            <div className="px-3 py-2 space-y-0.5 pb-4">
              <button onClick={toggle}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors">
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                <span className="text-sm font-medium">
                  {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
                </span>
              </button>
              <button onClick={signOut}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-[var(--danger)] hover:bg-[var(--danger-subtle)] transition-colors">
                <LogOut size={18} />
                <span className="text-sm font-medium">Cerrar sesión</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}