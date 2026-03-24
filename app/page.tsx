import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function RootPage() {
  const supabase = await createClient()  // ← agregar await
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', session.user.id)
    .single()

  const role = profile?.role ?? 'cashier'

  if (role === 'owner' || role === 'admin') redirect('/dashboard')
  if (role === 'cashier') redirect('/pos')
  if (role === 'stocker') redirect('/stock')
  if (role === 'seller')  redirect('/orders')

  redirect('/dashboard')
}