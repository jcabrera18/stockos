'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Zap } from 'lucide-react'
import { toast } from 'sonner'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        toast.error(error.message === 'Invalid login credentials'
          ? 'Email o contraseña incorrectos'
          : error.message
        )
        return
      }

      router.push('/dashboard')
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-[var(--accent)] flex items-center justify-center mb-4">
            <Zap size={22} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-[var(--text)]">StockOS</h1>
          <p className="text-sm text-[var(--text3)] mt-1">Gestión de stock para retail</p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleLogin}
          className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-6 space-y-4"
        >
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="tu@email.com"
            required
            autoComplete="email"
          />
          <Input
            label="Contraseña"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
          />
          <Button
            type="submit"
            loading={loading}
            className="w-full mt-2"
            size="lg"
          >
            Ingresar
          </Button>
        </form>

        <p className="text-center text-xs text-[var(--text3)] mt-6">
          StockOS © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
