import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export default async function RootPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) redirect('/login')

  // Usar service role para evitar problemas de RLS con el token del usuario
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: profile } = await admin
    .from('users')
    .select('role')
    .eq('id', session.user.id)
    .single()

  const role = profile?.role ?? 'owner'  // safe default: no redirigir a /pos si falla

  if (role === 'cashier') redirect('/pos')
  if (role === 'seller')  redirect('/orders')
  if (role === 'stocker') redirect('/stock')
  redirect('/dashboard')
}