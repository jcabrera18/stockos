'use client'
import { useRef, useEffect } from 'react'
import {
  ShoppingBasket,
  UtensilsCrossed,
  Store,
  Shirt,
  Wrench,
  Pill,
  Laptop,
  PawPrint,
  Hammer,
  Sparkles,
  Watch,
  MoreHorizontal,
} from 'lucide-react'

const INDUSTRIES = [
  { Icon: ShoppingBasket, label: 'Almacén' },
  { Icon: UtensilsCrossed, label: 'Gastronomía' },
  { Icon: Store, label: 'Kiosco' },
  { Icon: Shirt, label: 'Indumentaria' },
  { Icon: Wrench, label: 'Servicios' },
  { Icon: Pill, label: 'Farmacia' },
  { Icon: Laptop, label: 'Electrónica' },
  { Icon: PawPrint, label: 'Petshop' },
  { Icon: Hammer, label: 'Ferretería' },
  { Icon: Sparkles, label: 'Artículos de belleza' },
  { Icon: Watch, label: 'Accesorios' },
  { Icon: MoreHorizontal, label: 'Y muchos más' },
]

export function Industries() {
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
    <section ref={ref} className="py-28 px-6 bg-white">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-14 section-fade">
          <p className="text-[#16a34a] text-xs font-semibold uppercase tracking-[0.15em] mb-4">
            Para tu rubro
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 leading-tight">
            Hecho para tu tipo de comercio
          </h2>
          <p className="text-gray-500 text-[17px] mt-4 max-w-lg mx-auto leading-relaxed">
            Tengas un kiosco de barrio o varios locales, StockOS se adapta a cómo vendés vos.
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {INDUSTRIES.map((ind, i) => (
            <div
              key={ind.label}
              className="group flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border border-gray-100 bg-white hover:border-green-200 hover:bg-green-50/40 hover:shadow-md transition-all duration-300 hover:scale-[1.02] section-fade"
              style={{ transitionDelay: `${i * 40}ms` }}
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-green-50 border border-green-100 group-hover:bg-green-100 transition-colors">
                <ind.Icon size={22} className="text-[#16a34a]" />
              </div>
              <span className="text-gray-700 font-medium text-sm text-center leading-tight">
                {ind.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
