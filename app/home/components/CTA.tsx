'use client'
import Link from 'next/link'
import { useRef, useEffect } from 'react'
import { ArrowRight, Mail } from 'lucide-react'

export function CTA() {
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
      { threshold: 0.15 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <section ref={ref} className="py-24 px-6 border-t border-white/[0.05]">
      <div className="max-w-4xl mx-auto section-fade">
        <div className="relative overflow-hidden rounded-3xl border border-[#16a34a]/18 p-12 text-center">
          {/* Background */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#16a34a]/[0.09] via-transparent to-transparent" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_0%,rgba(22,163,74,0.08),transparent)]" />
          {/* Top border glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2/3 h-px bg-gradient-to-r from-transparent via-[#16a34a]/50 to-transparent" />

          <div className="relative">
            <p className="text-[#4ade80] text-xs font-semibold uppercase tracking-[0.15em] mb-6">
              Empezá hoy
            </p>
            <h2 className="text-4xl sm:text-5xl font-bold text-white leading-tight mb-6">
              Tu competencia ya tiene<br />
              el sistema que vos necesitás
            </h2>
            <p className="text-white/45 text-[17px] max-w-md mx-auto leading-relaxed mb-10">
              Dejá de perder plata con stock mal contado y precios cargados a mano.
              StockOS está listo para funcionar en menos de una hora.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/register"
                className="group w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 bg-[#16a34a] hover:bg-[#15803d] text-white rounded-xl font-semibold text-[17px] transition-all duration-200 hover:shadow-[0_0_32px_rgba(22,163,74,0.45)] active:scale-[0.98]"
              >
                Crear cuenta gratis
                <ArrowRight size={17} className="group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <a
                href="https://wa.me/5493438445203"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 border border-white/[0.09] hover:border-white/[0.18] hover:bg-white/[0.025] text-white/60 hover:text-white/85 rounded-xl font-medium text-base transition-all duration-200"
              >
                <Mail size={15} />
                Solicitar una demo
              </a>
            </div>

            <p className="text-white/22 text-xs mt-8">
              Sin tarjeta de crédito · Onboarding asistido · Soporte en español
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
