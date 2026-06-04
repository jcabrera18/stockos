'use client'
import Image from 'next/image'
import { useRef, useEffect } from 'react'
import { CheckCircle, Zap, Package, Tag, Building2, BarChart3, Receipt } from 'lucide-react'
import { BrowserFrame } from './BrowserFrame'

const FEATURES = [
  {
    Icon: Zap,
    color: '#16a34a',
    bg: 'rgba(22,163,74,0.08)',
    border: 'rgba(22,163,74,0.18)',
    title: 'Caja más rápida, fila más corta',
    desc: 'Escaneás y al instante tenés el precio, el stock y las promos aplicadas. Atendés más clientes en hora pico sin que se te arme la cola ni se te escapen ventas.',
    bullets: ['Múltiples barcodes por producto', 'Precio final calculado al instante', 'Promos aplicadas automáticamente'],
  },
  {
    Icon: Package,
    color: '#2563eb',
    bg: 'rgba(37,99,235,0.08)',
    border: 'rgba(37,99,235,0.18)',
    title: 'Nunca más vendas lo que no tenés',
    desc: 'Sabés cuánto hay y dónde, con alerta antes de quedarte sin stock. Dejás de perder ventas por quiebres y de tener plata inmovilizada en mercadería parada.',
    bullets: ['Stock disponible vs. reservado', 'Transferencias entre depósitos', 'Alertas automáticas de quiebre'],
  },
  {
    Icon: Tag,
    color: '#db2777',
    bg: 'rgba(219,39,119,0.08)',
    border: 'rgba(219,39,119,0.18)',
    title: 'El precio correcto, siempre',
    desc: 'Actualizás una vez y queda bien en todas las cajas y sucursales. Cero precios contradictorios, cero reclamos de clientes, cero ventas por debajo del costo.',
    bullets: ['Listas de precio con margen', 'Reglas por producto y cantidad', 'Promos por marca/categoría/global'],
  },
  {
    Icon: Building2,
    color: '#7c3aed',
    bg: 'rgba(124,58,237,0.08)',
    border: 'rgba(124,58,237,0.18)',
    title: 'Controlá todos tus locales desde el celular',
    desc: 'Cada sucursal con su caja, su stock y su equipo. Vos ves todo consolidado en tiempo real, sin ir en persona ni cruzar planillas a fin de mes.',
    bullets: ['Múltiples cajas por sucursal', 'Roles y permisos granulares', 'Vista consolidada del negocio'],
  },
  {
    Icon: BarChart3,
    color: '#ea580c',
    bg: 'rgba(234,88,12,0.08)',
    border: 'rgba(234,88,12,0.18)',
    title: 'Sabé cuánto ganaste antes de cerrar',
    desc: 'Apertura y cierre de caja con control total, ventas en vivo y gastos registrados. Cerrás el día sabiendo exactamente cómo te fue, sin sacar cuentas a mano.',
    bullets: ['Apertura/cierre por caja', 'Totales en tiempo real', 'Registro de ingresos y gastos'],
  },
  {
    Icon: Receipt,
    color: '#0891b2',
    bg: 'rgba(8,145,178,0.08)',
    border: 'rgba(8,145,178,0.18)',
    title: 'Facturá con ARCA sin dolores de cabeza',
    desc: 'Ticket X, Facturas A/B/C y Notas de Crédito/Débito con CAE incluido. Numeración automática y comprobantes listos para entregar. No peleás más con la AFIP.',
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

        {/* Banner: dashboard showcase */}
        <div className="mb-20 rounded-3xl border border-green-100 bg-gradient-to-br from-green-50 to-emerald-50/50 overflow-hidden section-fade">
          <div className="px-6 sm:px-10 md:px-12 pt-10 md:pt-12 pb-8 text-center">
            <p className="text-[#16a34a] text-xs font-semibold uppercase tracking-[0.15em] mb-4">
              Funciones
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight mb-6 max-w-2xl mx-auto">
              Todo lo que necesitás para{' '}
              <span className="text-[#16a34a]">hacer crecer tu negocio</span>
            </h2>
            <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2">
              {BENEFITS.map(b => (
                <li key={b} className="flex items-center gap-2 text-gray-700 text-[14px]">
                  <CheckCircle size={16} className="text-[#16a34a] shrink-0" />
                  {b}
                </li>
              ))}
            </ul>
          </div>
          {/* Dashboard screenshot */}
          <div className="px-5 sm:px-10 md:px-14">
            <BrowserFrame url="stockos.digital/dashboard" className="shadow-[0_-12px_40px_-24px_rgba(0,0,0,0.25)]">
              <Image
                src="/screenshot-dashboard.png"
                alt="Dashboard de StockOS: ventas y ganancia del día, tendencia, productos más vendidos y métodos de pago"
                width={2000}
                height={1448}
                quality={80}
                sizes="(max-width: 768px) 100vw, 1000px"
                className="w-full h-auto"
              />
            </BrowserFrame>
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
