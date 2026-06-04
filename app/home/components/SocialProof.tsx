'use client'
import Image from 'next/image'
import Link from 'next/link'
import { useRef, useEffect } from 'react'
import { Handshake, MessageSquare, Tag, ArrowRight, MessageCircle } from 'lucide-react'

// Hechos verdaderos de la oferta de acceso anticipado — nada inventado.
const FACTS = [
  { value: '1 a 1', label: 'onboarding con vos, por WhatsApp' },
  { value: 'Directo', label: 'hablás con quien hace el producto' },
  { value: 'Sin', label: 'permanencia: cancelás cuando quieras' },
  { value: '< 1h', label: 'para dejarlo configurado y operar' },
]

const REASONS = [
  {
    Icon: Handshake,
    title: 'Te acompañamos uno a uno',
    text: 'No te tiramos un sistema y chau. Te ayudamos a importar tus productos, a migrar del Excel y a configurar tus cajas, paso a paso por WhatsApp.',
  },
  {
    Icon: MessageSquare,
    title: 'Hablás con quien lo construye',
    text: 'Tu uso real moldea el producto. Pedís una función o ves algo que falta, y lo discutimos en serio. Acá tu voz pesa de verdad.',
  },
  {
    Icon: Tag,
    title: 'Tarifa de fundador',
    text: 'Por entrar temprano arrancás con precio de lanzamiento, y lo mantenés mientras sigas siendo cliente. Sin sorpresas cuando crezcamos.',
  },
]

export function SocialProof() {
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
    <section ref={ref} id="early-access" className="py-28 px-6 border-t border-gray-100 bg-white">
      <div className="max-w-6xl mx-auto">

        {/* Honest early-access banner */}
        <div className="flex flex-col md:flex-row items-center gap-8 mb-20 rounded-3xl border border-green-100 bg-gradient-to-br from-green-50 to-emerald-50/50 overflow-hidden section-fade">
          <div className="flex-1 p-8 md:p-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-green-200 bg-white text-green-700 text-xs font-medium mb-5 tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Acceso anticipado
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight mb-4">
              Estamos arrancando con un{' '}
              <span className="text-[#16a34a]">grupo chico de comercios</span>
            </h2>
            <p className="text-gray-600 text-[15px] leading-relaxed mb-7 max-w-md">
              Si entrás ahora, no sos un número de cliente. Te acompañamos personalmente
              y lo que usás en el día a día define lo que construimos. Sé de los primeros.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {FACTS.map((m) => (
                <div key={m.label} className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                  <p className="text-2xl font-bold text-[#16a34a] font-mono leading-none mb-2">
                    {m.value}
                  </p>
                  <p className="text-gray-500 text-[12.5px] leading-snug">{m.label}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="flex-shrink-0 flex justify-center md:justify-end pr-0 md:pr-8">
            <Image
              src="/image_7.webp"
              alt="Negocio conectado con StockOS"
              width={220}
              height={300}
              quality={75}
              sizes="(max-width: 768px) 90vw, 220px"
            />
          </div>
        </div>

        {/* Header */}
        <div className="text-center mb-12 section-fade" style={{ transitionDelay: '120ms' }}>
          <p className="text-[#16a34a] text-xs font-semibold uppercase tracking-[0.15em] mb-4">
            Por qué entrar ahora
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
            Lo que ganás siendo de los primeros
          </h2>
        </div>

        {/* Reasons */}
        <div className="grid md:grid-cols-3 gap-4">
          {REASONS.map((r, i) => (
            <div
              key={r.title}
              className="flex flex-col p-6 rounded-2xl border border-gray-200 bg-white hover:shadow-md transition-all duration-200 section-fade"
              style={{ transitionDelay: `${180 + i * 75}ms` }}
            >
              <div className="w-11 h-11 rounded-xl bg-green-50 border border-green-200 flex items-center justify-center mb-5">
                <r.Icon size={19} className="text-[#16a34a]" />
              </div>
              <h3 className="text-gray-900 font-semibold text-[16px] mb-2.5">{r.title}</h3>
              <p className="text-gray-500 text-[13.5px] leading-relaxed">{r.text}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-3 section-fade" style={{ transitionDelay: '420ms' }}>
          <Link
            href="/register"
            className="group inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-[#16a34a] hover:bg-[#15803d] text-white rounded-xl font-semibold text-[15px] transition-all duration-200 hover:shadow-[0_8px_24px_rgba(22,163,74,0.35)] active:scale-[0.98]"
          >
            Quiero ser de los primeros
            <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
          </Link>
          <a
            href="https://wa.me/5493438445203?text=Hola!%20Quiero%20sumarme%20al%20acceso%20anticipado%20de%20StockOS."
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-7 py-3.5 border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-600 hover:text-gray-900 rounded-xl font-medium text-[15px] transition-all duration-200"
          >
            <MessageCircle size={14} />
            Hablar por WhatsApp
          </a>
        </div>
      </div>
    </section>
  )
}
