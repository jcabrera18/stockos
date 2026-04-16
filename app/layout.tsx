import type { Metadata } from 'next'
import Script from 'next/script'
import { Suspense } from 'react'
import './globals.css'
import { Toaster } from 'sonner'
import { AppShellWrapper } from '@/components/layout/AppShellWrapper'
import { PostHogProvider } from '@/components/PostHogProvider'

const BASE_URL = 'https://stockos.digital'

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: 'StockOS: Gestión de Stock, Ventas y Cajas para Retail LATAM',
    template: '%s | StockOS',
  },
  description: 'Sistema de gestión de stock, ventas y cajas para supermercados y retail en LATAM. Multi-sucursal, POS, inventario, finanzas y más.',
  keywords: ['stock', 'ventas', 'retail', 'supermercado', 'POS', 'inventario', 'LATAM', 'gestión'],
  authors: [{ name: 'StockOS' }],
  openGraph: {
    type: 'website',
    url: BASE_URL,
    siteName: 'StockOS',
    title: 'StockOS: Gestión de Stock, Ventas y Cajas para Retail LATAM',
    description: 'Sistema de gestión de stock, ventas y cajas para supermercados y retail en LATAM. Multi-sucursal, POS, inventario, finanzas y más.',
    locale: 'es_AR',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'StockOS: Gestión de Stock, Ventas y Cajas para Retail LATAM',
    description: 'Sistema de gestión de stock, ventas y cajas para supermercados y retail en LATAM.',
  },
  icons: {
    icon: '/icon.svg',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-theme="dark" suppressHydrationWarning>
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
            const saved = localStorage.getItem('stockos-theme') || 'dark';
            document.documentElement.setAttribute('data-theme', saved);
          })();
        `}</Script>
      </body>
    </html>
  )
}
