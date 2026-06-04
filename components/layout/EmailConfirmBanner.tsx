'use client'
import { useState, useEffect } from 'react'
import { X, MailWarning } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

const DISMISS_KEY = 'email_confirm_dismissed_date'

function wasDismissedToday(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === new Date().toDateString()
  } catch { return false }
}

function dismissToday() {
  try { localStorage.setItem(DISMISS_KEY, new Date().toDateString()) } catch { }
}

export function EmailConfirmBanner() {
  const supabase = createClient()
  const [email, setEmail]     = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let active = true
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!active || !user) return
      // email_confirmed_at vacío = cuenta sin confirmar
      if (user.email_confirmed_at) return
      setEmail(user.email ?? null)
      if (!wasDismissedToday()) setVisible(true)
    })
    return () => { active = false }
  }, [])

  if (!visible || !email) return null

  const handleResend = async () => {
    setSending(true)
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${window.location.origin}/login` },
    })
    setSending(false)
    if (error) toast.error('No pudimos reenviar el correo. Probá en unos minutos.')
    else toast.success('Te reenviamos el correo de confirmación.')
  }

  const handleClose = () => {
    dismissToday()
    setVisible(false)
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between gap-3 px-4 py-2.5 bg-amber-500/90 backdrop-blur-sm text-white text-sm">
      <div className="flex items-center gap-2 min-w-0">
        <MailWarning size={15} className="shrink-0" />
        <span className="truncate">
          Confirmá tu correo <strong>{email}</strong> para asegurar tu cuenta.{' '}
          <button
            onClick={handleResend}
            disabled={sending}
            className="underline font-semibold hover:opacity-90 disabled:opacity-60"
          >
            {sending ? 'Enviando…' : 'Reenviar correo'}
          </button>
        </span>
      </div>
      <button onClick={handleClose} className="shrink-0 opacity-80 hover:opacity-100">
        <X size={15} />
      </button>
    </div>
  )
}
