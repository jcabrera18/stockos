'use client'
import { useState } from 'react'
import { Plus, Minus } from 'lucide-react'

const FAQS = [
  {
    q: '¿Cuánto tiempo tarda el onboarding?',
    a: 'Menos de una hora en la mayoría de los casos. Cargás tus productos (o te ayudamos a importarlos), configurás tus sucursales y cajas, y ya podés empezar a vender. Tenemos soporte por WhatsApp durante todo el proceso.',
  },
  {
    q: '¿Cuánto cuesta StockOS?',
    a: 'Los planes se ajustan según la cantidad de sucursales y cajas. Podés empezar gratis para probarlo sin compromisos. Para conocer los valores actualizados escribinos al mail o al chat y te armamos una propuesta según tu operación.',
  },
  {
    q: '¿Funciona para facturación ARCA?',
    a: 'Sí. StockOS emite Ticket X, Facturas A, B y C, y Notas de Crédito/Débito con autorización ante ARCA (CAE) incluida. Numeración automática, control de secuencias y comprobantes listos para entregar al cliente.',
  },
  {
    q: '¿Puedo migrar desde otro sistema?',
    a: 'Sí. Si tenés tu catálogo en Excel o CSV, lo importamos. Para datos históricos (ventas pasadas, movimientos) lo evaluamos caso a caso. El proceso es asistido para que no pierdas información crítica.',
  },
  {
    q: '¿Funciona desde el celular?',
    a: 'Sí, StockOS tiene interfaz mobile-first completamente funcional. Podés gestionar stock, ver ventas y operaciones desde cualquier dispositivo con navegador moderno. No necesitás instalar ninguna app.',
  },
  {
    q: '¿Mis datos están seguros?',
    a: 'Sí. Usamos Supabase con PostgreSQL y Row Level Security: cada negocio está completamente aislado a nivel de base de datos. Nadie más puede ver tus datos. Backups automáticos incluidos.',
  },
  {
    q: '¿Qué pasa si tengo problemas técnicos?',
    a: 'Soporte por WhatsApp y email en español. Para clientes con plan activo tenemos respuesta prioritaria. El sistema corre en infraestructura de alta disponibilidad (Railway + Supabase) con uptime mayor al 99.9%.',
  },
]

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-b border-white/[0.06] last:border-0">
      <button
        className="w-full flex items-start justify-between gap-4 py-5 text-left group"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="text-white/72 group-hover:text-white text-sm sm:text-[15px] font-medium transition-colors leading-relaxed">
          {q}
        </span>
        <span className="shrink-0 mt-0.5 w-5 h-5 rounded-full border border-white/15 flex items-center justify-center text-white/40 group-hover:border-white/25 transition-colors">
          {open ? <Minus size={11} /> : <Plus size={11} />}
        </span>
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ${
          open ? 'max-h-60 pb-5' : 'max-h-0'
        }`}
      >
        <p className="text-white/42 text-[13.5px] leading-relaxed pr-8">{a}</p>
      </div>
    </div>
  )
}

export function FAQ() {
  return (
    <section id="faq" className="py-28 px-6 border-t border-white/[0.05]">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-[#4ade80] text-xs font-semibold uppercase tracking-[0.15em] mb-4">
            FAQ
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white">Preguntas frecuentes</h2>
        </div>

        <div className="bg-[#131311] rounded-2xl border border-white/[0.06] px-6 sm:px-8">
          {FAQS.map(f => (
            <FAQItem key={f.q} q={f.q} a={f.a} />
          ))}
        </div>
      </div>
    </section>
  )
}
