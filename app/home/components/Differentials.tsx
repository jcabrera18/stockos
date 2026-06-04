'use client'
import { useRef, useEffect } from 'react'
import { Cpu, Globe, TrendingUp, Shield } from 'lucide-react'

const DIFFS = [
  {
    Icon: Cpu,
    title: 'Una caja que no te frena',
    desc: 'Escaneás un producto y al toque aparece el precio, el stock y la promo aplicada. Sin pantallas de carga, sin colas, sin clientes esperando que el sistema reaccione.',
    stat: 'Al instante',
    statLabel: 'precio y stock al escanear',
  },
  {
    Icon: Globe,
    title: 'Pensado para Argentina',
    desc: 'Facturación ARCA con CAE incluida (A/B/C/X + NC/ND), cuenta corriente de clientes, listas de precio y precios que aguantan la inflación. No es un sistema de afuera adaptado a las apuradas.',
    stat: 'ARCA',
    statLabel: 'incluida, sin pagar un módulo aparte',
  },
  {
    Icon: TrendingUp,
    title: 'Crece con tu negocio',
    desc: 'Arrancás con una caja y llegás a varios depósitos, sucursales y equipos sin cambiar de sistema, sin migrar datos y sin volver a aprender a usar todo de cero.',
    stat: '1 → ∞',
    statLabel: 'de una caja a toda una cadena',
  },
  {
    Icon: Shield,
    title: 'Tus datos, solo tuyos',
    desc: 'La información de tu negocio está completamente aislada y protegida. Nadie más la ve, ni siquiera otro comercio que use StockOS. Y se respalda solo, todos los días.',
    stat: 'Backup',
    statLabel: 'automático todos los días',
  },
]

export function Differentials() {
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
    <section ref={ref} id="differentials" className="py-28 px-6 border-t border-gray-100 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-14 section-fade">
          <p className="text-[#16a34a] text-xs font-semibold uppercase tracking-[0.15em] mb-4">
            Por qué StockOS
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 leading-tight">
            Diseñado para crecer,
            <br />
            no para frenar
          </h2>
          <p className="text-gray-500 text-[17px] mt-4 max-w-lg mx-auto leading-relaxed">
            No es solo otro sistema de stock. Es infraestructura para el retail moderno.
          </p>
        </div>

        {/* Cards */}
        <div className="grid md:grid-cols-2 gap-4">
          {DIFFS.map((d, i) => (
            <div
              key={d.title}
              className="flex gap-5 p-6 rounded-2xl border border-gray-200 bg-white hover:shadow-md hover:border-gray-300 transition-all duration-200 section-fade"
              style={{ transitionDelay: `${i * 75}ms` }}
            >
              <div className="shrink-0 w-12 h-12 rounded-xl bg-green-50 border border-green-200 flex items-center justify-center">
                <d.Icon size={20} className="text-[#16a34a]" />
              </div>
              <div className="min-w-0">
                <h3 className="text-gray-900 font-semibold text-[17px] mb-2">{d.title}</h3>
                <p className="text-gray-500 text-[13.5px] leading-relaxed mb-5">{d.desc}</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-[28px] font-bold text-[#16a34a] font-mono leading-none">
                    {d.stat}
                  </span>
                  <span className="text-gray-400 text-xs">{d.statLabel}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
