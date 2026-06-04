'use client'
import Link from 'next/link'
import { useRef, useEffect } from 'react'
import { Upload, Settings, ShoppingCart, ArrowRight } from 'lucide-react'

const STEPS = [
  {
    n: '01',
    Icon: Upload,
    title: 'Cargá tus productos',
    desc: 'Importamos tu catálogo desde Excel o CSV, o lo cargás vos con el lector de códigos. Te acompañamos en todo el proceso por WhatsApp.',
  },
  {
    n: '02',
    Icon: Settings,
    title: 'Configurá cajas y sucursales',
    desc: 'Definís tus sucursales, cajas y el equipo que las atiende. Cada uno con su rol y sus permisos. En menos de 10 minutos lo tenés listo.',
  },
  {
    n: '03',
    Icon: ShoppingCart,
    title: 'Empezá a vender',
    desc: 'Abrís la caja y arrancás a vender el mismo día. El stock se descuenta solo, las promos se aplican solas y la facturación sale sola.',
  },
]

export function HowItWorks() {
  const ref = useRef<HTMLElement>(null)

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
      { threshold: 0.08 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <section ref={ref} id="how" className="py-28 px-6 border-t border-gray-100 bg-white">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-14 section-fade">
          <p className="text-[#16a34a] text-xs font-semibold uppercase tracking-[0.15em] mb-4">
            Cómo funciona
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 leading-tight">
            Empezás a vender hoy,
            <br />
            no la semana que viene
          </h2>
          <p className="text-gray-500 text-[17px] mt-4 max-w-lg mx-auto leading-relaxed">
            Cambiar de sistema da miedo. Por eso lo hicimos en 3 pasos, con una persona ayudándote en cada uno.
          </p>
        </div>

        {/* Steps */}
        <div className="grid md:grid-cols-3 gap-4">
          {STEPS.map((s, i) => (
            <div
              key={s.n}
              className="relative p-7 rounded-2xl border border-gray-200 bg-white hover:shadow-md hover:border-gray-300 transition-all duration-300 section-fade"
              style={{ transitionDelay: `${i * 90}ms` }}
            >
              <div className="flex items-center justify-between mb-5">
                <div className="w-11 h-11 rounded-xl bg-green-50 border border-green-200 flex items-center justify-center">
                  <s.Icon size={19} className="text-[#16a34a]" />
                </div>
                <span className="text-4xl font-bold text-gray-100 font-mono leading-none">{s.n}</span>
              </div>
              <h3 className="text-gray-900 font-semibold text-[17px] mb-2.5">{s.title}</h3>
              <p className="text-gray-500 text-[13.5px] leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-12 text-center section-fade" style={{ transitionDelay: '300ms' }}>
          <Link
            href="/register"
            className="group inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-[#16a34a] hover:bg-[#15803d] text-white rounded-xl font-semibold text-[15px] transition-all duration-200 hover:shadow-[0_8px_24px_rgba(22,163,74,0.35)] active:scale-[0.98]"
          >
            Empezar gratis
            <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
          </Link>
          <p className="text-[12px] text-gray-400 mt-4">
            Sin tarjeta de crédito · Te ayudamos a importar tus productos
          </p>
        </div>
      </div>
    </section>
  )
}
