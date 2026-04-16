'use client'
import { useRef, useEffect } from 'react'
import { Zap, Package, Tag, Building2, BarChart3, Receipt } from 'lucide-react'

const FEATURES = [
  {
    Icon: Zap,
    color: '#4ade80',
    bg: 'rgba(74,222,128,0.07)',
    border: 'rgba(74,222,128,0.15)',
    title: 'POS ultrarrápido',
    desc: 'Escaneás un código y en milisegundos tenés precio actualizado, stock disponible y promociones activas. Sin esperas, sin fricciones.',
    bullets: ['Múltiples barcodes por producto', 'Precio final calculado al instante', 'Promos aplicadas automáticamente'],
  },
  {
    Icon: Package,
    color: '#60a5fa',
    bg: 'rgba(96,165,250,0.07)',
    border: 'rgba(96,165,250,0.15)',
    title: 'Stock real por depósito',
    desc: 'Sabés exactamente cuánto hay, dónde está y cuánto está comprometido en pedidos. Alertas de quiebre antes de que sea problema.',
    bullets: ['Stock disponible vs. reservado', 'Transferencias entre depósitos', 'Alertas automáticas de quiebre'],
  },
  {
    Icon: Tag,
    color: '#f472b6',
    bg: 'rgba(244,114,182,0.07)',
    border: 'rgba(244,114,182,0.15)',
    title: 'Precios y promociones',
    desc: 'Listas de precio por canal, reglas por producto o cantidad. Promociones por marca, categoría o global. Siempre el precio correcto.',
    bullets: ['Listas de precio con margen', 'Reglas por producto y cantidad', 'Promos por marca/categoría/global'],
  },
  {
    Icon: Building2,
    color: '#a78bfa',
    bg: 'rgba(167,139,250,0.07)',
    border: 'rgba(167,139,250,0.15)',
    title: 'Multi-sucursal de verdad',
    desc: 'Cada sucursal con sus cajas, su stock y su equipo. Vos ves todo consolidado. No hay sync manual ni parches.',
    bullets: ['Múltiples cajas por sucursal', 'Roles y permisos granulares', 'Vista consolidada del negocio'],
  },
  {
    Icon: BarChart3,
    color: '#fb923c',
    bg: 'rgba(251,146,60,0.07)',
    border: 'rgba(251,146,60,0.15)',
    title: 'Finanzas y caja',
    desc: 'Apertura y cierre con control total. Dashboard de ventas en tiempo real. Gastos registrados. Todo en un solo lugar.',
    bullets: ['Apertura/cierre por caja', 'Totales en tiempo real', 'Registro de ingresos y gastos'],
  },
  {
    Icon: Receipt,
    color: '#34d399',
    bg: 'rgba(52,211,153,0.07)',
    border: 'rgba(52,211,153,0.15)',
    title: 'Facturación completa',
    desc: 'Ticket X, Facturas A/B/C, Notas de Crédito y Débito. Numeración automática y control de comprobantes para Argentina.',
    bullets: ['Ticket X → Factura A/B/C', 'Notas de crédito y débito', 'Secuencias por tipo de comprobante'],
  },
]

export function Features() {
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
      { threshold: 0.05 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <section ref={ref} id="features" className="py-28 px-6 border-t border-white/[0.05]">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-14 section-fade">
          <p className="text-[#4ade80] text-xs font-semibold uppercase tracking-[0.15em] mb-4">
            Funciones
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white leading-tight">
            Todo lo que necesitás,
            <br />
            en un solo sistema
          </h2>
          <p className="text-white/45 text-[17px] mt-4 max-w-xl mx-auto leading-relaxed">
            Diseñado específicamente para el retail en Argentina y LATAM.
            Sin funciones que no usás, sin nada que te falte.
          </p>
        </div>

        {/* Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className="group p-6 rounded-2xl border bg-[#131311] hover:bg-[#161614] transition-all duration-300 section-fade"
              style={{
                borderColor: 'rgba(255,255,255,0.06)',
                transitionDelay: `${i * 55}ms`,
              }}
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center mb-5"
                style={{ background: f.bg, border: `1px solid ${f.border}` }}
              >
                <f.Icon size={19} style={{ color: f.color }} />
              </div>
              <h3 className="text-white font-semibold text-[17px] mb-2.5">{f.title}</h3>
              <p className="text-white/40 text-[13.5px] leading-relaxed mb-5">{f.desc}</p>
              <ul className="space-y-2">
                {f.bullets.map(b => (
                  <li key={b} className="flex items-start gap-2 text-[12.5px] text-white/35">
                    <span style={{ color: f.color }} className="mt-px leading-none text-base">·</span>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
