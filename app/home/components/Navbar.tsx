'use client'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { Menu, X } from 'lucide-react'

const NAV_LINKS = [
  { href: '#features', label: 'Funciones' },
  { href: '#differentials', label: 'Por qué StockOS' },
  { href: '#pricing', label: 'Precios' },
  { href: '#faq', label: 'FAQ' },
]

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 24)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-[#0a0a08]/95 backdrop-blur-xl border-b border-white/[0.06] shadow-[0_1px_20px_rgba(0,0,0,0.4)]'
          : ''
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/home" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 bg-[#16a34a] rounded-[8px] flex items-center justify-center shadow-[0_0_12px_rgba(22,163,74,0.35)] group-hover:shadow-[0_0_20px_rgba(22,163,74,0.5)] transition-shadow">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M2 4h12M2 8h8M2 12h10" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </div>
          <span className="font-bold text-white text-[17px] tracking-tight">StockOS</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-7 text-[13.5px] text-white/45">
          {NAV_LINKS.map(({ href, label }) => (
            <a key={href} href={href} className="hover:text-white/80 transition-colors duration-150">
              {label}
            </a>
          ))}
        </div>

        {/* Desktop CTAs */}
        <div className="hidden md:flex items-center gap-2">
          <Link
            href="/login"
            className="text-[13.5px] text-white/50 hover:text-white/80 transition-colors px-4 py-2"
          >
            Ingresar
          </Link>
          <Link
            href="/register"
            className="text-[13.5px] px-5 py-2.5 bg-[#16a34a] hover:bg-[#15803d] text-white rounded-[9px] font-medium transition-all duration-200 hover:shadow-[0_0_18px_rgba(22,163,74,0.45)] active:scale-95"
          >
            Probar gratis
          </Link>
        </div>

        {/* Mobile menu button */}
        <button
          className="md:hidden text-white/50 hover:text-white transition-colors p-1"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Abrir menú"
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile menu */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-200 ${
          menuOpen ? 'max-h-96 border-b border-white/[0.06]' : 'max-h-0'
        } bg-[#0a0a08]/98`}
      >
        <div className="px-6 py-4 flex flex-col gap-1">
          {NAV_LINKS.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className="text-white/55 hover:text-white text-sm py-2.5 transition-colors"
              onClick={() => setMenuOpen(false)}
            >
              {label}
            </a>
          ))}
          <div className="border-t border-white/[0.07] mt-2 pt-4 flex flex-col gap-2">
            <Link href="/login" className="text-sm text-white/50 py-2">
              Ingresar
            </Link>
            <Link
              href="/register"
              className="text-sm px-4 py-3 bg-[#16a34a] text-white rounded-[9px] font-medium text-center"
            >
              Probar gratis
            </Link>
          </div>
        </div>
      </div>
    </nav>
  )
}
