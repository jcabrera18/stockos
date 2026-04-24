'use client'
import Image from 'next/image'
import { useRef, useEffect } from 'react'
import { CheckCircle, Zap, Package, Tag, Building2, BarChart3, Receipt } from 'lucide-react'

const FEATURES = [
  {
    Icon: Zap,
    color: '#16a34a',
    bg: 'rgba(22,163,74,0.08)',
    border: 'rgba(22,163,74,0.18)',
    title: 'POS ultrarrápido',
    desc: 'Escaneás un código y en milisegundos tenés precio actualizado, stock disponible y promociones activas. Sin esperas, sin fricciones.',
    bullets: ['Múltiples barcodes por producto', 'Precio final calculado al instante', 'Promos aplicadas automáticamente'],
  },
  {
    Icon: Package,
    color: '#2563eb',
    bg: 'rgba(37,99,235,0.08)',
    border: 'rgba(37,99,235,0.18)',
    title: 'Stock real por depósito',
    desc: 'Sabés exactamente cuánto hay, dónde está y cuánto está comprometido en pedidos. Alertas de quiebre antes de que sea problema.',
    bullets: ['Stock disponible vs. reservado', 'Transferencias entre depósitos', 'Alertas automáticas de quiebre'],
  },
  {
    Icon: Tag,
    color: '#db2777',
    bg: 'rgba(219,39,119,0.08)',
    border: 'rgba(219,39,119,0.18)',
    title: 'Precios y promociones',
    desc: 'Listas de precio por canal, reglas por producto o cantidad. Promociones por marca, categoría o global. Siempre el precio correcto.',
    bullets: ['Listas de precio con margen', 'Reglas por producto y cantidad', 'Promos por marca/categoría/global'],
  },
  {
    Icon: Building2,
    color: '#7c3aed',
    bg: 'rgba(124,58,237,0.08)',
    border: 'rgba(124,58,237,0.18)',
    title: 'Multi-sucursal de verdad',
    desc: 'Cada sucursal con sus cajas, su stock y su equipo. Vos ves todo consolidado. No hay sync manual ni parches.',
    bullets: ['Múltiples cajas por sucursal', 'Roles y permisos granulares', 'Vista consolidada del negocio'],
  },
  {
    Icon: BarChart3,
    color: '#ea580c',
    bg: 'rgba(234,88,12,0.08)',
    border: 'rgba(234,88,12,0.18)',
    title: 'Finanzas y caja',
    desc: 'Apertura y cierre con control total. Dashboard de ventas en tiempo real. Gastos registrados. Todo en un solo lugar.',
    bullets: ['Apertura/cierre por caja', 'Totales en tiempo real', 'Registro de ingresos y gastos'],
  },
  {
    Icon: Receipt,
    color: '#0891b2',
    bg: 'rgba(8,145,178,0.08)',
    border: 'rgba(8,145,178,0.18)',
    title: 'Facturación completa',
    desc: 'Ticket X, Facturas A/B/C, Notas de Crédito y Débito. Numeración automática y control de comprobantes para Argentina.',
    bullets: ['Ticket X → Factura A/B/C', 'Notas de crédito y débito', 'Secuencias por tipo de comprobante'],
  },
]

const BENEFITS = [
  'Controlá tu stock',
  'Tomá mejores decisiones',
  'Ahorrá tiempo y dinero',
  'Accedé desde cualquier lugar',
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
    <section ref={ref} id="features" className="py-28 px-6 border-t border-gray-100 bg-white">
      <div className="max-w-6xl mx-auto">

        {/* Banner: illustration + benefits */}
        <div className="flex flex-col md:flex-row items-center gap-8 mb-20 rounded-3xl border border-green-100 bg-gradient-to-br from-green-50 to-emerald-50/50 overflow-hidden section-fade">
          <div className="flex-1 p-8 md:p-12">
            <p className="text-[#16a34a] text-xs font-semibold uppercase tracking-[0.15em] mb-4">
              Funciones
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight mb-6">
              Todo lo que necesitás para{' '}
              <span className="text-[#16a34a]">hacer crecer tu negocio</span>
            </h2>
            <ul className="space-y-3">
              {BENEFITS.map(b => (
                <li key={b} className="flex items-center gap-3 text-gray-700 text-[15px]">
                  <CheckCircle size={18} className="text-[#16a34a] shrink-0" />
                  {b}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex-shrink-0 flex justify-center md:justify-end pr-0 md:pr-8">
            <Image
              src="/image_6.png"
              alt="Gestión inteligente con StockOS"
              width={280}
              height={320}
            />
          </div>
        </div>

        {/* Header */}
        <div className="text-center mb-14 section-fade" style={{ transitionDelay: '100ms' }}>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 leading-tight">
            Todo lo que necesitás,
            <br />
            en un solo sistema
          </h2>
          <p className="text-gray-500 text-[17px] mt-4 max-w-xl mx-auto leading-relaxed">
            Diseñado específicamente para el retail en Argentina y LATAM.
            Sin funciones que no usás, sin nada que te falte.
          </p>
        </div>

        {/* Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className="group p-6 rounded-2xl border border-gray-200 bg-white hover:shadow-md hover:border-gray-300 transition-all duration-300 section-fade"
              style={{ transitionDelay: `${150 + i * 55}ms` }}
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center mb-5"
                style={{ background: f.bg, border: `1px solid ${f.border}` }}
              >
                <f.Icon size={19} style={{ color: f.color }} />
              </div>
              <h3 className="text-gray-900 font-semibold text-[17px] mb-2.5">{f.title}</h3>
              <p className="text-gray-500 text-[13.5px] leading-relaxed mb-5">{f.desc}</p>
              <ul className="space-y-2">
                {f.bullets.map(b => (
                  <li key={b} className="flex items-start gap-2 text-[12.5px] text-gray-400">
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
