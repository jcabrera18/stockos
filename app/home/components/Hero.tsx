'use client'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, CheckCircle, TrendingUp } from 'lucide-react'

export function Hero() {
  return (
    <section className="relative flex items-center min-h-screen px-6 pt-16 pb-16 overflow-hidden bg-white">
      {/* Subtle grid */}
      <div className="landing-grid absolute inset-0" />
      {/* Green radial tint top-right */}
      <div className="absolute top-0 right-0 w-[700px] h-[700px] bg-gradient-to-bl from-green-50 via-green-50/50 to-transparent rounded-full -translate-y-1/3 translate-x-1/4 pointer-events-none" />

      <div className="relative max-w-6xl mx-auto w-full">
        <div className="grid lg:grid-cols-2 gap-10 items-center">

          {/* LEFT: Text + CTAs */}
          <div>
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-green-200 bg-green-50 text-green-700 text-xs font-medium mb-8 tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Sistema activo en negocios LATAM
            </div>

            {/* Headline */}
            <h1 className="text-5xl sm:text-6xl font-bold text-gray-900 leading-[1.07] tracking-tight mb-6">
              Gestioná tu<br />
              negocio{' '}
              <span className="text-[#16a34a]">en un<br />solo lugar</span>
            </h1>

            {/* Subheadline */}
            <p className="text-lg text-gray-500 leading-relaxed mb-8 max-w-md">
              Ventas, productos, sucursales y reportes en una plataforma simple, potente y segura.
            </p>

            {/* Pills */}
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-gray-500 mb-10">
              {['Rápido', 'Inteligente', 'Confiable', 'Conectado'].map(t => (
                <span key={t} className="flex items-center gap-1.5">
                  <CheckCircle size={13} className="text-[#16a34a]" />
                  {t}
                </span>
              ))}
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-start gap-3 mb-8">
              <Link
                href="/register"
                className="group inline-flex items-center justify-center gap-2 px-7 py-4 bg-[#16a34a] hover:bg-[#15803d] text-white rounded-xl font-semibold text-base transition-all duration-200 hover:shadow-[0_8px_24px_rgba(22,163,74,0.35)] active:scale-[0.98]"
              >
                Empezar gratis
                <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <a
                href="#features"
                className="inline-flex items-center justify-center gap-2 px-7 py-4 border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-600 hover:text-gray-900 rounded-xl font-medium text-base transition-all duration-200"
              >
                Ver funciones
              </a>
            </div>

            <p className="text-[12px] text-gray-400">
              Sin tarjeta de crédito · Onboarding en menos de 1 hora · Soporte en español
            </p>
          </div>

          {/* RIGHT: Illustration + floating cards */}
          <div className="relative flex justify-center items-end min-h-[560px]">
            {/* Green bg blob */}
            <div className="absolute inset-0 bg-gradient-to-br from-green-50 to-emerald-50/40 rounded-3xl" />

            {/* Floating stats card — top left */}
            <div className="absolute top-8 -left-4 z-20 bg-white rounded-2xl shadow-lg border border-gray-100 p-4 w-52">
              <p className="text-[11px] text-gray-400 font-medium mb-1">Ventas hoy</p>
              <p className="text-2xl font-bold text-gray-900 font-mono leading-none">$284.500</p>
              <div className="flex items-center gap-1 mt-1.5">
                <TrendingUp size={11} className="text-[#16a34a]" />
                <span className="text-[#16a34a] text-xs font-semibold">+12%</span>
                <span className="text-gray-400 text-[11px]">vs ayer</span>
              </div>
              {/* Mini bar chart */}
              <div className="mt-3 flex items-end gap-0.5 h-7">
                {[30,45,35,60,48,72,55,80,65,100].map((h, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-sm ${i === 9 ? 'bg-[#16a34a]' : 'bg-green-100'}`}
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </div>

            {/* Illustration */}
            <div className="relative z-10 pt-6 pb-0">
              <Image
                src="/image_5.png"
                alt="Persona gestionando su negocio con StockOS"
                width={560}
                height={500}
                priority
              />
            </div>

            {/* Floating pill — bottom right */}
            <div className="absolute bottom-10 -right-2 z-20 bg-white rounded-xl shadow-md border border-gray-100 px-4 py-3 min-w-[140px]">
              <p className="text-[11px] text-gray-400">Sucursales activas</p>
              <p className="text-xl font-bold text-gray-900 font-mono leading-tight">3 / 3</p>
              <p className="text-[11px] text-[#16a34a] font-medium">Todo normal</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
