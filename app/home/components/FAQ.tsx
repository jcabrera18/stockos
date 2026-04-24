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
    <div className="border-b border-gray-100 last:border-0">
      <button
        className="w-full flex items-start justify-between gap-4 py-5 text-left group"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="text-gray-700 group-hover:text-gray-900 text-sm sm:text-[15px] font-medium transition-colors leading-relaxed">
          {q}
        </span>
        <span className="shrink-0 mt-0.5 w-5 h-5 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 group-hover:border-gray-300 transition-colors">
          {open ? <Minus size={11} /> : <Plus size={11} />}
        </span>
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ${
          open ? 'max-h-60 pb-5' : 'max-h-0'
        }`}
      >
        <p className="text-gray-500 text-[13.5px] leading-relaxed pr-8">{a}</p>
      </div>
    </div>
  )
}

export function FAQ() {
  return (
    <section id="faq" className="py-28 px-6 border-t border-gray-100 bg-gray-50">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-[#16a34a] text-xs font-semibold uppercase tracking-[0.15em] mb-4">
            FAQ
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Preguntas frecuentes</h2>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 px-6 sm:px-8 shadow-sm">
          {FAQS.map(f => (
            <FAQItem key={f.q} q={f.q} a={f.a} />
          ))}
        </div>
      </div>
    </section>
  )
}
