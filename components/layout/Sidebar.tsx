'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Package, ShoppingCart,
  Truck, BarChart3, Settings, Sun, Moon, LogOut, Zap, Layers, Tag, Users, PercentCircle, Warehouse, ClipboardList, CreditCard, Building2, Award, Percent, Receipt, Wallet, Wrench, ChevronDown
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
  const [toolsOpen, setToolsOpen] = useState(false)
  const [hoverTip, setHoverTip] = useState<{ text: string; top: number } | null>(null)

  useEffect(() => { setPendingHref(null) }, [pathname])

  // "Más herramientas" arranca cerrado en cada carga; se mantiene abierto solo durante la sesión.
  const toggleTools = () => setToolsOpen(prev => !prev)
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
    { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard, roles: ['owner', 'admin'], tip: 'Resumen y métricas del negocio' },
    { href: '/pos', label: 'POS', icon: Zap, roles: ['owner', 'admin', 'cashier'], tip: 'Cobrar y vender en el mostrador' },
    { href: '/cash-register', label: 'Caja', icon: CreditCard, roles: ['owner', 'admin', 'cashier'], tip: 'Apertura y cierre de caja' },
    { href: '/sales', label: 'Ventas', icon: ShoppingCart, roles: ['owner', 'admin', 'cashier'], tip: 'Historial de ventas' },
    { href: '/invoices', label: 'Comprobantes', icon: Receipt, roles: ['owner', 'admin', 'cashier'], tip: 'Facturas y tickets AFIP' },
    { href: '/orders', label: 'Pedidos', icon: ClipboardList, roles: ['owner', 'admin', 'cashier', 'stocker', 'seller'], tip: 'Pedidos de clientes' },
    { href: '/customers', label: 'Clientes', icon: Users, roles: ['owner', 'admin', 'cashier'], tip: 'Base de clientes' },
    { href: '/accounts', label: 'Cuentas ctes.', icon: Wallet, roles: ['owner', 'admin', 'cashier'], tip: 'Saldos y cobros de cuenta corriente' },

    // ── Stock y logística ──
    { href: '/purchases', label: 'Compras', icon: Truck, roles: ['owner', 'admin', 'stocker'], tip: 'Órdenes de compra y proveedores' },
    { href: '/warehouses', label: 'Depósitos', icon: Warehouse, roles: ['owner', 'admin', 'stocker'], tip: 'Stock por depósito y transferencias' },

    // ── Catálogo ──
    { href: '/products', label: 'Productos', icon: Package, roles: ['owner', 'admin'], tip: 'Catálogo de productos y stock' },
    { href: '/categories', label: 'Categorías', icon: Layers, roles: ['owner', 'admin'], tip: 'Organizá tus productos' },
    { href: '/brands', label: 'Marcas', icon: Award, roles: ['owner', 'admin'], tip: 'Marcas de tus productos' },
    { href: '/price-lists', label: 'Precios', icon: Tag, roles: ['owner', 'admin'], tip: 'Listas y reglas de precio' },
    { href: '/promotions', label: 'Promociones', icon: Percent, roles: ['owner', 'admin'], tip: 'Descuentos y ofertas' },

    // ── Administración ──
    { href: '/finances', label: 'Finanzas', icon: BarChart3, roles: ['owner', 'admin'], tip: 'Ingresos, gastos y reportes' },
    { href: '/branches', label: 'Sucursales', icon: Building2, roles: ['owner', 'admin'], tip: 'Sucursales y cajas' },
    { href: '/settings',      label: 'Configuración',    icon: Settings,      roles: ['owner', 'admin'], tip: 'Configuración del negocio' },
  ]

  const NAV_ITEMS = ALL_NAV_ITEMS.filter(item => item.roles.includes(role))

  // ── Modo Comercio: core visible + "Más herramientas" colapsable ──
  // Solo aplica a owner/admin (los roles restringidos ya ven pocos items).
  const isPrivileged = role === 'owner' || role === 'admin'
  const CORE_HREFS = ['/dashboard', '/pos', '/cash-register', '/products', '/sales', '/customers', '/accounts']

  // Configuración se renderiza aparte, en el footer (junto a Modo oscuro / Salir).
  const coreItems = isPrivileged
    ? CORE_HREFS.map(h => NAV_ITEMS.find(i => i.href === h)).filter(Boolean) as typeof NAV_ITEMS
    : NAV_ITEMS.filter(i => i.href !== '/settings')
  const extraItems = isPrivileged
    ? NAV_ITEMS.filter(i => !CORE_HREFS.includes(i.href) && i.href !== '/settings')
    : []
  const settingsItem = NAV_ITEMS.find(i => i.href === '/settings')

  // Si la ruta activa vive en "Más herramientas", se auto-expande para no perder contexto.
  const activeInExtra = extraItems.some(i => pathname === i.href || pathname.startsWith(i.href + '/'))
  const showExtra = toolsOpen || activeInExtra

  const renderItem = ({ href, label, icon: Icon, tip }: typeof NAV_ITEMS[number]) => {
    const active = pathname === href || pathname.startsWith(href + '/')
    const pending = pendingHref === href
    return (
      <Link key={href} href={href}
        onClick={() => { if (!active) setPendingHref(href) }}
        onMouseEnter={(e) => {
          if (!tip) return
          const r = e.currentTarget.getBoundingClientRect()
          setHoverTip({ text: tip, top: r.top + r.height / 2 })
        }}
        onMouseLeave={() => setHoverTip(null)}
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
    )
  }

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
          ) : (
            <>
              {coreItems.map(renderItem)}

              {extraItems.length > 0 && (
                <>
                  <button
                    onClick={toggleTools}
                    aria-expanded={showExtra}
                    className="w-full flex items-center gap-2.5 px-3 py-2 mt-1.5 rounded-[var(--radius-md)] text-sm text-[var(--text2)] hover:bg-[var(--surface2)] hover:text-[var(--text)] transition-colors cursor-pointer"
                  >
                    <Wrench size={16} />
                    <span className="flex-1 text-left">Más herramientas</span>
                    <ChevronDown
                      size={14}
                      className={cn('flex-shrink-0 transition-transform', showExtra && 'rotate-180')}
                    />
                  </button>
                  {showExtra && (
                    <div className="space-y-0.5 pl-2 border-l border-[var(--border)] ml-3">
                      {extraItems.map(renderItem)}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="px-2 py-3 border-t border-[var(--border)] space-y-0.5">
          {settingsItem && !loading && renderItem(settingsItem)}
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

      {/* Tooltip flotante (fuera del overflow del nav para que no se recorte) */}
      {hoverTip && (
        <div
          role="tooltip"
          className="hidden md:block fixed left-[232px] z-[60] -translate-y-1/2 pointer-events-none whitespace-nowrap rounded-[var(--radius-md)] bg-[var(--text)] text-[var(--surface)] text-xs px-2.5 py-1.5 shadow-lg"
          style={{ top: hoverTip.top }}
        >
          {hoverTip.text}
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
