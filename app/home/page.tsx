import type { Metadata } from 'next'
import { Navbar } from './components/Navbar'
import { Hero } from './components/Hero'
import { Problems } from './components/Problems'
import { Industries } from './components/Industries'
import { HowItWorks } from './components/HowItWorks'
import { Features } from './components/Features'
import { Showcase } from './components/Showcase'
import { Comparison } from './components/Comparison'
import { Differentials } from './components/Differentials'
import { SocialProof } from './components/SocialProof'
import { Pricing } from './components/Pricing'
import { CTA } from './components/CTA'
import { FAQ } from './components/FAQ'
import { Footer } from './components/Footer'
import { WhatsAppButton } from './components/WhatsAppButton'

export const metadata: Metadata = {
  title: 'StockOS — Sistema de ventas, caja y stock para comercios en Argentina',
  description:
    'Vendé más rápido, cobrá las cuentas y controlá tu negocio en tiempo real. El sistema todo-en-uno para kioscos, almacenes, ferreterías, farmacias, indumentaria y todo comercio. POS, caja, stock y facturación ARCA.',
  openGraph: {
    title: 'StockOS — Sistema de ventas, caja y stock para comercios en Argentina',
    description:
      'POS ultrarrápido, control de stock, cuentas corrientes y facturación ARCA. Para kioscos, almacenes, ferreterías, farmacias e indumentaria. Tengas un local o varios.',
    type: 'website',
    url: 'https://stockos.digital',
    siteName: 'StockOS',
    images: [
      {
        url: 'https://stockos.digital/og.png',
        width: 1200,
        height: 630,
        alt: 'StockOS — Sistema de ventas, caja y stock para comercios en Argentina',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'StockOS — Sistema de ventas, caja y stock para comercios en Argentina',
    description:
      'Vendé, cobrá y controlá tu negocio en tiempo real. Para kioscos, almacenes, ferreterías y todo comercio.',
    images: ['https://stockos.digital/og.png'],
  },
  keywords: [
    'sistema de gestión comercio',
    'software para kiosco',
    'software para almacén',
    'software para ferretería',
    'control de stock',
    'POS Argentina',
    'sistema de caja',
    'cuenta corriente clientes',
    'facturación ARCA',
  ],
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900 overflow-x-hidden">
      <Navbar />
      <Hero />
      <Problems />
      <Industries />
      <HowItWorks />
      <Features />
      <Showcase />
      <Comparison />
      <Differentials />
      <SocialProof />
      <Pricing />
      <CTA />
      <FAQ />
      <Footer />
      <WhatsAppButton />
    </div>
  )
}
