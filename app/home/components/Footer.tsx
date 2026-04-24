import Link from 'next/link'
import { Shield, Users, RefreshCw, Smartphone } from 'lucide-react'

const TRUST = [
  { Icon: Shield, label: 'Datos seguros y respaldados' },
  { Icon: Users, label: 'Soporte humano y cercano' },
  { Icon: RefreshCw, label: 'Actualizaciones constantes' },
  { Icon: Smartphone, label: '100% online · Sin instalaciones' },
]

export function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      {/* Trust bar */}
      <div className="border-b border-gray-100 py-5 px-6">
        <div className="max-w-6xl mx-auto flex flex-wrap justify-center gap-x-10 gap-y-3">
          {TRUST.map(({ Icon, label }) => (
            <div key={label} className="flex items-center gap-2 text-[13px] text-gray-500">
              <Icon size={14} className="text-[#16a34a]" />
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* Main footer */}
      <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="28" height="28" aria-hidden>
            <rect width="32" height="32" rx="8" fill="#16a34a"/>
            <path d="M18 4 L10 18 L15 18 L14 28 L22 14 L17 14 Z" fill="white"/>
          </svg>
          <span className="font-bold text-gray-900 text-[15px]">StockOS</span>
          <span className="text-gray-400 text-sm hidden sm:inline">— El sistema operativo que impulsa tu negocio.</span>
        </div>

        {/* Links */}
        <nav className="flex flex-wrap justify-center gap-6 text-[13px] text-gray-400">
          <a href="#features" className="hover:text-gray-700 transition-colors">Funciones</a>
          <a href="#faq" className="hover:text-gray-700 transition-colors">FAQ</a>
          <a href="https://wa.me/5493438445203" target="_blank" rel="noopener noreferrer" className="hover:text-gray-700 transition-colors">Contacto</a>
          <Link href="/login" className="hover:text-gray-700 transition-colors">Ingresar</Link>
        </nav>

        {/* Legal + link */}
        <div className="flex items-center gap-4">
          <p className="text-gray-300 text-xs">© 2025 StockOS.</p>
          <a href="https://stockos.digital" className="text-[#16a34a] text-xs font-medium hover:underline">
            stockos.digital
          </a>
        </div>
      </div>
    </footer>
  )
}
