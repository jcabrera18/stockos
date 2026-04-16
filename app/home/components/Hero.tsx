'use client'
import Link from 'next/link'
import { ArrowRight, CheckCircle } from 'lucide-react'

const MOCK_STATS = [
  { label: 'Ventas hoy', value: '$1.247.800', change: '+12% vs ayer', up: true },
  { label: 'Tickets emitidos', value: '203', change: '+8% vs ayer', up: true },
  { label: 'Stock crítico', value: '4 alertas', change: 'Revisar ahora', up: false },
  { label: 'Sucursales activas', value: '3 / 3', change: 'Todo normal', up: true },
]

const MOCK_ROWS = [
  { op: 'Venta #4821', sub: 'Caja 1 — Efectivo', amount: '+$3.450', time: 'hace 2 min', positive: true },
  { op: 'Venta #4820', sub: 'Caja 2 — Débito', amount: '+$8.200', time: 'hace 5 min', positive: true },
  { op: 'Ajuste stock', sub: 'Repositor — Depósito B', amount: '−12 un.', time: 'hace 8 min', positive: false },
  { op: 'Venta #4819', sub: 'Caja 1 — Cta. Cte.', amount: '+$2.180', time: 'hace 11 min', positive: true },
]

export function Hero() {
  return (
    <section className="relative flex flex-col items-center justify-center min-h-screen px-6 pt-24 pb-20 text-center overflow-hidden">
      {/* Background layers */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_55%_at_50%_-5%,rgba(22,163,74,0.11),transparent_65%)]" />
      <div className="landing-grid absolute inset-0" />

      {/* Badge */}
      <div className="relative inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[#16a34a]/25 bg-[#16a34a]/[0.08] text-[#4ade80] text-xs font-medium mb-8 tracking-wide">
        <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] animate-pulse" />
        Sistema activo en negocios LATAM
      </div>

      {/* Headline */}
      <h1 className="relative max-w-3xl text-5xl sm:text-6xl md:text-[68px] font-bold text-white leading-[1.07] tracking-tight mb-6">
        Tu negocio,{' '}
        <br className="hidden sm:block" />
        <span className="bg-gradient-to-br from-[#4ade80] to-[#16a34a] bg-clip-text text-transparent">
          sin caos ni pérdidas
        </span>
      </h1>

      {/* Subheadline */}
      <p className="relative max-w-[540px] text-lg sm:text-[19px] text-white/50 leading-relaxed mb-10">
        StockOS unifica stock, precios, ventas y caja para supermercados,
        autoservicios y ferreterías en Argentina y LATAM.
        Desde una caja hasta una cadena completa.
      </p>

      {/* CTAs */}
      <div className="relative flex flex-col sm:flex-row items-center justify-center gap-3 mb-10">
        <Link
          href="/register"
          className="group w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-4 bg-[#16a34a] hover:bg-[#15803d] text-white rounded-xl font-semibold text-base transition-all duration-200 hover:shadow-[0_0_28px_rgba(22,163,74,0.45)] active:scale-[0.98]"
        >
          Empezar gratis
          <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
        </Link>
        <a
          href="#features"
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-4 border border-white/[0.09] hover:border-white/[0.18] hover:bg-white/[0.025] text-white/65 hover:text-white/90 rounded-xl font-medium text-base transition-all duration-200"
        >
          Ver funciones
        </a>
      </div>

      {/* Trust */}
      <div className="relative flex flex-wrap justify-center gap-x-6 gap-y-2 text-[13px] text-white/30 mb-20">
        {['Sin tarjeta de crédito', 'Onboarding en menos de 1 hora', 'Soporte en español'].map(t => (
          <span key={t} className="flex items-center gap-1.5">
            <CheckCircle size={12} className="text-[#4ade80]" />
            {t}
          </span>
        ))}
      </div>

      {/* Dashboard mockup */}
      <div className="relative w-full max-w-5xl mx-auto">
        <div className="relative rounded-2xl border border-white/[0.07] bg-[#131311] shadow-[0_40px_100px_rgba(0,0,0,0.65)] overflow-hidden">
          {/* Window chrome */}
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/[0.05] bg-[#1a1a18]">
            <div className="flex gap-1.5">
              <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
              <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
              <span className="w-3 h-3 rounded-full bg-[#28c840]" />
            </div>
            <div className="flex-1 mx-4 h-[22px] bg-[#242422] rounded-md flex items-center px-3 gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full border border-white/15" />
              <span className="text-[11px] text-white/22 font-mono tracking-tight">
                stockos.digital/dashboard
              </span>
            </div>
          </div>

          {/* Content */}
          <div className="p-5 space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {MOCK_STATS.map(s => (
                <div key={s.label} className="bg-[#1c1c1a] rounded-xl p-4 border border-white/[0.04]">
                  <p className="text-white/30 text-[11px] font-medium uppercase tracking-wider mb-2">
                    {s.label}
                  </p>
                  <p className="text-white font-bold text-[18px] font-mono leading-none mb-1.5">
                    {s.value}
                  </p>
                  <p className={`text-[11px] ${s.up ? 'text-[#4ade80]' : 'text-amber-400'}`}>
                    {s.change}
                  </p>
                </div>
              ))}
            </div>

            {/* Activity table */}
            <div className="bg-[#1c1c1a] rounded-xl border border-white/[0.04] overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04]">
                <span className="text-white/45 text-xs font-medium">Actividad reciente</span>
                <span className="text-[#4ade80] text-[11px] cursor-pointer hover:opacity-80">
                  Ver todos →
                </span>
              </div>
              {MOCK_ROWS.map((row, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-4 py-3 border-b border-white/[0.03] last:border-0"
                >
                  <div>
                    <p className="text-white/75 text-[13px] font-medium">{row.op}</p>
                    <p className="text-white/28 text-[11px] mt-0.5">{row.sub}</p>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-[13px] font-mono font-semibold ${
                        row.positive ? 'text-[#4ade80]' : 'text-amber-400'
                      }`}
                    >
                      {row.amount}
                    </p>
                    <p className="text-white/22 text-[11px] mt-0.5">{row.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Glow beneath mockup */}
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-3/5 h-16 bg-[#16a34a]/[0.08] blur-3xl rounded-full pointer-events-none" />
      </div>
    </section>
  )
}
