'use client'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, CheckCircle } from 'lucide-react'
import { BrowserFrame } from './BrowserFrame'

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
              Hecho en Argentina · Facturación ARCA incluida
            </div>

            {/* Headline */}
            <h1 className="text-5xl sm:text-6xl font-bold text-gray-900 leading-[1.07] tracking-tight mb-6 text-balance">
              Vendé más, cobrá más rápido y controlá tu negocio{' '}
              <span className="text-[#16a34a]">en tiempo real</span>
            </h1>

            {/* Subheadline */}
            <p className="text-lg text-gray-500 leading-relaxed mb-8 max-w-md">
              StockOS reúne ventas, caja, stock y facturación en una sola plataforma
              para que dejes de trabajar a ciegas y tomes decisiones con datos reales.
            </p>

            {/* Pills */}
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-gray-500 mb-10">
              {['Caja más rápida', 'Menos quiebres de stock', 'Control desde el celular', 'ARCA incluida'].map(t => (
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
                href="#how"
                className="inline-flex items-center justify-center gap-2 px-7 py-4 border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-600 hover:text-gray-900 rounded-xl font-medium text-base transition-all duration-200"
              >
                Ver cómo funciona
              </a>
            </div>

            <p className="text-[12px] text-gray-400">
              Sin tarjeta de crédito · Configurás en menos de 1 hora · Soporte humano en español
            </p>
          </div>

          {/* RIGHT: Real product screenshot in a browser frame */}
          <div className="relative flex justify-center lg:justify-end items-center min-h-[480px] lg:min-h-[560px]">
            {/* Soft glow behind */}
            <div className="absolute inset-0 bg-gradient-to-br from-green-50 to-emerald-50/40 rounded-3xl" />

            {/* Browser window */}
            <BrowserFrame
              url="stockos.digital/pos"
              className="relative z-10 w-full max-w-[760px] lg:w-[760px] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.25)] lg:translate-x-6"
            >
              <Image
                src="/screenshot-pos.png"
                alt="POS de StockOS: búsqueda de productos, carrito y total a cobrar en tiempo real"
                width={2000}
                height={1596}
                priority
                quality={80}
                sizes="(max-width: 1024px) 100vw, 760px"
                className="w-full h-auto"
              />
            </BrowserFrame>

            {/* Honest floating accent — el total real del carrito de la captura */}
            <div className="absolute bottom-6 -left-2 sm:-left-3 z-20 bg-white rounded-xl shadow-lg border border-gray-100 px-4 py-3">
              <p className="text-[11px] text-gray-400">Total del carrito</p>
              <p className="text-xl font-bold text-[#16a34a] font-mono leading-tight">$33.100,54</p>
              <p className="text-[11px] text-gray-400">11 items · al instante</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
