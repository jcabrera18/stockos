import type { Metadata } from 'next'
import Script from 'next/script'
import { Suspense } from 'react'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], display: 'swap' })
import { Toaster } from 'sonner'
import { AppShellWrapper } from '@/components/layout/AppShellWrapper'
import { PostHogProvider } from '@/components/PostHogProvider'

const BASE_URL = 'https://stockos.digital'

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: 'StockOS — Control total de tu negocio',
    template: '%s | StockOS',
  },
  description: 'Stock, ventas y precios en un solo lugar. Para vender más y no perder plata. POS, multi-sucursal y facturación ARCA para retail en LATAM.',
  keywords: ['stock', 'ventas', 'retail', 'supermercado', 'POS', 'inventario', 'LATAM', 'gestión'],
  authors: [{ name: 'StockOS' }],
  openGraph: {
    type: 'website',
    url: BASE_URL,
    siteName: 'StockOS',
    title: 'StockOS — Control total de tu negocio',
    description: 'Stock, ventas y precios en un solo lugar. Para vender más y no perder plata.',
    locale: 'es_AR',
    images: [
      {
        url: `${BASE_URL}/og.png`,
        width: 1200,
        height: 630,
        alt: 'StockOS — Control total de tu negocio, en tiempo real',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'StockOS — Control total de tu negocio',
    description: 'Stock, ventas y precios en un solo lugar. Para vender más y no perder plata.',
    images: [`${BASE_URL}/og.png`],
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32', type: 'image/x-icon' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    shortcut: '/favicon.ico',
  },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'StockOS',
  },
  other: {
    'msapplication-TileColor': '#16a34a',
    'msapplication-TileImage': '/apple-touch-icon.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-theme="dark" suppressHydrationWarning className={inter.className}>
      <body>
        <Suspense>
          <PostHogProvider>
            <AppShellWrapper>
              {children}
            </AppShellWrapper>
          </PostHogProvider>
        </Suspense>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
            },
          }}
        />
        <Script id="theme-init" strategy="beforeInteractive">{`
          (function() {
            const saved = localStorage.getItem('stockos-theme') || 'light';
            document.documentElement.setAttribute('data-theme', saved);
          })();
        `}</Script>
      </body>
    </html>
  )
}
