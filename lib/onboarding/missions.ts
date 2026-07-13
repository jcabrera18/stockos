import {
  Store, CheckCircle2, FolderTree, Package, PackagePlus, ShoppingCart,
  Truck, ClipboardList, Users, Receipt, CreditCard, Lock,
  FileText, ClipboardCheck, Tag, ScanLine, Percent, Download,
  UserPlus, Building2, Warehouse, Printer, ScanBarcode, Settings2,
} from 'lucide-react'
import type { Mission, StageDef } from './types'

// ─────────────────────────────────────────────────────────────
// STAGES — cada etapa responde: "¿qué acerca más al comerciante
// a vender o controlar mejor su negocio?"
// ─────────────────────────────────────────────────────────────
export const STAGES: StageDef[] = [
  { n: 1, title: 'Empezá a vender',     subtitle: 'Todo listo para tu primera venta',   accent: '#16a34a' },
  { n: 2, title: 'Empezá a controlar',  subtitle: 'Ordená la operación de tu negocio',  accent: '#0ea5e9' },
  { n: 3, title: 'Trabajá más rápido',  subtitle: 'Herramientas que te ahorran tiempo', accent: '#8b5cf6' },
  { n: 4, title: 'Potenciá tu negocio', subtitle: 'Funciones avanzadas cuando crezcas', accent: '#f59e0b' },
]

/** Etapas obligatorias para "graduarse" (la 4 es opcional/aditiva) */
export const REQUIRED_STAGES = [1, 2, 3] as const

// ─────────────────────────────────────────────────────────────
// MISSIONS — fuente de verdad única. Agregar/reordenar = editar acá.
// `isDone` se evalúa contra el snapshot { counts, meta }.
// hrefs "#..." los maneja la propia OnboardingCard (paneles inline).
// ─────────────────────────────────────────────────────────────
export const MISSIONS: Mission[] = [
  // ══ ETAPA 1 · Empezá a vender ════════════════════════════════
  {
    id: 'rubro', stage: 1,
    title: 'Contanos qué vendés', goal: 'Adaptamos StockOS a tu rubro',
    icon: Store, eta: '30 seg', href: '#rubro', cta: 'Elegir rubro',
    isDone: (s) => !!s.meta.rubro,
  },
  {
    id: 'review_setup', stage: 1,
    title: 'Conocé lo que ya dejamos listo', goal: 'Tu sucursal, caja y depósito ya existen',
    icon: CheckCircle2, eta: '1 min', href: '#setup', cta: 'Ver',
    isDone: (s) => s.meta.wizards_run.includes('reviewed_setup'),
  },
  {
    id: 'first_category', stage: 1,
    title: 'Organizá tus productos', goal: 'Las categorías aceleran la búsqueda en el POS',
    icon: FolderTree, eta: '1 min', href: '/categories', cta: 'Crear categoría',
    wizard: 'categories_auto', isDone: (s) => (s.counts.categories ?? 0) > 0,
  },
  {
    id: 'first_product', stage: 1,
    title: 'Cargá tu primer producto', goal: 'Empezá a construir tu catálogo',
    icon: Package, eta: '2 min', href: '/products', cta: 'Cargar producto',
    isDone: (s) => (s.counts.products ?? 0) >= 1,
  },
  {
    id: 'ten_products', stage: 1,
    title: 'Llegá a 10 productos', goal: 'Un catálogo con volumen, listo para vender',
    icon: PackagePlus, eta: '10 min', href: '/products', cta: 'Seguir cargando',
    wizard: 'products_frequent', achievement: 'ten_products',
    isDone: (s) => (s.counts.products ?? 0) >= 10,
  },
  {
    id: 'first_sale', stage: 1,
    title: 'Hacé tu primera venta', goal: 'El momento que importa 🎉',
    icon: ShoppingCart, eta: '2 min', href: '/pos', cta: 'Ir al POS',
    weight: 4, achievement: 'first_sale',
    isDone: (s) => (s.counts.sales ?? 0) >= 1,
  },

  // ══ ETAPA 2 · Empezá a controlar ═════════════════════════════
  {
    id: 'first_supplier', stage: 2,
    title: 'Cargá tu primer proveedor', goal: 'A quién le comprás la mercadería',
    icon: Truck, eta: '1 min', href: '/purchases', cta: 'Agregar proveedor',
    isDone: (s) => (s.counts.suppliers ?? 0) >= 1,
  },
  {
    id: 'first_purchase', stage: 2,
    title: 'Registrá tu primera compra', goal: 'Reponé stock y controlá tu costo',
    icon: ClipboardList, eta: '3 min', href: '/purchases', cta: 'Registrar compra',
    isDone: (s) => (s.counts.purchases ?? 0) >= 1,
  },
  {
    id: 'first_customer', stage: 2,
    title: 'Cargá tu primer cliente', goal: 'Conocé a quién le vendés',
    icon: Users, eta: '1 min', href: '/customers', cta: 'Agregar cliente',
    achievement: 'first_customer', isDone: (s) => (s.counts.customers ?? 0) >= 1,
  },
  {
    id: 'first_expense', stage: 2,
    title: 'Registrá tu primer gasto', goal: 'Empezá a ver tu rentabilidad real',
    icon: Receipt, eta: '1 min', href: '/finances', cta: 'Registrar gasto',
    isDone: (s) => (s.counts.expenses ?? 0) >= 1,
  },
  {
    id: 'first_cc', stage: 2,
    title: 'Abrí tu primera cuenta corriente', goal: 'Vendé fiado y llevá el saldo al día',
    icon: CreditCard, eta: '2 min', href: '/accounts', cta: 'Ver cuentas',
    isDone: (s) => (s.counts.cc_accounts ?? 0) >= 1,
  },
  {
    id: 'first_close', stage: 2,
    title: 'Hacé tu primer cierre de caja', goal: 'Cerrá el día y cuadrá la caja',
    icon: Lock, eta: '2 min', href: '/cash-register', cta: 'Ir a caja',
    achievement: 'first_close', isDone: (s) => (s.counts.cash_closes ?? 0) >= 1,
  },

  // ══ ETAPA 3 · Trabajá más rápido (priorizadas por rubro) ═════
  {
    id: 'first_quote', stage: 3,
    title: 'Creá tu primer presupuesto', goal: 'Cotizá sin tocar el stock',
    icon: FileText, eta: '2 min', href: '/quotes', cta: 'Nuevo presupuesto',
    rubros: ['corralon', 'ferreteria', 'electronica'],
    isDone: (s) => (s.counts.quotes ?? 0) >= 1,
  },
  {
    id: 'first_order', stage: 3,
    title: 'Creá tu primer pedido', goal: 'Reservá stock y organizá la entrega',
    icon: ClipboardCheck, eta: '2 min', href: '/orders', cta: 'Nuevo pedido',
    rubros: ['corralon', 'petshop', 'supermercado', 'otro'],
    isDone: (s) => (s.counts.orders ?? 0) >= 1,
  },
  {
    id: 'first_label', stage: 3,
    title: 'Imprimí tu primera etiqueta', goal: 'Etiquetá productos con precio y código',
    icon: Tag, eta: '2 min', href: '/products', cta: 'Ver productos',
    rubros: ['supermercado', 'dietetica', 'vinoteca', 'perfumeria'],
    isDone: (s) => (s.counts.labels_printed ?? 0) >= 1,
  },
  {
    id: 'first_scan', stage: 3,
    title: 'Escaneá tu primer código', goal: 'Vendé más rápido con lector',
    icon: ScanLine, eta: '1 min', href: '/pos', cta: 'Ir al POS',
    rubros: ['supermercado', 'electronica', 'vinoteca'],
    isDone: (s) => (s.counts.barcodes_scanned ?? 0) >= 1,
  },
  {
    id: 'first_promo', stage: 3,
    title: 'Creá tu primera promoción', goal: 'Impulsá ventas con descuentos',
    icon: Percent, eta: '2 min', href: '/promotions', cta: 'Nueva promoción',
    isDone: (s) => (s.counts.promotions ?? 0) >= 1,
  },
  {
    id: 'first_export', stage: 3,
    title: 'Exportá tu primer Excel', goal: 'Llevate tus datos a donde quieras',
    icon: Download, eta: '30 seg', href: '/products', cta: 'Exportar',
    isDone: (s) => (s.counts.excel_exports ?? 0) >= 1,
  },

  // ══ ETAPA 4 · Potenciá tu negocio (opcional / aditiva) ═══════
  {
    id: 'add_user', stage: 4,
    title: 'Sumá a tu equipo', goal: 'Agregá cajeros, vendedores o administradores',
    icon: UserPlus, eta: '2 min', href: '/settings', cta: 'Agregar usuario',
    isDone: (s) => (s.counts.users ?? 0) >= 2,
  },
  {
    id: 'add_branch', stage: 4,
    title: 'Abrí una nueva sucursal', goal: 'Cuando tu negocio crece a más locales',
    icon: Building2, eta: '2 min', href: '/branches', cta: 'Nueva sucursal',
    isDone: (s) => (s.counts.branches ?? 0) >= 2,
  },
  {
    id: 'add_warehouse', stage: 4,
    title: 'Sumá un nuevo depósito', goal: 'Separá stock por ubicación',
    icon: Warehouse, eta: '2 min', href: '/warehouses', cta: 'Nuevo depósito',
    isDone: (s) => (s.counts.warehouses ?? 0) >= 2,
  },
  {
    id: 'config_printer', stage: 4,
    title: 'Configurá tu impresora', goal: 'Imprimí tickets y comprobantes',
    icon: Printer, eta: '3 min', href: '/settings', cta: 'Configurar',
    isDone: (s) => s.meta.wizards_run.includes('config_printer'),
  },
  {
    id: 'config_scanner', stage: 4,
    title: 'Configurá tu lector de códigos', goal: 'Escaneá productos al instante',
    icon: ScanBarcode, eta: '2 min', href: '/settings', cta: 'Configurar',
    isDone: (s) => s.meta.wizards_run.includes('config_scanner'),
  },
  {
    id: 'personalize', stage: 4,
    title: 'Personalizá StockOS', goal: 'Ajustá el sistema a tu forma de trabajar',
    icon: Settings2, eta: '3 min', href: '/settings', cta: 'Ir a ajustes',
    isDone: (s) => s.meta.wizards_run.includes('personalize'),
  },
]

// ─────────────────────────────────────────────────────────────
// Logros — un badge por hito emocional (no por misión trivial).
// ─────────────────────────────────────────────────────────────
export interface AchievementDef {
  id: string
  title: string
  description: string
  emoji: string
}

export const ACHIEVEMENTS: Record<string, AchievementDef> = {
  first_sale:       { id: 'first_sale',       title: 'Primera venta',     description: 'Acabás de realizar tu primera venta 🎉', emoji: '🎉' },
  ten_products:     { id: 'ten_products',     title: 'Catálogo armado',   description: 'Cargaste 10 productos. ¡Tu negocio ya tiene volumen!', emoji: '📦' },
  first_customer:   { id: 'first_customer',   title: 'Primer cliente',    description: 'Empezaste a conocer a quién le vendés', emoji: '🤝' },
  first_close:      { id: 'first_close',      title: 'Primer cierre',     description: 'Cerraste tu caja por primera vez', emoji: '🔒' },
  stage_1_complete: { id: 'stage_1_complete', title: 'Listo para vender', description: 'Completaste la etapa "Empezá a vender"', emoji: '🚀' },
  stage_2_complete: { id: 'stage_2_complete', title: 'Negocio controlado', description: 'Completaste la etapa "Empezá a controlar"', emoji: '📊' },
  stage_3_complete: { id: 'stage_3_complete', title: 'Comercio veloz',    description: 'Completaste la etapa "Trabajá más rápido"', emoji: '⚡' },
  graduated:        { id: 'graduated',        title: 'Comercio activo',   description: '¡Tu negocio está funcionando a pleno!', emoji: '🏆' },
}
