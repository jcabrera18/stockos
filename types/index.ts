export interface Business {
  id: string
  name: string
  slug: string
  cuit?: string
  address?: string
  phone?: string
  email?: string
  logo_url?: string
  settings: Record<string, unknown>
  created_at: string
}

export interface User {
  id: string
  business_id: string
  full_name: string
  role: 'owner' | 'admin' | 'cajero' | 'repositor'
  is_active: boolean
  created_at: string
}

export interface Category {
  id: string
  business_id: string
  parent_id?: string
  name: string
  created_at: string
}

export interface Supplier {
  id: string
  business_id: string
  name: string
  cuit?: string
  phone?: string
  email?: string
  address?: string
  notes?: string
  is_active: boolean
  created_at: string
}

export interface Product {
  id: string
  business_id: string
  category_id?: string
  supplier_id?: string
  name: string
  description?: string
  sku?: string
  barcode?: string
  image_url?: string
  cost_price: number
  sell_price: number
  stock_current: number
  stock_min: number
  stock_max: number
  unit: string
  is_active: boolean
  created_at: string
  updated_at: string
  // joins
  categories?: { id: string; name: string }
  suppliers?: { id: string; name: string }
}

export interface StockSummary extends Product {
  category_name?: string
  supplier_name?: string
  stock_status: 'ok' | 'bajo' | 'critico' | 'sin_stock'
  stock_reserved: number
}

export interface StockMovement {
  id: string
  business_id: string
  product_id: string
  user_id?: string
  type: 'sale' | 'purchase' | 'adjustment' | 'initial' | 'return'
  quantity: number
  stock_before: number
  stock_after: number
  reason?: string
  reference_id?: string
  created_at: string
  // joins
  products?: { name: string; barcode?: string }
  users?: { full_name: string }
}

export interface Sale {
  id: string
  business_id: string
  user_id?: string
  subtotal: number
  discount: number
  total: number
  payment_method: 'efectivo' | 'transferencia' | 'debito' | 'credito' | 'qr' | 'mixto'
  installments: number
  notes?: string
  created_at: string
  users?: { full_name: string }
  branches?: { name: string }
  registers?: { name: string }
  sale_items?: SaleItem[]
}

export interface SaleItem {
  id: string
  sale_id: string
  product_id: string
  quantity: number
  unit_price: number
  discount: number
  subtotal: number
  // joins
  products?: { name: string; barcode?: string; unit: string }
}

export interface PurchaseOrder {
  id: string
  business_id: string
  supplier_id?: string
  user_id?: string
  status: 'pending' | 'received' | 'cancelled'
  subtotal: number
  total: number
  notes?: string
  received_at?: string
  created_at: string
  updated_at: string
  // joins
  suppliers?: { name: string }
  users?: { full_name: string }
  purchase_items?: PurchaseItem[]
}

export interface PurchaseItem {
  id: string
  order_id: string
  product_id: string
  quantity: number
  unit_cost: number
  subtotal: number
  // joins
  products?: { name: string; barcode?: string }
}

export interface Expense {
  id: string
  business_id: string
  user_id?: string
  category: 'proveedores' | 'personal' | 'alquiler' | 'servicios' | 'impuestos' | 'marketing' | 'otro'
  amount: number
  description: string
  date: string
  created_at: string
  users?: { full_name: string }
}

export interface DashboardStats {
  today_revenue: number
  today_sales: number
  week_revenue: number
  month_revenue: number
  low_stock_alerts: number
}

export interface FinanceSummary {
  revenue: number
  expenses: number
  net: number
  margin_pct: number
  by_payment: Record<string, number>
  by_expense_category: Record<string, number>
}

export interface Pagination {
  total: number
  page: number
  limit: number
  pages: number
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: Pagination
}
