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
          ? 'bg-white/95 backdrop-blur-xl border-b border-gray-200 shadow-sm'
          : 'bg-white/80 backdrop-blur-md'
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/home" className="flex items-center gap-2.5 group">
          <div className="group-hover:shadow-[0_0_16px_rgba(22,163,74,0.3)] transition-shadow rounded-[8px]">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" aria-hidden>
              <rect width="32" height="32" rx="8" fill="#16a34a"/>
              <path d="M18 4 L10 18 L15 18 L14 28 L22 14 L17 14 Z" fill="white"/>
            </svg>
          </div>
          <span className="font-bold text-gray-900 text-[17px] tracking-tight">StockOS</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-7 text-[13.5px] text-gray-500">
          {NAV_LINKS.map(({ href, label }) => (
            <a key={href} href={href} className="hover:text-gray-900 transition-colors duration-150">
              {label}
            </a>
          ))}
        </div>

        {/* Desktop CTAs */}
        <div className="hidden md:flex items-center gap-2">
          <Link
            href="/login"
            className="text-[13.5px] text-gray-500 hover:text-gray-800 transition-colors px-4 py-2"
          >
            Ingresar
          </Link>
          <Link
            href="/register"
            className="text-[13.5px] px-5 py-2.5 bg-[#16a34a] hover:bg-[#15803d] text-white rounded-[9px] font-medium transition-all duration-200 hover:shadow-[0_4px_14px_rgba(22,163,74,0.35)] active:scale-95"
          >
            Probar gratis
          </Link>
        </div>

        {/* Mobile menu button */}
        <button
          className="md:hidden text-gray-500 hover:text-gray-800 transition-colors p-1"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Abrir menú"
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile menu */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-200 ${
          menuOpen ? 'max-h-96 border-b border-gray-200' : 'max-h-0'
        } bg-white`}
      >
        <div className="px-6 py-4 flex flex-col gap-1">
          {NAV_LINKS.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className="text-gray-600 hover:text-gray-900 text-sm py-2.5 transition-colors"
              onClick={() => setMenuOpen(false)}
            >
              {label}
            </a>
          ))}
          <div className="border-t border-gray-100 mt-2 pt-4 flex flex-col gap-2">
            <Link href="/login" className="text-sm text-gray-500 py-2">
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
