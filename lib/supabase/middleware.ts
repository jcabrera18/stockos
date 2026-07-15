import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser() hace una llamada de red a Supabase Auth para verificar el JWT.
  // Si falla por red (offline / Supabase unreachable), hacemos fallback a getSession()
  // que lee de cookies localmente sin red, evitando un redirect a /login espurio.
  let user = null
  try {
    const { data, error } = await supabase.auth.getUser()
    if (!error) user = data.user
  } catch {
    // Fallback offline: leer sesión de cookies sin validación de red
    try {
      const { data } = await supabase.auth.getSession()
      user = data.session?.user ?? null
    } catch { }
  }

  const isProtected = !request.nextUrl.pathname.startsWith('/login')
    && !request.nextUrl.pathname.startsWith('/register')
    && !request.nextUrl.pathname.startsWith('/forgot-password')
    && !request.nextUrl.pathname.startsWith('/reset-password')
    && !request.nextUrl.pathname.startsWith('/auth')
    && !request.nextUrl.pathname.startsWith('/home')
    // Catálogo público compartible — accesible sin login
    && !request.nextUrl.pathname.startsWith('/c/')
    // Scripts del PWA/service worker servidos desde public/: no deben
    // redirigir a /login (rompen el registro del SW: "script behind redirect")
    && request.nextUrl.pathname !== '/sw.js'
    && !request.nextUrl.pathname.startsWith('/swe-worker')
    && request.nextUrl.pathname !== '/'

  if (isProtected && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (request.nextUrl.pathname === '/login' && user) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}