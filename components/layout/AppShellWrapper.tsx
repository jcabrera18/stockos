'use client'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { ShoppingCart } from 'lucide-react'
import { AuthProvider, useAuthContext } from '@/contexts/AuthContext'
import { SubscriptionBanner } from './SubscriptionBanner'
import { SidebarSubscriptionCard } from './SidebarSubscriptionCard'
import { EmailConfirmBanner } from './EmailConfirmBanner'
import { SidePanelProvider, useSidePanel } from '@/contexts/SidePanelContext'
import { PlansPaymentProvider } from '@/contexts/PlansPaymentContext'

// Rutas que manejan su propio layout full-screen (no necesitan shell)
const NO_SHELL = ['/login', '/register', '/forgot-password', '/reset-password', '/pos', '/home', '/c']

const POS_CART_KEY = 'stockos_pos_cart'

function POSBadge() {
  const router = useRouter()
  // Cuando hay un panel master-detail abierto (con su propia barra de acciones
  // sticky abajo), el pill centrado se encoge a un FAB en la esquina para no
  // tapar botones como Imprimir / Remito / Ver venta.
  const { collapsed } = useSidePanel()
  const [info, setInfo] = useState<{ items: number; total: number } | null>(null)

  useEffect(() => {
    const check = () => {
      try {
        const saved = localStorage.getItem(POS_CART_KEY)
        if (saved) {
          const { cart } = JSON.parse(saved)
          if (cart?.length > 0) {
            const items = cart.reduce((a: number, i: { quantity: number }) => a + i.quantity, 0)
            const total = cart.reduce((a: number, i: { unit_price: number; quantity: number; discount: number }) => a + i.unit_price * i.quantity - i.discount, 0)
            setInfo({ items, total })
            return
          }
        }
      } catch { }
      setInfo(null)
    }

    check()
    window.addEventListener('storage', check)
    // Chequear también al enfocar la ventana (el POS puede haber actualizado el cart)
    window.addEventListener('focus', check)
    return () => {
      window.removeEventListener('storage', check)
      window.removeEventListener('focus', check)
    }
  }, [])

  if (!info) return null

  // Panel de detalle abierto: FAB compacto en la esquina, fuera de la barra sticky.
  if (collapsed) {
    return (
      <button
        onClick={() => router.push('/pos')}
        aria-label={`Venta en curso · ${info.items} ${info.items === 1 ? 'producto' : 'productos'}`}
        title="Venta en curso"
        className="fixed bottom-20 md:bottom-6 right-4 z-50 flex items-center justify-center w-12 h-12 rounded-full bg-[var(--accent)] text-white shadow-lg hover:opacity-90 active:scale-95 transition-all"
      >
        <ShoppingCart size={18} />
        <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 flex items-center justify-center rounded-full bg-[var(--surface)] text-[var(--accent)] text-xs font-bold shadow ring-1 ring-[var(--accent)]">
          {info.items}
        </span>
      </button>
    )
  }

  return (
    <button
      onClick={() => router.push('/pos')}
      className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-[var(--accent)] text-white shadow-lg hover:opacity-90 active:scale-95 transition-all"
    >
      <ShoppingCart size={15} />
      <span className="text-sm font-semibold">
        Venta en curso · {info.items} {info.items === 1 ? 'producto' : 'productos'}
      </span>
      <span className="text-sm font-bold opacity-90">
        ${info.total.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
      </span>
    </button>
  )
}

function AppShell({ children }: { children: React.ReactNode }) {
  const { loading } = useAuthContext()

  if (loading) return <div className="h-screen bg-[var(--bg)]" />

  return (
    <SidePanelProvider>
      <PlansPaymentProvider>
        <div className="flex h-screen bg-[var(--bg)] overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
            {/* Aviso de suscripción persistente en mobile (en desktop vive en el sidebar) */}
            <div className="md:hidden sticky top-0 z-30">
              <SidebarSubscriptionCard variant="mobile" />
            </div>
            {children}
          </main>
          <BottomNav />
          <POSBadge />
          <SubscriptionBanner />
          <EmailConfirmBanner />
        </div>
      </PlansPaymentProvider>
    </SidePanelProvider>
  )
}

export function AppShellWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const hasShell = !NO_SHELL.some(r => pathname === r || pathname.startsWith(r + '/'))

  if (!hasShell) return <AuthProvider>{children}</AuthProvider>

  return (
    <AuthProvider>
      <AppShell>{children}</AppShell>
    </AuthProvider>
  )
}
