import type { Metadata } from 'next'
import { Navbar } from './components/Navbar'
import { Hero } from './components/Hero'
import { Problems } from './components/Problems'
import { Features } from './components/Features'
import { Differentials } from './components/Differentials'
import { SocialProof } from './components/SocialProof'
import { Pricing } from './components/Pricing'
import { CTA } from './components/CTA'
import { FAQ } from './components/FAQ'
import { Footer } from './components/Footer'

export const metadata: Metadata = {
  title: 'StockOS — Sistema de gestión para retail en Argentina y LATAM',
  description:
    'Controlá tu stock, precios y ventas en tiempo real. El sistema todo-en-uno para supermercados, autoservicios y ferreterías. Multi-sucursal, POS ultrarrápido y facturación completa.',
  openGraph: {
    title: 'StockOS — Sistema de gestión para retail en Argentina y LATAM',
    description:
      'POS ultrarrápido, stock real por depósito, multi-sucursal y facturación para Argentina. Para supermercados, autoservicios y ferreterías en LATAM.',
    type: 'website',
    url: 'https://stockos.digital',
    siteName: 'StockOS',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'StockOS — Sistema de gestión para retail en Argentina y LATAM',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'StockOS — Sistema de gestión para retail en Argentina y LATAM',
    description:
      'Stock, precios y ventas en tiempo real. Desde una caja hasta múltiples sucursales.',
    images: ['/opengraph-image'],
  },
  keywords: [
    'sistema de gestión retail',
    'software supermercado',
    'control de stock',
    'POS Argentina',
    'sistema de caja',
    'gestión multi-sucursal',
    'facturación ARCA',
  ],
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0a0a08] text-white overflow-x-hidden">
      <Navbar />
      <Hero />
      <Problems />
      <Features />
      <Differentials />
      <SocialProof />
      <Pricing />
      <CTA />
      <FAQ />
      <Footer />
    </div>
  )
}
