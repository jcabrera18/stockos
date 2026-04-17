'use client'
import Link from 'next/link'
import { useRef, useEffect, useState } from 'react'
import { Check, X, Zap } from 'lucide-react'

const PLANS = [
  {
    id: 'local',
    name: 'Local',
    subtitle: 'Para arrancar sin complicaciones',
    price: 49999,
    priceOriginal: 64999,
    popular: false,
    highlight: '1 sucursal · 1 depósito · 1 caja',
    cta: { label: 'Probar gratis 10 días', href: '/register', primary: false },
    features: [
      { text: 'Usuarios ilimitados', ok: true },
      { text: 'Gestión de usuarios y roles', ok: true },
      { text: '1 sucursal · 1 depósito · 1 caja', ok: true },
      { text: 'Ventas y productos ilimitados', ok: true },
      { text: 'POS completo con barcodes', ok: true },
      { text: 'Facturación Ticket X', ok: true },
      { text: 'Stock: alertas y movimientos', ok: true },
      { text: 'Cuenta corriente de clientes', ok: true },
      { text: 'Facturación ARCA A / B / C / X + NC/ND', ok: false },
      { text: 'Listas de precio y promociones', ok: false },
      { text: 'Gestión de compras y pedidos', ok: false },
      { text: 'Múltiples sucursales y depósitos', ok: false },
    ],
  },
  {
    id: 'negocio',
    name: 'Negocio',
    subtitle: 'Para negocios que ya venden fuerte',
    price: 109999,
    priceOriginal: 139999,
    popular: true,
    highlight: '1 sucursal · 1 depósito · cajas ilimitadas',
    cta: { label: 'Probar gratis 10 días', href: '/register', primary: true },
    features: [
      { text: 'Usuarios ilimitados', ok: true },
      { text: 'Gestión de usuarios y roles', ok: true },
      { text: '1 sucursal · 1 depósito · cajas ilimitadas', ok: true },
      { text: 'Ventas y productos ilimitados', ok: true },
      { text: 'POS completo con barcodes', ok: true },
      { text: 'Facturación ARCA A / B / C / X + NC/ND', ok: true },
      { text: 'Stock: alertas y movimientos', ok: true },
      { text: 'Cuenta corriente de clientes', ok: true },
      { text: 'Listas de precio y promociones', ok: true },
      { text: 'Gestión de compras y pedidos', ok: true },
      { text: 'Soporte prioritario', ok: true },
      { text: 'Múltiples sucursales y depósitos', ok: false },
    ],
  },
  {
    id: 'cadena',
    name: 'Cadena',
    subtitle: 'Para cadenas y franquicias',
    price: 189999,
    priceOriginal: 244999,
    popular: false,
    highlight: 'Sucursales · depósitos · cajas ilimitadas',
    cta: { label: 'Hablar con ventas', href: 'https://wa.me/5493438445203', primary: false },
    features: [
      { text: 'Usuarios ilimitados', ok: true },
      { text: 'Gestión de usuarios y roles', ok: true },
      { text: 'Sucursales, depósitos y cajas ilimitadas', ok: true },
      { text: 'Ventas y productos ilimitados', ok: true },
      { text: 'POS completo con barcodes', ok: true },
      { text: 'Facturación ARCA A / B / C / X + NC/ND', ok: true },
      { text: 'Stock: alertas y movimientos', ok: true },
      { text: 'Cuenta corriente de clientes', ok: true },
      { text: 'Listas de precio y promociones', ok: true },
      { text: 'Gestión de compras y pedidos', ok: true },
      { text: 'Transferencias entre depósitos', ok: true },
      { text: 'Soporte dedicado', ok: true },
    ],
  },
]

const ANNUAL_DISCOUNT = 0.80

function formatPrice(n: number) {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export function Pricing() {
  const ref = useRef<HTMLElement>(null)
  const [annual, setAnnual] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.setAttribute('data-visible', '')
          observer.disconnect()
        }
      },
      { threshold: 0.05 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <section ref={ref} id="pricing" className="py-28 px-6 border-t border-white/[0.05]">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-4 section-fade">
          <p className="text-[#4ade80] text-xs font-semibold uppercase tracking-[0.15em] mb-4">
            Precios
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white leading-tight">
            Pagás por sucursales,
            <br />
            no por transacciones
          </h2>
          <p className="text-white/45 text-[17px] mt-4 max-w-xl mx-auto leading-relaxed">
            Ventas, facturas y productos <span className="text-white/70 font-medium">ilimitados</span> en todos los planes.
            Sin sorpresas a fin de mes.
          </p>
        </div>

        {/* Differentiator vs competition */}
        <div className="flex justify-center mb-8 section-fade" style={{ transitionDelay: '80ms' }}>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#16a34a]/[0.08] border border-[#16a34a]/20 text-[13px] text-[#4ade80]">
            <Zap size={13} />
            La competencia te cobra por cada venta. Nosotros no.
          </div>
        </div>

        {/* Billing toggle */}
        <div className="flex justify-center mb-12 section-fade" style={{ transitionDelay: '120ms' }}>
          <div className="inline-flex items-center gap-3 p-1 rounded-full bg-white/[0.04] border border-white/[0.08]">
            <button
              onClick={() => setAnnual(false)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                !annual ? 'bg-white/[0.10] text-white' : 'text-white/40 hover:text-white/60'
              }`}
            >
              Mensual
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                annual ? 'bg-white/[0.10] text-white' : 'text-white/40 hover:text-white/60'
              }`}
            >
              Anual
              <span className="text-[11px] font-semibold text-[#4ade80] bg-[#16a34a]/15 px-1.5 py-0.5 rounded-full">
                −20%
              </span>
            </button>
          </div>
        </div>

        {/* Plans */}
        <div className="grid md:grid-cols-3 gap-4 items-stretch">
          {PLANS.map((plan, i) => {
            const displayPrice = annual ? Math.round(plan.price * ANNUAL_DISCOUNT) : plan.price
            const displayOriginal = annual ? Math.round(plan.priceOriginal * ANNUAL_DISCOUNT) : plan.priceOriginal
            return (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-2xl border transition-all duration-300 section-fade ${
                  plan.popular
                    ? 'border-[#16a34a]/40 bg-[#16a34a]/[0.04] shadow-[0_0_40px_rgba(22,163,74,0.12)]'
                    : 'border-white/[0.07] bg-[#131311]'
                }`}
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                {/* Popular badge */}
                {plan.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-[#16a34a] text-white text-xs font-semibold tracking-wide whitespace-nowrap shadow-[0_0_16px_rgba(22,163,74,0.5)]">
                    MÁS ELEGIDO
                  </div>
                )}

                <div className="p-7">
                  {/* Plan name */}
                  <p className={`text-xs font-semibold uppercase tracking-[0.12em] mb-1 ${
                    plan.popular ? 'text-[#4ade80]' : 'text-white/40'
                  }`}>
                    {plan.name}
                  </p>
                  <p className="text-white/50 text-sm mb-6 leading-snug">{plan.subtitle}</p>

                  {/* Price */}
                  <div className="mb-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-white/35 text-sm font-medium">$</span>
                      <span className="text-4xl font-bold text-white font-mono leading-none">
                        {formatPrice(displayPrice)}
                      </span>
                      <span className="text-white/35 text-sm">/mes</span>
                    </div>
                    {annual && (
                      <p className="text-white/40 text-xs mt-1">
                        ${formatPrice(displayPrice * 12)}/año · facturado anualmente
                      </p>
                    )}
                    <p className="text-white/25 text-xs mt-1 line-through">
                      Precio normal: ${formatPrice(displayOriginal)}/mes
                    </p>
                  </div>

                  {/* Highlight tag */}
                  <p className="text-[11.5px] text-white/35 mt-4 mb-6 pb-6 border-b border-white/[0.06]">
                    {plan.highlight}
                  </p>

                  {/* CTA */}
                  <Link
                    href={plan.cta.href}
                    target={plan.id === 'cadena' ? '_blank' : undefined}
                    rel={plan.id === 'cadena' ? 'noopener noreferrer' : undefined}
                    className={`w-full flex items-center justify-center py-3 rounded-xl text-sm font-semibold transition-all duration-200 mb-6 active:scale-[0.98] ${
                      plan.cta.primary
                        ? 'bg-[#16a34a] hover:bg-[#15803d] text-white hover:shadow-[0_0_20px_rgba(22,163,74,0.4)]'
                        : 'bg-white/[0.06] hover:bg-white/[0.10] text-white/80 hover:text-white border border-white/[0.08]'
                    }`}
                  >
                    {plan.cta.label}
                  </Link>

                  {/* Features */}
                  <ul className="space-y-2.5">
                    {plan.features.map((f) => (
                      <li key={f.text} className={`flex items-start gap-2.5 text-[13px] ${
                        f.ok ? 'text-white/65' : 'text-white/22'
                      }`}>
                        {f.ok
                          ? <Check size={13} className="shrink-0 mt-0.5 text-[#4ade80]" />
                          : <X size={13} className="shrink-0 mt-0.5 text-white/20" />
                        }
                        {f.text}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer note */}
        <p className="text-center text-white/25 text-xs mt-8 section-fade" style={{ transitionDelay: '320ms' }}>
          Precios en pesos argentinos · No se requiere tarjeta de crédito para la prueba gratuita · IVA no incluido
        </p>
      </div>
    </section>
  )
}
