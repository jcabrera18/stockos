import { createBrowserClient } from '@supabase/ssr'

// Singleton: una sola instancia del cliente para todo el browser.
// Crear múltiples instancias de createBrowserClient genera varias GoTrueClient
// sobre la misma sesión en localStorage, y cada una tiene su propio lock de
// refresh en memoria. Ante un burst de requests con el access token expirado
// (tras un deploy o inactividad larga), todas refrescan a la vez con el mismo
// refresh token (que es de un solo uso): una lo rota y las demás reciben
// "Invalid Refresh Token: Refresh Token Not Found" → falso logout.
// Compartiendo una única instancia, gotrue serializa los refresh y la race desaparece.
let client: ReturnType<typeof createBrowserClient> | undefined

export function createClient() {
  if (client) return client
  client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  return client
}
