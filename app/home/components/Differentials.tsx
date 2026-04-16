'use client'
import { useRef, useEffect } from 'react'
import { Cpu, Globe, TrendingUp, Shield } from 'lucide-react'

const DIFFS = [
  {
    Icon: Cpu,
    title: 'Performance en caja',
    desc: 'El scan en POS resuelve barcode, stock por depósito y precio final en una sola llamada de API. Sin pantallas de carga, sin colas, sin clientes esperando.',
    stat: '< 100ms',
    statLabel: 'respuesta promedio en POS',
  },
  {
    Icon: Globe,
    title: 'Pensado para LATAM',
    desc: 'Facturación con CAE (AFIP) incluida: A/B/C/X + NC/ND. Cuenta corriente de clientes, listas de precio y soporte para precios con inflación.',
    stat: 'Argentina',
    statLabel: 'y en expansión al resto de LATAM',
  },
  {
    Icon: TrendingUp,
    title: 'Escala con tu negocio',
    desc: 'Empezás con una caja y podés llegar a múltiples depósitos, sucursales y equipos sin cambiar de sistema, sin migrar datos, sin reaprender nada.',
    stat: '1 → ∞',
    statLabel: 'cajas y sucursales',
  },
  {
    Icon: Shield,
    title: 'Multi-tenant real',
    desc: 'Cada negocio está completamente aislado. Datos protegidos a nivel de base de datos (Row Level Security). Ningún negocio puede ver datos de otro.',
    stat: '100%',
    statLabel: 'aislamiento de datos',
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
    <section ref={ref} id="differentials" className="py-28 px-6 border-t border-white/[0.05]">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-14 section-fade">
          <p className="text-[#4ade80] text-xs font-semibold uppercase tracking-[0.15em] mb-4">
            Por qué StockOS
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white leading-tight">
            Diseñado para crecer,
            <br />
            no para frenar
          </h2>
          <p className="text-white/45 text-[17px] mt-4 max-w-lg mx-auto leading-relaxed">
            No es solo otro sistema de stock. Es infraestructura para el retail moderno.
          </p>
        </div>

        {/* Cards */}
        <div className="grid md:grid-cols-2 gap-4">
          {DIFFS.map((d, i) => (
            <div
              key={d.title}
              className="flex gap-5 p-6 rounded-2xl border border-white/[0.06] bg-[#131311] hover:border-white/[0.10] transition-all duration-200 section-fade"
              style={{ transitionDelay: `${i * 75}ms` }}
            >
              <div className="shrink-0 w-12 h-12 rounded-xl bg-[#16a34a]/[0.09] border border-[#16a34a]/20 flex items-center justify-center">
                <d.Icon size={20} className="text-[#4ade80]" />
              </div>
              <div className="min-w-0">
                <h3 className="text-white font-semibold text-[17px] mb-2">{d.title}</h3>
                <p className="text-white/40 text-[13.5px] leading-relaxed mb-5">{d.desc}</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-[28px] font-bold text-[#4ade80] font-mono leading-none">
                    {d.stat}
                  </span>
                  <span className="text-white/30 text-xs">{d.statLabel}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
