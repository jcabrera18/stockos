'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Package, Boxes, Building2, Zap, ShoppingCart,
  BarChart3, CreditCard, Menu, X, Settings, LogOut, Sun, Moon,
  Tag, Users, PercentCircle, Warehouse, ClipboardList, Award,
  Percent, Receipt, Truck
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { useTheme } from '@/hooks/useTheme'
import { useAuth } from '@/hooks/useAuth'

export function BottomNav() {
  const pathname = usePathname()
  const { theme, toggle } = useTheme()
  const { signOut, user, loading } = useAuth()
  const role = (user?.role as string) ?? 'cashier'

  // ── Nav principal (barra inferior) ───────────────────────
  const ALL_NAV_ITEMS = [
    { href: '/dashboard',     label: 'Inicio',    icon: LayoutDashboard, roles: ['owner', 'admin'] },
    { href: '/pos',           label: 'POS',        icon: Zap,             roles: ['owner', 'admin', 'cashier'] },
    { href: '/cash-register', label: 'Caja',       icon: CreditCard,      roles: ['owner', 'admin', 'cashier'] },
    { href: '/sales',         label: 'Ventas',     icon: ShoppingCart,    roles: ['owner', 'admin', 'cashier'] },
    { href: '/orders',        label: 'Pedidos',    icon: ClipboardList,   roles: ['owner', 'admin', 'cashier', 'stocker', 'seller'] },
    { href: '/stock',         label: 'Inventario', icon: Boxes,           roles: ['owner', 'admin', 'stocker'] },
  ]

  const NAV_ITEMS = ALL_NAV_ITEMS.filter(item => item.roles.includes(role))

  // ── Items del drawer agrupados ────────────────────────────
  const DRAWER_GROUPS = [
    {
      label: 'Operación',
      items: [
        { href: '/invoices',      label: 'Comprobantes',     icon: Receipt,       roles: ['owner', 'admin', 'cashier'] },
        { href: '/customers',     label: 'Cuentas ctes.',    icon: Users,         roles: ['owner', 'admin', 'cashier'] },
        { href: '/purchases',     label: 'Compras',          icon: Truck,         roles: ['owner', 'admin', 'stocker'] },
        { href: '/warehouses',    label: 'Depósitos',        icon: Warehouse,     roles: ['owner', 'admin', 'stocker'] },
      ]
    },
    {
      label: 'Catálogo',
      items: [
        { href: '/products',      label: 'Productos',        icon: Package,       roles: ['owner', 'admin'] },
        { href: '/categories',    label: 'Categorías',       icon: Tag,           roles: ['owner', 'admin'] },
        { href: '/brands',        label: 'Marcas',           icon: Award,         roles: ['owner', 'admin'] },
        { href: '/price-lists',   label: 'Precios',          icon: PercentCircle, roles: ['owner', 'admin'] },
        { href: '/promotions',    label: 'Promociones',      icon: Percent,       roles: ['owner', 'admin'] },
      ]
    },
    {
      label: 'Administración',
      items: [
        { href: '/finances',      label: 'Finanzas',         icon: BarChart3,     roles: ['owner', 'admin'] },
        { href: '/branches',      label: 'Sucursales',       icon: Building2,     roles: ['owner', 'admin'] },
        { href: '/settings',      label: 'Configuración',    icon: Settings,      roles: ['owner', 'admin'] },
      ]
    },
  ]

  const [drawerOpen, setDrawerOpen]       = useState(false)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [pendingHref, setPendingHref]     = useState<string | null>(null)

  useEffect(() => { setPendingHref(null) }, [pathname])

  // Cerrar drawer al navegar
  useEffect(() => { setDrawerOpen(false) }, [pathname])

  return (
    <>
      {/* ── Barra inferior ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--surface)]/95 backdrop-blur-md border-t border-[var(--border)] pb-safe">
        <div className="flex items-stretch justify-around px-1">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-1 px-3 py-2.5">
                <div className="w-5 h-5 rounded bg-[var(--surface2)] animate-pulse" />
                <div className="w-8 h-2 rounded bg-[var(--surface2)] animate-pulse" />
              </div>
            ))
          ) : (
            <>
              {NAV_ITEMS.slice(0, 4).map(({ href, label, icon: Icon }) => {
                const active  = pathname === href || pathname.startsWith(href + '/')
                const pending = pendingHref === href
                return (
                  <Link key={href} href={href}
                    onClick={() => { if (!active) setPendingHref(href) }}
                    className={cn(
                      'relative flex flex-col items-center justify-center gap-0.5 px-3 py-2.5 min-w-0 flex-1 transition-colors',
                      active || pending ? 'text-[var(--accent)]' : 'text-[var(--text3)]'
                    )}>
                    {/* Indicador activo */}
                    {active && (
                      <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-[var(--accent)] rounded-full" />
                    )}
                    {pending ? (
                      <span className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
                    )}
                    <span className={cn('text-[10px] truncate transition-all', active ? 'font-semibold' : 'font-medium')}>
                      {label}
                    </span>
                  </Link>
                )
              })}

              {/* Botón "Más" */}
              <button onClick={() => setDrawerOpen(true)}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-0.5 px-3 py-2.5 min-w-0 flex-1 transition-colors',
                  drawerOpen ? 'text-[var(--accent)]' : 'text-[var(--text3)]'
                )}>
                {drawerOpen && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-[var(--accent)] rounded-full" />
                )}
                <Menu size={20} strokeWidth={drawerOpen ? 2.5 : 1.8} />
                <span className="text-[10px] font-medium">Más</span>
              </button>
            </>
          )}
        </div>
      </nav>

      {/* ── Drawer ── */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50"
          style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={() => setDrawerOpen(false)}>
          <div
            className="absolute bottom-0 left-0 right-0 bg-[var(--surface)] rounded-t-2xl border-t border-[var(--border)] max-h-[85vh] overflow-y-auto pb-safe"
            onClick={e => e.stopPropagation()}>

            {/* Handle */}
            <div className="sticky top-0 bg-[var(--surface)] z-10">
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 bg-[var(--border)] rounded-full" />
              </div>
              <div className="flex items-center justify-between px-5 py-2.5 border-b border-[var(--border)]">
                <span className="text-sm font-semibold text-[var(--text)]">Menú</span>
                <button onClick={() => setDrawerOpen(false)}
                  className="p-1.5 rounded-full hover:bg-[var(--surface2)] text-[var(--text3)] transition-colors">
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="px-4 py-3 space-y-5">

              {/* Grupos de navegación */}
              {DRAWER_GROUPS.map(group => {
                const visibleItems = group.items.filter(i => i.roles.includes(role))
                if (visibleItems.length === 0) return null
                return (
                  <div key={group.label}>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text3)] px-2 mb-2">
                      {group.label}
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {visibleItems.map(({ href, label, icon: Icon }) => {
                        const active = pathname === href || pathname.startsWith(href + '/')
                        return (
                          <Link key={href} href={href}
                            className={cn(
                              'flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl transition-all',
                              active
                                ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
                                : 'bg-[var(--surface2)] text-[var(--text2)] active:scale-95'
                            )}>
                            <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
                            <span className="text-[10px] font-medium text-center leading-tight">{label}</span>
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                )
              })}

              {/* Divider */}
              <div className="border-t border-[var(--border)]" />

              {/* Tema + Salir */}
              <div className="grid grid-cols-2 gap-2 pb-2">
                <button onClick={toggle}
                  className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-[var(--surface2)] text-[var(--text2)] transition-colors active:scale-95">
                  {theme === 'dark'
                    ? <Sun size={18} className="text-[var(--accent)]" />
                    : <Moon size={18} className="text-[var(--accent)]" />
                  }
                  <span className="text-sm font-medium">
                    {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
                  </span>
                </button>
                <button
                  onClick={() => { setDrawerOpen(false); setConfirmSignOut(true) }}
                  className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-[var(--danger-subtle)] text-[var(--danger)] transition-colors active:scale-95">
                  <LogOut size={18} />
                  <span className="text-sm font-medium">Salir</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm signout ── */}
      <Modal open={confirmSignOut} onClose={() => setConfirmSignOut(false)} title="Cerrar sesión" size="sm">
        <div className="space-y-4 pb-2">
          <p className="text-sm text-[var(--text2)]">¿Seguro que querés salir?</p>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setConfirmSignOut(false)}
              className="px-4 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface2)] text-[var(--text2)] hover:bg-[var(--surface3)] transition-colors">
              Cancelar
            </button>
            <button onClick={signOut}
              className="px-4 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--danger)] text-white hover:opacity-90 transition-opacity">
              Salir
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
