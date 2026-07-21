'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { X, Check, Loader2, CheckCircle2, RefreshCw, ExternalLink, Clock, Sparkles, AlertTriangle, MessageCircle } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { api, type ApiError } from '@/lib/api'
import {
  PAID_PLAN_ORDER,
  PLAN_PRICES,
  PLAN_RANK,
  ANNUAL_PAID_MONTHS,
  planTotal,
  type PaidPlan,
} from '@/lib/plans'

// Metadatos visuales de cada plan (alineados con la landing).
const PLAN_META: Record<PaidPlan, { name: string; subtitle: string; perks: string[]; popular?: boolean }> = {
  local:   { name: 'Local',   subtitle: 'Para un local que arranca en serio', perks: ['1 sucursal', '1 caja', 'Hasta 2 usuarios'] },
  negocio: { name: 'Negocio', subtitle: 'Para el negocio que ya vende fuerte', perks: ['1 sucursal', 'Hasta 3 cajas', 'Hasta 10 usuarios'], popular: true },
  empresa: { name: 'Empresa', subtitle: 'Para negocios con varias sucursales', perks: ['Sucursales ilimitadas', 'Cajas ilimitadas', 'Usuarios ilimitados'] },
}

const QR_DURATION_SECS = 25 * 60

// Soporte por WhatsApp cuando el pago quedó pendiente tras "Ya pagué".
const SUPPORT_WA_NUMBER = '5493438558913'

interface PreferenceResponse {
  id:                  string   // payment_request_id
  external_payment_id: string
  checkout_url:        string
  qr_data:             string
}

interface PaymentStatusResponse {
  naveStatus: string
  activated:  boolean
}

interface ValueRecap {
  revenue:        number
  sales_count:    number
  invoices_count: number
}

// Minutos estimados que ahorra cada comprobante emitido desde StockOS vs.
// cargarlo a mano en el portal de AFIP/ARCA (login + datos + CAE).
const AFIP_MINS_PER_INVOICE = 5

function formatARS(n: number): string {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// Convierte minutos a un texto corto tipo "7 h 36 min" / "45 min".
function formatDuration(mins: number): string {
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

// Costo diario aproximado. Anual reparte los 10 meses pagos en 365 días;
// mensual reparte el precio del mes en 30. Sirve para "duele menos" al comercio.
function perDayOf(monthly: number, billing: 'monthly' | 'annual'): number {
  return billing === 'annual'
    ? Math.round((monthly * ANNUAL_PAID_MONTHS) / 365)
    : Math.round(monthly / 30)
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, '0')
  const s = (secs % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function formatDate(d: string | null): string {
  return d ? new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' }) : ''
}

export function PlansPaymentModal({
  open,
  onClose,
  preselectedPlan = null,
  forceSelector = false,
}: {
  open: boolean
  onClose: () => void
  preselectedPlan?: PaidPlan | null
  // Si es true, abre en el selector de planes aunque el negocio ya tenga plan pago
  // (para "actualizar tu plan": mostrar los superiores en vez de cobrar el vigente).
  forceSelector?: boolean
}) {
  const { user, refreshUser } = useAuth()

  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly')
  const [selectedPlan, setSelectedPlan] = useState<PaidPlan | null>(null)

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null)
  const [paymentRequestId, setPaymentRequestId] = useState<string | null>(null)
  const [externalId, setExternalId] = useState<string | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [qrError, setQrError] = useState<string | null>(null)
  const [qrRetry, setQrRetry] = useState(0)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)

  const [manualCheckLoading, setManualCheckLoading] = useState(false)
  const [manualCheckMsg, setManualCheckMsg] = useState<{ type: 'info' | 'error'; text: string } | null>(null)
  const [paymentConfirmed, setPaymentConfirmed] = useState(false)
  // Aviso de downgrade bloqueado (plan activo → plan menor).
  const [downgradeInfo, setDowngradeInfo] = useState<{ from: string; to: string; until: string | null } | null>(null)

  // Recap de valor: lo que StockOS registró en los últimos 30 días.
  const [recap, setRecap] = useState<ValueRecap | null>(null)

  // Vencimiento al abrir: sirve para detectar por polling que el pago se acreditó.
  const periodEndOnOpen = useRef<string | null>(null)

  // Al abrir: si el negocio ya tiene un plan pago, lo mandamos directo a renovar ESE
  // plan (desde el QR puede volver atrás para cambiarlo). Si viene un plan sugerido
  // explícito, ese manda. Un trial/sin plan pago abre en el selector.
  useEffect(() => {
    if (!open) return
    const sub = user?.business?.subscription
    const currentPaid = (PAID_PLAN_ORDER as string[]).includes(sub?.plan ?? '')
      ? (sub!.plan as PaidPlan)
      : null
    setSelectedPlan(preselectedPlan ?? (forceSelector ? null : currentPaid))
    setBilling(sub?.billing_cycle === 'annual' ? 'annual' : 'monthly')
    setDowngradeInfo(null)
    periodEndOnOpen.current = sub?.current_period_end ?? null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Traer el recap de valor al abrir (falla en silencio: es un extra motivacional).
  useEffect(() => {
    if (!open) return
    let cancelled = false
    api.get<ValueRecap>('/api/nave/value-recap')
      .then(r => { if (!cancelled) setRecap(r) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [open])

  const resetQr = useCallback(() => {
    setQrDataUrl(null)
    setCheckoutUrl(null)
    setPaymentRequestId(null)
    setExternalId(null)
    setQrError(null)
    setManualCheckMsg(null)
    setPaymentConfirmed(false)
    setTimeLeft(null)
  }, [])

  // Volver al selector de planes.
  const backToPlans = useCallback(() => {
    setSelectedPlan(null)
    resetQr()
  }, [resetQr])

  // ── Generar QR cuando hay plan elegido ─────────────────────────
  useEffect(() => {
    if (!open || !selectedPlan) { resetQr(); return }

    let cancelled = false
    setQrLoading(true)
    resetQr()

    async function generate() {
      try {
        const res = await api.post<PreferenceResponse>('/api/nave/preference', {
          plan: selectedPlan,
          billing,
        })
        if (cancelled) return
        setCheckoutUrl(res.checkout_url)
        setPaymentRequestId(res.id)
        setExternalId(res.external_payment_id)
        if (res.qr_data) {
          const QRCode = (await import('qrcode')).default
          const dataUrl = await QRCode.toDataURL(res.qr_data, { width: 224, margin: 1 })
          if (!cancelled) setQrDataUrl(dataUrl)
        }
      } catch (err) {
        if (cancelled) return
        const apiErr = err as ApiError
        if (apiErr.status === 409 && apiErr.body?.message) {
          setQrError(String(apiErr.body.message))
        } else {
          setQrError('No se pudo generar el QR. Intentá de nuevo.')
        }
      } finally {
        if (!cancelled) setQrLoading(false)
      }
    }

    generate()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedPlan, billing, qrRetry])

  // ── Polling: refresca el perfil cada 4s buscando la acreditación ──
  useEffect(() => {
    if (!paymentRequestId || paymentConfirmed) return
    const interval = setInterval(() => { refreshUser().catch(() => {}) }, 4000)
    return () => clearInterval(interval)
  }, [paymentRequestId, paymentConfirmed, refreshUser])

  // Detecta el cambio de vencimiento (pago acreditado) tras cada refresh.
  useEffect(() => {
    if (!paymentRequestId || paymentConfirmed) return
    const sub = user?.business?.subscription
    if (!sub) return
    const changed = (sub.current_period_end ?? null) !== periodEndOnOpen.current
    if (changed && sub.status === 'active') {
      setPaymentConfirmed(true)
    }
  }, [user, paymentRequestId, paymentConfirmed])

  // ── Countdown de 25 min ────────────────────────────────────────
  useEffect(() => {
    if (!paymentRequestId || qrError || paymentConfirmed) { setTimeLeft(null); return }
    setTimeLeft(QR_DURATION_SECS)
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev === null || prev <= 1) { clearInterval(interval); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [paymentRequestId, qrError, paymentConfirmed])

  // ── "Ya pagué" ─────────────────────────────────────────────────
  const handleManualCheck = useCallback(async () => {
    if (!paymentRequestId || !externalId || manualCheckLoading) return
    setManualCheckLoading(true)
    setManualCheckMsg(null)
    try {
      const res = await api.post<PaymentStatusResponse>('/api/nave/payment-status', {
        payment_request_id: paymentRequestId,
        external_payment_id: externalId,
      })
      if (res.activated || res.naveStatus === 'APPROVED') {
        await refreshUser()
        setPaymentConfirmed(true)
        return
      }
      if (['EXPIRED', 'DISABLED', 'BLOCKED'].includes(res.naveStatus)) {
        setManualCheckMsg({ type: 'info', text: 'El QR venció. Generando uno nuevo...' })
        setTimeout(() => setQrRetry(r => r + 1), 1500)
        return
      }
      const STATUS_MSG: Record<string, { type: 'info' | 'error'; text: string }> = {
        PENDING:           { type: 'info',  text: 'Tu pago aún no fue acreditado. Esperá unos segundos e intentá de nuevo.' },
        PROCESSED:         { type: 'info',  text: 'El pago se está procesando. En breve se acredita.' },
        FAILURE_PROCESSED: { type: 'error', text: 'El pago fue rechazado. Generá un nuevo QR e intentá con otro medio.' },
      }
      setManualCheckMsg(STATUS_MSG[res.naveStatus] ?? { type: 'info', text: `Estado: ${res.naveStatus}` })
    } catch {
      setManualCheckMsg({ type: 'error', text: 'No se pudo verificar el pago. Intentá de nuevo.' })
    } finally {
      setManualCheckLoading(false)
    }
  }, [paymentRequestId, externalId, manualCheckLoading, refreshUser])

  if (!open) return null

  const total = selectedPlan ? planTotal(selectedPlan, billing) : 0
  const perMonth = selectedPlan ? (billing === 'annual' ? PLAN_PRICES[selectedPlan] : total) : 0

  const sub = user?.business?.subscription
  const currentPlan = sub?.plan ?? null
  const hasPaidPlan = currentPlan ? (PAID_PLAN_ORDER as string[]).includes(currentPlan) : false
  // Suscripción vigente: replica la guarda del backend (solo entonces se bloquea el downgrade).
  const subActive = sub?.status === 'active' && !!sub?.current_period_end && new Date(sub.current_period_end) > new Date()

  // Al elegir un plan: si es un downgrade con suscripción vigente, mostramos el aviso
  // en vez de ir al QR (el backend igual lo bloquearía con 409).
  const pickPlan = (planId: PaidPlan) => {
    if (subActive && hasPaidPlan && PLAN_RANK[planId] < PLAN_RANK[currentPlan!]) {
      setDowngradeInfo({
        from:  PLAN_META[currentPlan as PaidPlan].name,
        to:    PLAN_META[planId].name,
        until: sub?.current_period_end ?? null,
      })
      return
    }
    setDowngradeInfo(null)
    setSelectedPlan(planId)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 text-[var(--text3)] hover:text-[var(--text)] transition-colors"
          aria-label="Cerrar"
        >
          <X size={20} />
        </button>

        {/* ═══ Pago confirmado ═══ */}
        {paymentConfirmed ? (
          <div className="p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--accent-subtle)] mb-5">
              <CheckCircle2 size={32} className="text-[var(--accent)]" />
            </div>
            <h2 className="text-[var(--text)] text-xl font-bold mb-2">¡Pago acreditado!</h2>
            <p className="text-[var(--text3)] text-sm leading-relaxed mb-6">
              Tu suscripción quedó activa. Ya podés seguir usando StockOS sin interrupciones.
            </p>
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold text-sm transition-colors"
            >
              Listo
            </button>
          </div>
        ) : !selectedPlan ? (
          /* ═══ Selector de planes ═══ */
          <div className="p-6 sm:p-8">
            <h2 className="text-[var(--text)] text-xl font-bold mb-1">Elegí tu plan</h2>
            <p className="text-[var(--text3)] text-sm mb-5">Pagá con cualquier billetera virtual o la app de tu banco. Sin tarjetas, sin vueltas.</p>

            {recap && recap.revenue > 0 && (
              <div className="mb-5 rounded-xl border border-[var(--accent)]/25 bg-[var(--accent-subtle)] p-4">
                <p className="text-[var(--text2)] text-xs font-medium mb-3">
                  Lo que hiciste con StockOS en los últimos 30 días
                </p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[var(--text)] font-bold font-mono text-sm leading-none">
                      <span className="text-[var(--text3)] text-xs">$</span>{formatARS(recap.revenue)}
                    </p>
                    <p className="text-[var(--text3)] text-[10px] mt-1">vendido</p>
                  </div>
                  <div className="border-x border-[var(--border)]">
                    <p className="text-[var(--text)] font-bold font-mono text-sm leading-none">{formatARS(recap.sales_count)}</p>
                    <p className="text-[var(--text3)] text-[10px] mt-1">ventas registradas</p>
                  </div>
                  <div>
                    <p className="text-[var(--text)] font-bold font-mono text-sm leading-none">{formatARS(recap.invoices_count)}</p>
                    <p className="text-[var(--text3)] text-[10px] mt-1">facturas AFIP</p>
                  </div>
                </div>
                {recap.invoices_count > 0 && (
                  <p className="flex items-center justify-center gap-1.5 text-[var(--text2)] text-xs mt-3 pt-3 border-t border-[var(--border)] text-center">
                    <Clock size={13} className="text-[var(--accent)] shrink-0" />
                    Te ahorraste <span className="font-semibold text-[var(--text)]">≈ {formatDuration(recap.invoices_count * AFIP_MINS_PER_INVOICE)}</span> de cargar comprobantes a mano en AFIP
                  </p>
                )}
              </div>
            )}

            {/* Toggle mensual / anual */}
            <div className="inline-flex items-center gap-1 p-1 rounded-full bg-[var(--surface2)] border border-[var(--border)] mb-5">
              <button
                onClick={() => setBilling('monthly')}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${billing === 'monthly' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text3)] hover:text-[var(--text)]'}`}
              >
                Mensual
              </button>
              <button
                onClick={() => setBilling('annual')}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${billing === 'annual' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text3)] hover:text-[var(--text)]'}`}
              >
                Anual
                <span className={`text-[10px] font-bold ${billing === 'annual' ? 'text-white/90' : 'text-[var(--accent)]'}`}>2 meses gratis</span>
              </button>
            </div>

            <div className="space-y-3">
              {PAID_PLAN_ORDER.map(planId => {
                const meta = PLAN_META[planId]
                const monthly = PLAN_PRICES[planId]
                const isCurrent = currentPlan === planId
                // El highlight verde sigue al plan actual del cliente; solo si todavía no
                // tiene plan pago resaltamos el "Popular", para no invitar a un downgrade.
                const highlighted = hasPaidPlan ? isCurrent : !!meta.popular
                const showPopular = !hasPaidPlan && !!meta.popular
                const isDowngrade = hasPaidPlan && PLAN_RANK[planId] < PLAN_RANK[currentPlan!]
                return (
                  <button
                    key={planId}
                    onClick={() => pickPlan(planId)}
                    className={`w-full text-left rounded-xl border p-4 transition-all hover:border-[var(--accent)]/60 hover:bg-[var(--surface2)] ${highlighted ? 'border-[var(--accent)]/40 bg-[var(--accent-subtle)]' : 'border-[var(--border)]'} ${isDowngrade ? 'opacity-70' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[var(--text)] font-semibold">{meta.name}</span>
                          {showPopular && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[var(--accent-subtle)] text-[var(--accent)] text-[10px] font-bold uppercase tracking-wide">
                              <Sparkles size={9} /> Popular
                            </span>
                          )}
                          {isCurrent && (
                            <span className="px-1.5 py-0.5 rounded-full bg-[var(--accent)] text-white text-[10px] font-semibold">Tu plan</span>
                          )}
                          {isDowngrade && (
                            <span className="px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] font-semibold">Plan menor</span>
                          )}
                        </div>
                        <p className="text-[var(--text3)] text-xs mt-0.5">{meta.subtitle}</p>
                        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                          {meta.perks.map(p => (
                            <li key={p} className="flex items-center gap-1 text-[var(--text2)] text-[11px]">
                              <Check size={11} className="text-[var(--accent)]" /> {p}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[var(--text)] font-bold font-mono leading-none">
                          <span className="text-[var(--text3)] text-xs">$</span>{formatARS(monthly)}
                        </p>
                        <p className="text-[var(--text3)] text-[10px] mt-1">por mes</p>
                        <p className="text-[var(--accent)] text-[10px] mt-0.5">≈ ${formatARS(perDayOf(monthly, billing))}/día</p>
                        {billing === 'annual' && (
                          <p className="text-[var(--text3)] text-[10px] mt-0.5">${formatARS(monthly * ANNUAL_PAID_MONTHS)}/año</p>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            {downgradeInfo && (
              <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[var(--text)] text-sm font-semibold">Tenés {downgradeInfo.from} activo</p>
                    <p className="text-[var(--text2)] text-xs mt-1 leading-relaxed">
                      Para no perder los días que ya pagaste, podés bajar a {downgradeInfo.to} recién
                      {downgradeInfo.until ? <> a partir del <strong className="text-[var(--text)]">{formatDate(downgradeInfo.until)}</strong></> : ' al vencer tu período actual'}.
                      Hasta entonces seguís con todo lo de {downgradeInfo.from}.
                    </p>
                    <button
                      onClick={() => setDowngradeInfo(null)}
                      className="mt-2 text-amber-600 dark:text-amber-400 hover:opacity-80 text-xs font-semibold transition-opacity"
                    >
                      Entendido
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ═══ QR de pago ═══ */
          <div className="p-6 sm:p-8">
            <button
              onClick={backToPlans}
              className="text-[var(--text3)] hover:text-[var(--text)] text-xs font-medium mb-4 transition-colors"
            >
              ← Cambiar de plan
            </button>

            <div className="text-center">
              <h2 className="text-[var(--text)] text-lg font-bold">
                {PLAN_META[selectedPlan].name} · {billing === 'annual' ? 'Anual' : 'Mensual'}
              </h2>
              <p className="text-[var(--text3)] text-sm mt-0.5">
                <span className="text-[var(--text)] font-mono font-bold">${formatARS(total)}</span>
                {billing === 'annual' && <span className="text-[var(--text3)]"> /año · ${formatARS(perMonth)}/mes</span>}
                {billing === 'monthly' && <span className="text-[var(--text3)]"> /mes</span>}
              </p>
              <p className="text-[var(--accent)] text-xs mt-0.5">
                Menos de ${formatARS(perDayOf(PLAN_PRICES[selectedPlan], billing))} por día
              </p>
              {recap && recap.revenue > 0 && (
                <p className="text-[var(--text3)] text-xs mt-2 max-w-xs mx-auto">
                  Es el{' '}
                  <span className="font-semibold text-[var(--text2)]">
                    {perMonth / recap.revenue < 0.01
                      ? 'menos del 1%'
                      : `${(perMonth / recap.revenue * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`}
                  </span>{' '}
                  de los ${formatARS(recap.revenue)} que vendiste en los últimos 30 días
                </p>
              )}
            </div>

            <div className="mt-5 flex flex-col items-center">
              {qrLoading && (
                <div className="flex flex-col items-center justify-center w-56 h-56 rounded-xl bg-[var(--surface2)] border border-[var(--border)]">
                  <Loader2 size={28} className="text-[var(--text3)] animate-spin" />
                  <p className="text-[var(--text3)] text-xs mt-3">Generando QR...</p>
                </div>
              )}

              {qrError && !qrLoading && (
                <div className="flex flex-col items-center justify-center w-full py-6 px-4 rounded-xl bg-red-500/10 border border-red-500/25 text-center">
                  <p className="text-red-500 text-sm mb-3">{qrError}</p>
                  <button
                    onClick={() => setQrRetry(r => r + 1)}
                    className="inline-flex items-center gap-1.5 text-[var(--text2)] hover:text-[var(--text)] text-xs font-medium"
                  >
                    <RefreshCw size={13} /> Reintentar
                  </button>
                </div>
              )}

              {qrDataUrl && !qrError && (
                <>
                  <div className="p-3 rounded-xl bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrDataUrl} alt="QR de pago" width={224} height={224} />
                  </div>

                  <p className="text-[var(--text3)] text-xs mt-3 text-center max-w-xs">
                    Escaneá el QR con la app de tu banco o cualquier billetera virtual.
                  </p>

                  {timeLeft !== null && timeLeft > 0 && (
                    <div className="flex items-center gap-1.5 mt-2 text-[var(--text3)] text-xs">
                      <Clock size={12} /> El QR vence en <span className="font-mono text-[var(--text)]">{formatTime(timeLeft)}</span>
                    </div>
                  )}

                  {checkoutUrl && (
                    <a
                      href={checkoutUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 mt-3 text-[var(--text3)] hover:text-[var(--text)] text-xs font-medium underline"
                    >
                      Pagar desde este dispositivo <ExternalLink size={12} />
                    </a>
                  )}

                  {manualCheckMsg && (
                    <div className={`mt-4 w-full px-3 py-2 rounded-lg text-xs text-center ${manualCheckMsg.type === 'error' ? 'bg-red-500/10 text-red-500' : 'bg-[var(--surface2)] text-[var(--text2)]'}`}>
                      {manualCheckMsg.text}
                    </div>
                  )}

                  {/* Si tras "Ya pagué" el pago sigue pendiente, ofrecemos enviar el comprobante. */}
                  {manualCheckMsg && (
                    <a
                      href={`https://wa.me/${SUPPORT_WA_NUMBER}?text=${encodeURIComponent(
                        `Hola! Ya pagué mi suscripción de StockOS pero sigue figurando como pendiente. Les envío el comprobante.${externalId ? ` (Pago #${externalId})` : ''}`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface2)] hover:bg-[var(--surface3)] text-[var(--text2)] hover:text-[var(--text)] text-xs font-medium text-center transition-colors"
                    >
                      <MessageCircle size={13} className="shrink-0 text-emerald-500" />
                      Si seguís con problemas, envianos el comprobante por WhatsApp
                    </a>
                  )}

                  <div className="mt-4 w-full flex items-center gap-2">
                    <span className="flex items-center gap-1.5 text-[var(--text3)] text-xs">
                      <Loader2 size={12} className="animate-spin" /> Esperando el pago...
                    </span>
                    <button
                      onClick={handleManualCheck}
                      disabled={manualCheckLoading}
                      className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--surface2)] hover:bg-[var(--surface3)] text-[var(--text)] text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                      {manualCheckLoading ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                      Ya pagué
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
