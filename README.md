# StockOS — Frontend

Frontend de StockOS — gestión de supermercados y retail para LATAM.

## Stack

- **Framework**: Next.js 15 (App Router)
- **Lenguaje**: TypeScript
- **Estilos**: Tailwind CSS v4
- **Auth**: Supabase Auth + JWT
- **Analytics**: PostHog
- **Notificaciones**: Sonner
- **Deploy**: Vercel

## Setup local

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.local.example .env.local
# Editar .env.local con tus valores

# 3. Correr en desarrollo
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000).

## Variables de entorno

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
NEXT_PUBLIC_API_URL=http://localhost:3001       # URL del backend stockos-api
NEXT_PUBLIC_POSTHOG_KEY=tu-posthog-key
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com
```

## Estructura

```
app/
├── login/          → Pantalla de login
├── dashboard/      → Stats del día, ventas recientes, alertas
├── products/       → ABM de productos con filtros y paginación
├── stock/          → Inventario completo con alertas
├── sales/          → Registro y listado de ventas
├── purchases/      → Órdenes de compra y proveedores
├── finances/       → Ingresos, gastos y balance
└── settings/       → Config de cuenta y apariencia

components/
├── ui/             → Button, Input, Card, Modal, Badge, etc.
└── layout/         → Sidebar, BottomNav, AppShell, PageHeader

lib/
├── api.ts          → apiFetch helper con Authorization header
├── utils.ts        → formatCurrency, formatDate, helpers
└── supabase/       → client, server, middleware

hooks/
├── useAuth.ts      → sesión y claims del JWT
└── useTheme.ts     → dark/light mode
```

## Deploy en Vercel

1. Conectar el repo en Vercel
2. Configurar las variables de entorno
3. Deploy automático en cada push a `main`

## Design system

Dark mode por defecto. Variables CSS:

| Variable     | Uso                    |
|-------------|------------------------|
| `--bg`       | Fondo principal        |
| `--surface`  | Cards y panels         |
| `--surface2` | Hover states           |
| `--surface3` | Inputs, selects        |
| `--border`   | Bordes                 |
| `--text`     | Texto principal        |
| `--text2`    | Texto secundario       |
| `--text3`    | Texto terciario/hints  |
| `--accent`   | Verde primario         |
| `--danger`   | Rojo para errores      |
| `--warning`  | Amarillo para alertas  |
