'use client'
import { useRef, useEffect } from 'react'
import { AlertTriangle, TrendingDown, Clock, Building2 } from 'lucide-react'

const PROBLEMS = [
  {
    Icon: AlertTriangle,
    color: '#f87171',
    bg: 'rgba(248,113,113,0.07)',
    border: 'rgba(248,113,113,0.15)',
    title: 'Stock que siempre miente',
    desc: 'Tu sistema dice que tenés 20 unidades, el depósito tiene 7, y el cliente ya compró 3 que no existen. Diferencias que se acumulan y cuestan plata real.',
  },
  {
    Icon: TrendingDown,
    color: '#fbbf24',
    bg: 'rgba(251,191,36,0.07)',
    border: 'rgba(251,191,36,0.15)',
    title: 'Precios cargados a mano',
    desc: 'Subiste el precio en un lado, te olvidaste en el otro. Un producto con dos precios distintos. Pérdidas por error, reclamos de clientes y tiempo perdido.',
  },
  {
    Icon: Clock,
    color: '#fb923c',
    bg: 'rgba(251,146,60,0.07)',
    border: 'rgba(251,146,60,0.15)',
    title: 'Caja que frena la venta',
    desc: 'El código de barras no responde, el sistema tarda, hay que buscar el precio a mano. La fila crece y los clientes se van. Cada segundo en caja cuesta.',
  },
  {
    Icon: Building2,
    color: '#c084fc',
    bg: 'rgba(192,132,252,0.07)',
    border: 'rgba(192,132,252,0.15)',
    title: 'Sin control por sucursal',
    desc: 'Tenés 2 o 3 locales y no sabés qué pasa en cada uno a menos que vayas en persona. Sin visibilidad, tomás decisiones a ciegas.',
  },
]

export function Problems() {
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
    <section ref={ref} className="py-28 px-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-14 section-fade">
          <p className="text-[#4ade80] text-xs font-semibold uppercase tracking-[0.15em] mb-4">
            El problema
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white leading-tight">
            ¿Te suena familiar?
          </h2>
          <p className="text-white/45 text-[17px] mt-4 max-w-lg mx-auto leading-relaxed">
            La mayoría de los negocios de retail en LATAM arrastran los mismos dolores de siempre.
          </p>
        </div>

        {/* Cards */}
        <div className="grid sm:grid-cols-2 gap-4">
          {PROBLEMS.map((p, i) => (
            <div
              key={p.title}
              className="group p-6 rounded-2xl border transition-all duration-300 hover:scale-[1.01] section-fade"
              style={{
                background: p.bg,
                borderColor: p.border,
                transitionDelay: `${i * 75}ms`,
              }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-5"
                style={{ background: p.bg, border: `1px solid ${p.border}` }}
              >
                <p.Icon size={18} style={{ color: p.color }} />
              </div>
              <h3 className="text-white font-semibold text-[17px] mb-2.5">{p.title}</h3>
              <p className="text-white/45 text-sm leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>

        {/* Bridge */}
        <div className="mt-16 text-center section-fade" style={{ transitionDelay: '300ms' }}>
          <div className="inline-flex items-center gap-3 px-5 py-3 rounded-full border border-[#16a34a]/20 bg-[#16a34a]/[0.06]">
            <span className="text-[#4ade80] text-sm font-medium">
              StockOS resuelve todos estos problemas, en un solo sistema.
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
