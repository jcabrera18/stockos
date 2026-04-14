'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Package, ShoppingCart,
  Truck, BarChart3, Settings, Sun, Moon, LogOut, Zap, Layers, Tag, Users, PercentCircle, Warehouse, ClipboardList, CreditCard, Building2, Award, Percent, Receipt, Wallet
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/hooks/useTheme'
import { useAuth } from '@/hooks/useAuth'
import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { api } from '@/lib/api'
import { useWorkstation } from '@/hooks/useWorkstation'

export function Sidebar() {
  const pathname = usePathname()
  const { theme, toggle } = useTheme()
  const { signOut, user, loading } = useAuth()
  const role = (user?.role as string) ?? 'cashier'
  const [cajaAbierta, setCajaAbierta] = useState(false)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [pendingHref, setPendingHref] = useState<string | null>(null)

  useEffect(() => { setPendingHref(null) }, [pathname])
  const { workstation } = useWorkstation()

  useEffect(() => {
    const check = () => {
      const params = workstation?.register_id
        ? `?register_id=${workstation.register_id}`
        : ''
      api.get(`/api/cash-register/current${params}`)
        .then((data: unknown) => setCajaAbierta(data !== null))
        .catch(() => { })
    }
    check()
    window.addEventListener('focus', check)
    window.addEventListener('caja-changed', check)
    return () => {
      window.removeEventListener('focus', check)
      window.removeEventListener('caja-changed', check)
    }
  }, [workstation])

  const ALL_NAV_ITEMS = [
    // ── Operación diaria ──
    { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard, roles: ['owner', 'admin'] },
    { href: '/pos', label: 'POS', icon: Zap, roles: ['owner', 'admin', 'cashier'] },
    { href: '/cash-register', label: 'Caja', icon: CreditCard, roles: ['owner', 'admin', 'cashier'] },
    { href: '/sales', label: 'Ventas', icon: ShoppingCart, roles: ['owner', 'admin', 'cashier'] },
    { href: '/invoices', label: 'Comprobantes', icon: Receipt, roles: ['owner', 'admin', 'cashier'] },
    { href: '/orders', label: 'Pedidos', icon: ClipboardList, roles: ['owner', 'admin', 'cashier', 'stocker', 'seller'] },
    { href: '/customers', label: 'Clientes', icon: Users, roles: ['owner', 'admin', 'cashier'] },
    { href: '/accounts', label: 'Cuentas ctes.', icon: Wallet, roles: ['owner', 'admin', 'cashier'] },

    // ── Stock y logística ──
    { href: '/purchases', label: 'Compras', icon: Truck, roles: ['owner', 'admin', 'stocker'] },
    { href: '/warehouses', label: 'Depósitos', icon: Warehouse, roles: ['owner', 'admin', 'stocker'] },

    // ── Catálogo ──
    { href: '/products', label: 'Productos', icon: Package, roles: ['owner', 'admin'] },
    { href: '/categories', label: 'Categorías', icon: Layers, roles: ['owner', 'admin'] },
    { href: '/brands', label: 'Marcas', icon: Award, roles: ['owner', 'admin'] },
    { href: '/price-lists', label: 'Precios', icon: Tag, roles: ['owner', 'admin'] },
    { href: '/promotions', label: 'Promociones', icon: Percent, roles: ['owner', 'admin'] },

    // ── Administración ──
    { href: '/finances', label: 'Finanzas', icon: BarChart3, roles: ['owner', 'admin'] },
    { href: '/branches', label: 'Sucursales', icon: Building2, roles: ['owner', 'admin'] },
    { href: '/settings',      label: 'Configuración',    icon: Settings,      roles: ['owner', 'admin'] },
  ]

  const NAV_ITEMS = ALL_NAV_ITEMS.filter(item => item.roles.includes(role))
  const GROUP_STARTS = ['/purchases', '/products', '/finances']

  return (
    <>
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
          {loading ? (
            Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius-md)]">
                <div className="w-4 h-4 rounded bg-[var(--surface2)] animate-pulse flex-shrink-0" />
                <div className="h-3 rounded bg-[var(--surface2)] animate-pulse flex-1" style={{ width: `${55 + (i * 13) % 35}%` }} />
              </div>
            ))
          ) : NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            const pending = pendingHref === href
            const GROUP_STARTS = ['/purchases', '/products', '/finances']

            return (
              <div key={href}>
                {GROUP_STARTS.includes(href) && (
                  <div className="mx-3 my-1.5 border-t border-[var(--border)]" />
                )}
                <Link href={href}
                  onClick={() => { if (!active) setPendingHref(href) }}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius-md)] text-sm transition-colors',
                    active || pending
                      ? 'bg-[var(--accent-subtle)] text-[var(--accent)] font-medium'
                      : 'text-[var(--text2)] hover:bg-[var(--surface2)] hover:text-[var(--text)]'
                  )}>
                  <Icon size={16} />
                  <span className="flex-1">{label}</span>
                  {pending ? (
                    <span className="w-3 h-3 border border-[var(--accent)] border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  ) : href === '/cash-register' ? (
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cajaAbierta ? 'bg-[var(--accent)] animate-pulse' : 'bg-[var(--danger)]'}`} />
                  ) : null}
                </Link>
              </div>
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
            onClick={() => setConfirmSignOut(true)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius-md)] text-sm text-[var(--text2)] hover:bg-[var(--danger-subtle)] hover:text-[var(--danger)] transition-colors cursor-pointer"
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
