'use client'
import Image from 'next/image'
import { useRef, useEffect } from 'react'
import { Tag, ShieldCheck, CheckCircle } from 'lucide-react'
import { BrowserFrame } from './BrowserFrame'

const ROWS = [
  {
    Icon: Tag,
    url: 'stockos.digital/productos',
    img: '/screenshot-productos.png',
    alt: 'Ficha de producto en StockOS con costos, precios por lista y stock',
    title: 'Precios por canal, sin pelearte con planillas',
    desc: 'Cargás el costo una vez y StockOS calcula el precio para cada lista —minorista, mayorista, especial, distribuidor— con el margen que vos elegís.',
    bullets: ['Margen sobre costo o precio fijo', 'Stock mínimo con alerta de quiebre', 'Varios códigos de barra por producto'],
  },
  {
    Icon: ShieldCheck,
    url: 'stockos.digital/finanzas',
    img: '/screenshot-finanzas.png',
    alt: 'Panel de finanzas de StockOS con facturación, CAE y tope de monotributo',
    title: 'Tu facturación y tus impuestos, sin sorpresas',
    desc: 'Ves cuánto facturaste con CAE, el desglose por tipo de comprobante y cuánto te queda antes del tope de tu categoría de monotributo. Siempre al día con ARCA.',
    bullets: ['Facturación A/B/C con CAE incluido', 'Control del tope de monotributo', 'Neto, IVA y notas de crédito separados'],
  },
]

export function Showcase() {
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
    <section ref={ref} className="py-28 px-6 border-t border-gray-100 bg-white">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16 section-fade">
          <p className="text-[#16a34a] text-xs font-semibold uppercase tracking-[0.15em] mb-4">
            Así se ve por dentro
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 leading-tight">
            No es un PDF de promesas.
            <br />
            Es el sistema que vas a usar
          </h2>
        </div>

        {/* Rows */}
        <div className="space-y-20 md:space-y-28">
          {ROWS.map((row, i) => (
            <div
              key={row.title}
              className={`flex flex-col gap-8 md:gap-12 items-center ${
                i % 2 === 1 ? 'md:flex-row-reverse' : 'md:flex-row'
              }`}
            >
              {/* Text */}
              <div className="flex-1 section-fade">
                <div className="w-11 h-11 rounded-xl bg-green-50 border border-green-200 flex items-center justify-center mb-5">
                  <row.Icon size={19} className="text-[#16a34a]" />
                </div>
                <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight mb-4">
                  {row.title}
                </h3>
                <p className="text-gray-500 text-[15px] leading-relaxed mb-6 max-w-md">
                  {row.desc}
                </p>
                <ul className="space-y-2.5">
                  {row.bullets.map(b => (
                    <li key={b} className="flex items-center gap-3 text-gray-700 text-[14px]">
                      <CheckCircle size={16} className="text-[#16a34a] shrink-0" />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Screenshot */}
              <div className="flex-1 w-full section-fade" style={{ transitionDelay: '100ms' }}>
                <BrowserFrame url={row.url} className="shadow-[0_24px_60px_-28px_rgba(0,0,0,0.3)]">
                  <Image
                    src={row.img}
                    alt={row.alt}
                    width={2000}
                    height={1448}
                    quality={80}
                    sizes="(max-width: 768px) 100vw, 560px"
                    className="w-full h-auto"
                  />
                </BrowserFrame>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
