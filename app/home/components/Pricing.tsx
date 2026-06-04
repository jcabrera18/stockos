'use client'
import Link from 'next/link'
import { useRef, useEffect, useState } from 'react'
import { Check, Zap, Sparkles } from 'lucide-react'

const PLANS = [
  {
    id: 'local',
    name: 'Local',
    subtitle: 'Para un local que arranca en serio',
    price: 49990,
    popular: false,
    scale: '1 sucursal · 1 depósito · 1 caja',
    perks: ['1 sucursal · 1 depósito · 1 caja', 'Usuarios y roles ilimitados', 'Soporte por WhatsApp'],
    cta: { label: 'Probar gratis 30 días', href: '/register', primary: false },
  },
  {
    id: 'negocio',
    name: 'Negocio',
    subtitle: 'Para el negocio que ya vende fuerte',
    price: 109990,
    popular: true,
    scale: '1 sucursal · cajas ilimitadas',
    perks: ['1 sucursal · 1 depósito · cajas ilimitadas', 'Usuarios y roles ilimitados', 'Soporte prioritario'],
    cta: { label: 'Probar gratis 30 días', href: '/register', primary: true },
  },
  {
    id: 'cadena',
    name: 'Cadena',
    subtitle: 'Para cadenas y franquicias',
    price: 189990,
    popular: false,
    scale: 'Sucursales y depósitos ilimitados',
    perks: ['Sucursales, depósitos y cajas ilimitados', 'Transferencias entre depósitos', 'Soporte dedicado'],
    cta: { label: 'Hablar con ventas', href: 'https://wa.me/5493438445203', primary: false },
  },
]

// Lo que viene en TODOS los planes — el diferencial es la escala, no las funciones.
const INCLUDED = [
  'POS completo con múltiples barcodes',
  'Facturación ARCA A/B/C/X + NC/ND',
  'Listas de precio y promociones',
  'Gestión de compras y pedidos',
  'Cuenta corriente de clientes',
  'Stock con alertas de quiebre',
  'Ventas, productos y facturas ilimitados',
  'Migración asistida desde tu Excel',
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
    <section ref={ref} id="pricing" className="py-28 px-6 border-t border-gray-100 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8 section-fade">
          <p className="text-[#16a34a] text-xs font-semibold uppercase tracking-[0.15em] mb-4">
            Precios
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 leading-tight">
            Todos los planes incluyen todo.
            <br />
            Pagás solo por cuánto crecés
          </h2>
          <p className="text-gray-500 text-[17px] mt-4 max-w-xl mx-auto leading-relaxed">
            Sin módulos premium ni letras chicas. Lo único que cambia entre planes es
            cuántas <span className="text-gray-700 font-medium">sucursales, cajas y depósitos</span> podés tener.
          </p>
        </div>

        {/* Risk-reversal banner */}
        <div className="rounded-3xl border border-green-200 bg-gradient-to-br from-green-50 to-emerald-50/40 p-6 sm:p-8 mb-10 flex flex-col md:flex-row md:items-center gap-6 section-fade" style={{ transitionDelay: '60ms' }}>
          <div className="flex-1">
            <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2.5">
              30 días para configurar y migrar — gratis
            </h3>
            <p className="text-gray-600 text-[14px] leading-relaxed max-w-2xl">
              Te ayudamos a importar tu catálogo del Excel, configurar ARCA y tus cajas. Probás todo sin tarjeta.{' '}
              <span className="text-gray-900 font-medium">El reloj de pago arranca recién cuando ya estás operando de verdad.</span>
            </p>
          </div>
          <div className="flex items-center gap-4 rounded-2xl bg-white border border-green-100 px-6 py-4 shadow-sm shrink-0 self-start md:self-center">
            <div className="text-center">
              <p className="text-3xl font-bold text-[#16a34a] font-mono leading-none">30</p>
              <p className="text-[11px] text-gray-400 mt-1.5 leading-tight">días para<br />configurar</p>
            </div>
            <span className="text-2xl text-gray-300 font-light">+</span>
            <div className="text-center">
              <p className="text-3xl font-bold text-[#16a34a] font-mono leading-none">$0</p>
              <p className="text-[11px] text-gray-400 mt-1.5 leading-tight">migración<br />asistida</p>
            </div>
          </div>
        </div>

        {/* Differentiator vs competition */}
        <div className="flex justify-center mb-8 section-fade" style={{ transitionDelay: '100ms' }}>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-50 border border-green-200 text-[13px] text-green-700">
            <Zap size={13} />
            La competencia te cobra por cada venta. Nosotros no.
          </div>
        </div>

        {/* Billing toggle */}
        <div className="flex justify-center mb-12 section-fade" style={{ transitionDelay: '140ms' }}>
          <div className="inline-flex items-center gap-1 p-1 rounded-full bg-gray-200 border border-gray-200">
            <button
              onClick={() => setAnnual(false)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                !annual ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Mensual
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                annual ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Anual
              <span className="text-[11px] font-semibold text-[#16a34a] bg-green-100 px-1.5 py-0.5 rounded-full">
                −20%
              </span>
            </button>
          </div>
        </div>

        {/* Plans */}
        <div className="grid md:grid-cols-3 gap-4 items-stretch">
          {PLANS.map((plan, i) => {
            const displayPrice = annual ? Math.round(plan.price * ANNUAL_DISCOUNT) : plan.price
            const perDay = Math.round(displayPrice / 30)
            return (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-2xl border transition-all duration-300 section-fade ${
                  plan.popular
                    ? 'border-[#16a34a] bg-white shadow-[0_4px_32px_rgba(22,163,74,0.15)]'
                    : 'border-gray-200 bg-white hover:shadow-md'
                }`}
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                {/* Popular badge */}
                {plan.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-[#16a34a] text-white text-xs font-semibold tracking-wide whitespace-nowrap shadow-[0_4px_12px_rgba(22,163,74,0.4)]">
                    MÁS ELEGIDO
                  </div>
                )}

                <div className="p-7 flex flex-col h-full">
                  {/* Plan name */}
                  <p className={`text-xs font-semibold uppercase tracking-[0.12em] mb-1 ${
                    plan.popular ? 'text-[#16a34a]' : 'text-gray-400'
                  }`}>
                    {plan.name}
                  </p>
                  <p className="text-gray-500 text-sm mb-6 leading-snug">{plan.subtitle}</p>

                  {/* Price */}
                  <div className="mb-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-gray-400 text-sm font-medium">$</span>
                      <span className="text-4xl font-bold text-gray-900 font-mono leading-none">
                        {formatPrice(displayPrice)}
                      </span>
                      <span className="text-gray-400 text-sm">/mes</span>
                    </div>
                    <p className="text-gray-400 text-xs mt-1.5">
                      ≈ ${formatPrice(perDay)} por día
                      {annual && ` · $${formatPrice(displayPrice * 12)}/año`}
                    </p>
                    {/* Launch price tag */}
                    <span className="inline-flex items-center gap-1.5 mt-3 px-2.5 py-1 rounded-full bg-green-50 border border-green-200 text-[#16a34a] text-[11px] font-medium">
                      <Sparkles size={11} />
                      Precio de lanzamiento · lo mantenés siendo cliente
                    </span>
                  </div>

                  {/* Scale highlight */}
                  <p className="text-[12px] text-gray-500 font-medium mt-4 mb-6 pb-6 border-b border-gray-100">
                    {plan.scale}
                  </p>

                  {/* CTA */}
                  <Link
                    href={plan.cta.href}
                    target={plan.id === 'cadena' ? '_blank' : undefined}
                    rel={plan.id === 'cadena' ? 'noopener noreferrer' : undefined}
                    className={`w-full flex items-center justify-center py-3 rounded-xl text-sm font-semibold transition-all duration-200 mb-6 active:scale-[0.98] ${
                      plan.cta.primary
                        ? 'bg-[#16a34a] hover:bg-[#15803d] text-white hover:shadow-[0_4px_16px_rgba(22,163,74,0.4)]'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200'
                    }`}
                  >
                    {plan.cta.label}
                  </Link>

                  {/* Plan-specific perks */}
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-400 mb-3">
                    Este plan suma
                  </p>
                  <ul className="space-y-2.5 mb-5">
                    {plan.perks.map((p) => (
                      <li key={p} className="flex items-start gap-2.5 text-[13px] text-gray-600">
                        <Check size={13} className="shrink-0 mt-0.5 text-[#16a34a]" />
                        {p}
                      </li>
                    ))}
                  </ul>

                  <p className="text-[12px] text-gray-400 mt-auto pt-2">
                    + todo lo que incluye StockOS ↓
                  </p>
                </div>
              </div>
            )
          })}
        </div>

        {/* Everything included strip */}
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-7 sm:p-8 section-fade" style={{ transitionDelay: '260ms' }}>
          <div className="flex items-center gap-2.5 mb-6">
            <div className="w-7 h-7 rounded-lg bg-green-50 border border-green-200 flex items-center justify-center shrink-0">
              <Check size={15} className="text-[#16a34a]" strokeWidth={2.5} />
            </div>
            <h3 className="font-semibold text-gray-900 text-[16px]">
              Los 3 planes incluyen todo, sin excepciones
            </h3>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3">
            {INCLUDED.map((f) => (
              <div key={f} className="flex items-start gap-2.5 text-[13px] text-gray-600">
                <Check size={13} className="shrink-0 mt-0.5 text-[#16a34a]" />
                {f}
              </div>
            ))}
          </div>
        </div>

        {/* Footer note */}
        <p className="text-center text-gray-400 text-xs mt-8 section-fade" style={{ transitionDelay: '320ms' }}>
          Precios en pesos argentinos · Sin tarjeta de crédito para la prueba · Cancelás cuando quieras · IVA no incluido
        </p>
      </div>
    </section>
  )
}
