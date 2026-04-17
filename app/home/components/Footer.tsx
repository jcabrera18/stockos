import Link from 'next/link'

export function Footer() {
  return (
    <footer className="border-t border-white/[0.06] py-12 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="28" height="28" aria-hidden>
            <rect width="32" height="32" rx="8" fill="#16a34a"/>
            <path d="M18 4 L10 18 L15 18 L14 28 L22 14 L17 14 Z" fill="white"/>
          </svg>
          <span className="font-bold text-white text-[15px]">StockOS</span>
          <span className="text-white/20 text-sm hidden sm:inline">— Gestión de retail para LATAM</span>
        </div>

        {/* Links */}
        <nav className="flex flex-wrap justify-center gap-6 text-[13px] text-white/30">
          <a href="#features" className="hover:text-white/60 transition-colors">Funciones</a>
          <a href="#faq" className="hover:text-white/60 transition-colors">FAQ</a>
          <a href="https://wa.me/5493438445203" target="_blank" rel="noopener noreferrer" className="hover:text-white/60 transition-colors">Contacto</a>
          <Link href="/login" className="hover:text-white/60 transition-colors">Ingresar</Link>
        </nav>

        {/* Legal */}
        <p className="text-white/18 text-xs">© 2025 StockOS. Todos los derechos reservados.</p>
      </div>
    </footer>
  )
}
