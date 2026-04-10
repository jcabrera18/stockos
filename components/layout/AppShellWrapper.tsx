'use client'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { ShoppingCart } from 'lucide-react'
import { AuthProvider } from '@/contexts/AuthContext'

// Rutas que manejan su propio layout full-screen (no necesitan shell)
const NO_SHELL = ['/login', '/pos']

const POS_CART_KEY = 'stockos_pos_cart'

function POSBadge() {
  const router = useRouter()
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

export function AppShellWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const hasShell = !NO_SHELL.some(r => pathname === r || pathname.startsWith(r + '/'))

  if (!hasShell) return <AuthProvider>{children}</AuthProvider>

  return (
    <AuthProvider>
      <div className="flex h-screen bg-[var(--bg)] overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          {children}
        </main>
        <BottomNav />
        <POSBadge />
      </div>
    </AuthProvider>
  )
}
