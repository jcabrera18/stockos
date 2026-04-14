import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { createServerClient } from '@supabase/ssr'

const roleHomePage: Record<string, string> = {
  owner:   '/dashboard',
  admin:   '/dashboard',
  cashier: '/pos',
  stocker: '/warehouses',
  seller:  '/orders',
}

// Rutas permitidas por rol
const roleAllowedPaths: Record<string, string[]> = {
  owner:   ['/'],  // owner ve todo
  admin:   ['/'],  // admin ve todo
  cashier: ['/pos', '/sales', '/orders', '/customers', '/accounts', '/cash-register'],
  stocker: ['/purchases', '/warehouses', '/orders'],
  seller:  ['/orders'],
}

export async function middleware(request: NextRequest) {
  const response = await updateSession(request)
  const pathname = request.nextUrl.pathname

  // Rutas públicas — no verificar
  if (pathname === '/login') return response

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: () => {},
        },
      }
    )

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return response

    // Leer el rol del JWT (ya verificado por updateSession) para evitar
    // un SELECT extra que puede fallar por RLS y defaultear mal a 'cashier'
    let role = 'owner' // safe default: nunca bloquear acceso por error
    try {
      const payload = JSON.parse(
        Buffer.from(session.access_token.split('.')[1], 'base64').toString()
      )
      if (payload.user_role) role = payload.user_role
    } catch { }
    const homePage = roleHomePage[role] ?? '/dashboard'

    // Redirigir / a la home del rol
    if (pathname === '/') {
      return NextResponse.redirect(new URL(homePage, request.url))
    }

    // Verificar acceso — owner y admin pasan todo
    if (role === 'owner' || role === 'admin') return response

    // Para otros roles, verificar si la ruta está permitida
    const allowed = roleAllowedPaths[role] ?? []
    const hasAccess = allowed.some(path => pathname.startsWith(path))

    if (!hasAccess) {
      return NextResponse.redirect(new URL(homePage, request.url))
    }
  } catch {
    // Si hay error, dejar pasar (el updateSession ya maneja la auth)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}