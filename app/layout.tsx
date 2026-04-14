import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'
import { Toaster } from 'sonner'
import { AppShellWrapper } from '@/components/layout/AppShellWrapper'

export const metadata: Metadata = {
  title: 'StockOS',
  description: 'Gestión de supermercados y retail para LATAM',
  icons: {
    icon: '/icon.svg',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" data-theme="dark" suppressHydrationWarning>
      <body>
        <AppShellWrapper>
          {children}
        </AppShellWrapper>
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
