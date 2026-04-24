'use client'
import Image from 'next/image'
import Link from 'next/link'
import { useRef, useEffect } from 'react'
import { ArrowRight, MessageCircle } from 'lucide-react'

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
    <section ref={ref} className="py-24 px-6 border-t border-gray-100 bg-white">
      <div className="max-w-5xl mx-auto section-fade">
        {/* overflow-visible para que la imagen pueda sobresalir por abajo */}
        <div className="relative rounded-3xl bg-[#052e16] overflow-hidden">
          {/* Glow */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_20%_50%,rgba(22,163,74,0.18),transparent)]" />
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#16a34a]/40 to-transparent" />

          {/* Illustration — absoluta, anclada abajo a la derecha */}
          <div className="absolute top-1/2 -translate-y-1/2 right-0 hidden md:block pointer-events-none select-none">
            <Image
              src="/image_8.webp"
              alt="Soporte StockOS"
              width={520}
              height={390}
              quality={75}
              sizes="520px"
            />
          </div>

          {/* Text content — con padding-right en desktop para no pisar la imagen */}
          <div className="relative px-10 py-12 md:py-14 md:pr-[500px] lg:pr-[520px]">
            <p className="text-green-400 text-xs font-semibold uppercase tracking-[0.15em] mb-4">
              Empezá hoy
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white leading-tight mb-4">
              Tu competencia ya tiene<br />
              el sistema que vos necesitás
            </h2>
            <p className="text-white/55 text-[15px] leading-relaxed mb-8 max-w-sm">
              Dejá de perder plata con stock mal contado.
              StockOS funciona en menos de una hora.
            </p>

            <div className="flex flex-col sm:flex-row items-start gap-3">
              <Link
                href="/register"
                className="group inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-[#16a34a] hover:bg-[#15803d] text-white rounded-xl font-semibold text-[15px] transition-all duration-200 hover:shadow-[0_8px_24px_rgba(22,163,74,0.5)] active:scale-[0.98]"
              >
                Crear cuenta gratis
                <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <a
                href="https://wa.me/5493438445203"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 border border-white/15 hover:border-white/30 hover:bg-white/[0.05] text-white/65 hover:text-white/90 rounded-xl font-medium text-[15px] transition-all duration-200"
              >
                <MessageCircle size={14} />
                Solicitar una demo
              </a>
            </div>

            <p className="text-white/30 text-xs mt-6">
              Sin tarjeta de crédito · Onboarding asistido · Soporte en español
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
