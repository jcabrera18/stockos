'use client'
import { useRef, useEffect } from 'react'
import { Check, X, Minus } from 'lucide-react'

type Cell = 'yes' | 'no' | 'partial'

const ROWS: { label: string; excel: Cell; legacy: Cell; stockos: Cell }[] = [
  { label: 'Stock siempre actualizado, sin contar a mano', excel: 'no', legacy: 'partial', stockos: 'yes' },
  { label: 'Funciona en la compu y en el celular', excel: 'partial', legacy: 'no', stockos: 'yes' },
  { label: 'Facturación ARCA incluida', excel: 'no', legacy: 'partial', stockos: 'yes' },
  { label: 'Ves todos tus locales en un solo lugar', excel: 'no', legacy: 'no', stockos: 'yes' },
  { label: 'Precios y promos que no se contradicen', excel: 'no', legacy: 'partial', stockos: 'yes' },
  { label: 'Alertas antes de quedarte sin stock', excel: 'no', legacy: 'no', stockos: 'yes' },
  { label: 'Backups automáticos todos los días', excel: 'no', legacy: 'partial', stockos: 'yes' },
  { label: 'Soporte humano en español', excel: 'no', legacy: 'partial', stockos: 'yes' },
]

function CellIcon({ value }: { value: Cell }) {
  if (value === 'yes')
    return <Check size={17} className="text-[#16a34a] mx-auto" strokeWidth={2.5} />
  if (value === 'partial')
    return <Minus size={17} className="text-amber-400 mx-auto" strokeWidth={2.5} />
  return <X size={17} className="text-gray-300 mx-auto" strokeWidth={2.5} />
}

export function Comparison() {
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
    <section ref={ref} className="py-28 px-6 border-t border-gray-100 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-14 section-fade">
          <p className="text-[#16a34a] text-xs font-semibold uppercase tracking-[0.15em] mb-4">
            La comparación
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 leading-tight">
            Lo que cambia cuando dejás
            <br />
            el Excel y el sistema viejo
          </h2>
          <p className="text-gray-500 text-[17px] mt-4 max-w-lg mx-auto leading-relaxed">
            La mayoría arranca con una planilla o con un sistema de caja de hace 15 años. Así se compara con StockOS.
          </p>
        </div>

        {/* Table */}
        <div className="section-fade overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          {/* Head */}
          <div className="grid grid-cols-[1.6fr_repeat(3,1fr)] bg-gray-50 border-b border-gray-200">
            <div className="px-5 py-4" />
            <div className="px-2 py-4 text-center text-[12px] sm:text-[13px] font-medium text-gray-400">Excel</div>
            <div className="px-2 py-4 text-center text-[12px] sm:text-[13px] font-medium text-gray-400">Sistema viejo</div>
            <div className="px-2 py-4 text-center text-[12px] sm:text-[13px] font-bold text-[#16a34a]">StockOS</div>
          </div>
          {/* Rows */}
          {ROWS.map((row, i) => (
            <div
              key={row.label}
              className={`grid grid-cols-[1.6fr_repeat(3,1fr)] items-center ${
                i % 2 === 1 ? 'bg-gray-50/40' : 'bg-white'
              }`}
            >
              <div className="px-5 py-3.5 text-[12.5px] sm:text-[13.5px] text-gray-600 leading-snug">
                {row.label}
              </div>
              <div className="px-2 py-3.5"><CellIcon value={row.excel} /></div>
              <div className="px-2 py-3.5"><CellIcon value={row.legacy} /></div>
              <div className="px-2 py-3.5 bg-green-50/40"><CellIcon value={row.stockos} /></div>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-6 mt-6 text-[12px] text-gray-400 section-fade">
          <span className="flex items-center gap-1.5"><Check size={13} className="text-[#16a34a]" /> Sí</span>
          <span className="flex items-center gap-1.5"><Minus size={13} className="text-amber-400" /> A medias / con vueltas</span>
          <span className="flex items-center gap-1.5"><X size={13} className="text-gray-300" /> No</span>
        </div>
      </div>
    </section>
  )
}
