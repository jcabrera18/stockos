'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Package, Boxes, Building2, Zap, ShoppingCart, BarChart3, CreditCard, Menu, X, Settings, LogOut, Sun, Moon, Tag, Users, PercentCircle, Warehouse, ClipboardList } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { useTheme } from '@/hooks/useTheme'
import { useAuth } from '@/hooks/useAuth'


export function BottomNav() {
  const pathname = usePathname()
  const { theme, toggle } = useTheme()
  const { signOut, user, loading } = useAuth()
  const role = (user?.role as string) ?? 'cashier'

  const ALL_NAV_ITEMS = [
    { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard, roles: ['owner', 'admin'] },
    { href: '/pos', label: 'POS', icon: Zap, roles: ['owner', 'admin', 'cashier'] },
    { href: '/products', label: 'Productos', icon: Package, roles: ['owner', 'admin'] },
    { href: '/stock', label: 'Stock', icon: Boxes, roles: ['owner', 'admin', 'stocker'] },
    { href: '/sales', label: 'Ventas', icon: ShoppingCart, roles: ['owner', 'admin', 'cashier'] },
    { href: '/finances', label: 'Finanzas', icon: BarChart3, roles: ['owner', 'admin'] },
    { href: '/orders', label: 'Pedidos', icon: ClipboardList, roles: ['owner', 'admin', 'cashier', 'stocker', 'seller'] },
  ]

  const NAV_ITEMS = ALL_NAV_ITEMS.filter(item => item.roles.includes(role))

  const ALL_EXTRA_ITEMS = [
    { href: '/purchases', label: 'Compras', icon: ShoppingCart, roles: ['owner', 'admin', 'stocker'] },
    { href: '/customers', label: 'Cuentas ctes.', icon: Users, roles: ['owner', 'admin', 'cashier'] },
    { href: '/categories', label: 'Categorías', icon: Tag, roles: ['owner', 'admin'] },
    { href: '/price-lists', label: 'Listas de precio', icon: PercentCircle, roles: ['owner', 'admin'] },
    { href: '/warehouses', label: 'Depósitos', icon: Warehouse, roles: ['owner', 'admin', 'stocker'] },
    { href: '/branches', label: 'Sucursales', icon: Building2, roles: ['owner', 'admin'] },
    { href: '/cash-register', label: 'Caja', icon: CreditCard, roles: ['owner', 'admin', 'cashier'] },
    { href: '/settings', label: 'Configuración', icon: Settings, roles: ['owner', 'admin'] },
  ]

  const EXTRA_ITEMS = ALL_EXTRA_ITEMS.filter(item => item.roles.includes(role))

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [confirmSignOut, setConfirmSignOut] = useState(false)

  return (
    <>
      {/* Bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--surface)] border-t border-[var(--border)] px-1 pb-safe">
        <div className="flex items-center justify-around">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-1 px-3 py-2.5">
                <div className="w-5 h-5 rounded bg-[var(--surface2)] animate-pulse" />
                <div className="w-8 h-2 rounded bg-[var(--surface2)] animate-pulse" />
              </div>
            ))
          ) : (
            NAV_ITEMS.map(({ href, label, icon: Icon }) => {
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
            })
          )}

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
              <button onClick={() => { setDrawerOpen(false); setConfirmSignOut(true) }}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-[var(--danger)] hover:bg-[var(--danger-subtle)] transition-colors cursor-pointer">
                <LogOut size={18} />
                <span className="text-sm font-medium">Cerrar sesión</span>
              </button>
            </div>
          </div>
        </div>
      )}
      <Modal open={confirmSignOut} onClose={() => setConfirmSignOut(false)} title="Cerrar sesión" size="sm">
        <div className="space-y-4 pb-2">
          <p className="text-sm text-[var(--text2)]">¿Seguro que querés salir?</p>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setConfirmSignOut(false)}
              className="px-4 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface2)] text-[var(--text2)] hover:bg-[var(--surface3)] transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={signOut}
              className="px-4 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--danger)] text-white hover:opacity-90 transition-opacity cursor-pointer"
            >
              Salir
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}