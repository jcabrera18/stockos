import Link from 'next/link'

export function Footer() {
  return (
    <footer className="border-t border-white/[0.06] py-12 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-[#16a34a] rounded-[7px] flex items-center justify-center">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M2 4h12M2 8h8M2 12h10" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </div>
          <span className="font-bold text-white text-[15px]">StockOS</span>
          <span className="text-white/20 text-sm hidden sm:inline">— Gestión de retail para LATAM</span>
        </div>

        {/* Links */}
        <nav className="flex flex-wrap justify-center gap-6 text-[13px] text-white/30">
          <a href="#features" className="hover:text-white/60 transition-colors">Funciones</a>
          <a href="#faq" className="hover:text-white/60 transition-colors">FAQ</a>
          <a href="mailto:hola@stockos.digital" className="hover:text-white/60 transition-colors">Contacto</a>
          <Link href="/login" className="hover:text-white/60 transition-colors">Ingresar</Link>
        </nav>

        {/* Legal */}
        <p className="text-white/18 text-xs">© 2025 StockOS. Todos los derechos reservados.</p>
      </div>
    </footer>
  )
}
