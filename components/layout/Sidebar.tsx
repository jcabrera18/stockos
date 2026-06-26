'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Package, ShoppingCart,
  Truck, BarChart3, Settings, Sun, Moon, LogOut, Zap, Layers, Tag, Users, PercentCircle, Warehouse, ClipboardList, CreditCard, Building2, Award, Percent, Receipt, Wallet, Wrench, ChevronDown, FileText
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/hooks/useTheme'
import { useAuth } from '@/hooks/useAuth'
import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { api } from '@/lib/api'
import { useWorkstation } from '@/hooks/useWorkstation'
import { useSidePanel } from '@/contexts/SidePanelContext'

export function Sidebar() {
  const pathname = usePathname()
  const { theme, toggle } = useTheme()
  const { signOut, user, loading } = useAuth()
  const { collapsed } = useSidePanel()
  const role = (user?.role as string) ?? 'cashier'
  const [cajaAbierta, setCajaAbierta] = useState(false)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [hoverTip, setHoverTip] = useState<{ text: string; top: number; left: number } | null>(null)

  useEffect(() => { setPendingHref(null) }, [pathname])

  // "Más herramientas" arranca cerrado en cada carga; se mantiene abierto solo durante la sesión.
  const toggleTools = () => setToolsOpen(prev => !prev)
  const { workstation } = useWorkstation()

  useEffect(() => {
    let lastCheckAt = 0
    const check = () => {
      lastCheckAt = Date.now()
      const params = workstation?.register_id
        ? `?register_id=${workstation.register_id}`
        : ''
      // Endpoint liviano: sólo el booleano de "hay caja abierta" (no los totales RT).
      api.get<{ open: boolean }>(`/api/cash-register/status${params}`)
        .then((data) => setCajaAbierta(data?.open ?? false))
        .catch(() => { })
    }
    // El evento focus se dispara en cada alt-tab. Throttle de 30s para no pegarle
    // a /cash-register/current cada vez que la pestaña recupera el foco.
    const FOCUS_THROTTLE_MS = 30_000
    const onFocus = () => { if (Date.now() - lastCheckAt > FOCUS_THROTTLE_MS) check() }
    check()
    window.addEventListener('focus', onFocus)
    window.addEventListener('caja-changed', check)  // cambio real de caja: siempre refresca
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('caja-changed', check)
    }
  }, [workstation])

  const ALL_NAV_ITEMS = [
    // ── Operación diaria ──
    { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard, roles: ['owner', 'admin'], tip: 'Resumen y métricas del negocio' },
    { href: '/pos', label: 'Cobrar', icon: Zap, roles: ['owner', 'admin', 'cashier'], tip: 'Cobrar y vender en el mostrador' },
    { href: '/cash-register', label: 'Caja', icon: CreditCard, roles: ['owner', 'admin', 'cashier'], tip: 'Apertura y cierre de caja' },
    { href: '/sales', label: 'Ventas', icon: ShoppingCart, roles: ['owner', 'admin', 'cashier'], tip: 'Historial de ventas' },
    { href: '/invoices', label: 'Comprobantes', icon: Receipt, roles: ['owner', 'admin', 'cashier'], tip: 'Facturas y tickets AFIP' },
    { href: '/orders', label: 'Pedidos', icon: ClipboardList, roles: ['owner', 'admin', 'cashier', 'stocker', 'seller'], tip: 'Pedidos de clientes' },
    { href: '/quotes', label: 'Presupuestos', icon: FileText, roles: ['owner', 'admin', 'cashier', 'seller'], tip: 'Cotizaciones a clientes' },
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

  const showTip = (e: React.MouseEvent, text: string) => {
    const r = e.currentTarget.getBoundingClientRect()
    setHoverTip({ text, top: r.top + r.height / 2, left: r.right + 8 })
  }

  const renderItem = ({ href, label, icon: Icon, tip }: typeof NAV_ITEMS[number]) => {
    const active = pathname === href || pathname.startsWith(href + '/')
    const pending = pendingHref === href
    const showDot = href === '/cash-register'
    return (
      <Link key={href} href={href} prefetch={false}
        onClick={() => { if (!active) setPendingHref(href) }}
        onMouseEnter={(e) => {
          if (collapsed) showTip(e, label)
          else if (tip) showTip(e, tip)
        }}
        onMouseLeave={() => setHoverTip(null)}
        className={cn(
          'relative flex items-center gap-2.5 rounded-[var(--radius-md)] text-sm transition-colors',
          collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2',
          active || pending
            ? 'bg-[var(--accent-subtle)] text-[var(--accent)] font-medium'
            : 'text-[var(--text2)] hover:bg-[var(--surface2)] hover:text-[var(--text)]'
        )}>
        <Icon size={16} className="flex-shrink-0" />
        {!collapsed && <span className="flex-1">{label}</span>}
        {pending ? (
          <span className={cn(
            'w-3 h-3 border border-[var(--accent)] border-t-transparent rounded-full animate-spin flex-shrink-0',
            collapsed && 'absolute top-1 right-1'
          )} />
        ) : showDot ? (
          <span className={cn(
            `w-2 h-2 rounded-full flex-shrink-0 ${cajaAbierta ? 'bg-[var(--accent)] animate-pulse' : 'bg-[var(--danger)]'}`,
            collapsed && 'absolute top-1.5 right-1.5'
          )} />
        ) : null}
      </Link>
    )
  }

  return (
    <>
      <aside className={cn(
        'hidden md:flex flex-col h-screen bg-[var(--surface)] border-r border-[var(--border)] sticky top-0 flex-shrink-0 transition-[width] duration-200 ease-out',
        collapsed ? 'w-16' : 'w-56'
      )}>
        {/* Logo */}
        <div className={cn('flex items-center gap-2.5 py-5 border-b border-[var(--border)]', collapsed ? 'justify-center px-2' : 'px-4')}>
          <div className="w-7 h-7 rounded-lg bg-[var(--accent)] flex items-center justify-center flex-shrink-0">
            <Zap size={14} className="text-white" />
          </div>
          {!collapsed && <span className="text-sm font-bold text-[var(--text)] tracking-tight">StockOS</span>}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto overflow-x-hidden">
          {loading ? (
            Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className={cn('flex items-center gap-2.5 py-2 rounded-[var(--radius-md)]', collapsed ? 'justify-center px-0' : 'px-3')}>
                <div className="w-4 h-4 rounded bg-[var(--surface2)] animate-pulse flex-shrink-0" />
                {!collapsed && <div className="h-3 rounded bg-[var(--surface2)] animate-pulse flex-1" style={{ width: `${55 + (i * 13) % 35}%` }} />}
              </div>
            ))
          ) : collapsed ? (
            <>
              {coreItems.map(renderItem)}
              {extraItems.length > 0 && <div className="my-1.5 mx-2 border-t border-[var(--border)]" />}
              {extraItems.map(renderItem)}
            </>
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
            onMouseEnter={(e) => collapsed && showTip(e, theme === 'dark' ? 'Modo claro' : 'Modo oscuro')}
            onMouseLeave={() => setHoverTip(null)}
            className={cn(
              'w-full flex items-center gap-2.5 py-2 rounded-[var(--radius-md)] text-sm text-[var(--text2)] hover:bg-[var(--surface2)] hover:text-[var(--text)] transition-colors cursor-pointer',
              collapsed ? 'justify-center px-0' : 'px-3'
            )}
          >
            {theme === 'dark' ? <Sun size={16} className="flex-shrink-0" /> : <Moon size={16} className="flex-shrink-0" />}
            {!collapsed && (theme === 'dark' ? 'Modo claro' : 'Modo oscuro')}
          </button>
          <button
            onClick={() => setConfirmSignOut(true)}
            onMouseEnter={(e) => collapsed && showTip(e, 'Salir')}
            onMouseLeave={() => setHoverTip(null)}
            className={cn(
              'w-full flex items-center gap-2.5 py-2 rounded-[var(--radius-md)] text-sm text-[var(--text2)] hover:bg-[var(--danger-subtle)] hover:text-[var(--danger)] transition-colors cursor-pointer',
              collapsed ? 'justify-center px-0' : 'px-3'
            )}
          >
            <LogOut size={16} className="flex-shrink-0" />
            {!collapsed && 'Salir'}
          </button>
          {workstation && !collapsed && (
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
          className="hidden md:block fixed z-[60] -translate-y-1/2 pointer-events-none whitespace-nowrap rounded-[var(--radius-md)] bg-[var(--text)] text-[var(--surface)] text-xs px-2.5 py-1.5 shadow-lg"
          style={{ top: hoverTip.top, left: hoverTip.left }}
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
