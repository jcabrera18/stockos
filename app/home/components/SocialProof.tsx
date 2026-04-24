'use client'
import Image from 'next/image'
import { useRef, useEffect } from 'react'
import { Star } from 'lucide-react'

const METRICS = [
  { value: '+40%', label: 'más velocidad en caja' },
  { value: '−65%', label: 'errores de stock' },
  { value: '3.000+', label: 'tickets por semana' },
  { value: '< 1h', label: 'para empezar a operar' },
]

const TESTIMONIALS = [
  {
    initials: 'MR',
    name: 'Martín Rodríguez',
    role: 'Dueño · Supermercado El Progreso',
    location: 'Rosario, Santa Fe',
    text: 'Antes tardábamos 3 minutos por cliente en caja. Hoy el escaneo va solo y la caja cierra sola al final del día. El ahorro de tiempo es real y se nota en la facturación.',
  },
  {
    initials: 'CF',
    name: 'Claudia Ferreira',
    role: 'Gerente de Operaciones · Autoservicio Familiar',
    location: 'CABA',
    text: 'Tenemos 2 locales y siempre perdíamos horas cruzando datos a mano. Con StockOS veo los dos en tiempo real desde el celular. No más planillas de Excel.',
  },
  {
    initials: 'DA',
    name: 'Diego Alonso',
    role: 'Dueño · Ferretería Central',
    location: 'Córdoba Capital',
    text: 'La gestión de stock entre el local y el depósito era un caos. Ahora todo entra al sistema en el momento y los errores de inventario bajaron a casi cero.',
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
    <section ref={ref} id="testimonials" className="py-28 px-6 border-t border-gray-100 bg-white">
      <div className="max-w-6xl mx-auto">

        {/* Metrics + illustration banner */}
        <div className="flex flex-col md:flex-row items-end gap-8 mb-20 rounded-3xl border border-gray-200 bg-gray-50 overflow-hidden section-fade">
          <div className="flex-1 p-8 md:p-12">
            <p className="text-[#16a34a] text-xs font-semibold uppercase tracking-[0.15em] mb-6">
              Resultados reales
            </p>
            <div className="grid grid-cols-2 gap-4">
              {METRICS.map((m) => (
                <div key={m.label} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                  <p className="text-3xl font-bold text-[#16a34a] font-mono leading-none mb-2">
                    {m.value}
                  </p>
                  <p className="text-gray-500 text-sm leading-snug">{m.label}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="flex-shrink-0 flex justify-center md:justify-end pr-0 md:pr-8">
            <Image
              src="/image_7.png"
              alt="Negocio conectado con StockOS"
              width={220}
              height={300}
            />
          </div>
        </div>

        {/* Header */}
        <div className="text-center mb-12 section-fade" style={{ transitionDelay: '240ms' }}>
          <p className="text-[#16a34a] text-xs font-semibold uppercase tracking-[0.15em] mb-4">
            Testimonios
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
            Lo que dicen los que ya lo usan
          </h2>
        </div>

        {/* Cards */}
        <div className="grid md:grid-cols-3 gap-4">
          {TESTIMONIALS.map((t, i) => (
            <div
              key={t.name}
              className="flex flex-col p-6 rounded-2xl border border-gray-200 bg-white hover:shadow-md transition-all duration-200 section-fade"
              style={{ transitionDelay: `${300 + i * 75}ms` }}
            >
              <div className="flex gap-0.5 mb-5">
                {Array.from({ length: 5 }).map((_, j) => (
                  <Star key={j} size={13} className="fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="text-gray-600 text-[13.5px] leading-relaxed flex-1 mb-6">
                &ldquo;{t.text}&rdquo;
              </p>
              <div className="flex items-center gap-3 pt-4 border-t border-gray-100">
                <div className="w-9 h-9 rounded-full bg-green-50 border border-green-200 flex items-center justify-center text-[#16a34a] text-xs font-bold shrink-0">
                  {t.initials}
                </div>
                <div className="min-w-0">
                  <p className="text-gray-900 text-sm font-medium truncate">{t.name}</p>
                  <p className="text-gray-400 text-xs truncate">{t.role}</p>
                  <p className="text-gray-400 text-xs">{t.location}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
