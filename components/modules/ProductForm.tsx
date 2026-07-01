'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import { Plus, X, ChevronDown, ArrowLeft, AlertTriangle, SlidersHorizontal, Loader2 } from 'lucide-react'
import type { Product, Category, Supplier } from '@/types'
import { CategoryTreePicker } from '@/components/ui/CategoryTreePicker'
import type { PriceList } from '@/app/price-lists/page'
import { SupplierModal } from '@/components/modules/SupplierModal'
import { AdjustStockModal } from '@/components/modules/AdjustStockModal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useWorkstation } from '@/hooks/useWorkstation'

interface ProductFormProps {
  product: Product | null
  stockCurrent?: number
  onSaved: () => void
  onClose: () => void
  onNavigateToProduct: (id: string) => void
}

const UNITS = [
  { value: 'unidad', label: 'Unidad' },
  { value: 'kg', label: 'Kilogramo' },
  { value: 'litro', label: 'Litro' },
  { value: 'gramo', label: 'Gramo' },
  { value: 'metro', label: 'Metro' },
  { value: 'caja', label: 'Caja' },
  { value: 'pack', label: 'Pack' },
]

const VAT_OPTIONS = [
  { value: '0', label: '0%' },
  { value: '10.5', label: '10,5%' },
  { value: '21', label: '21%' },
  { value: '27', label: '27%' },
]

interface CostHistoryEntry {
  id: string
  supplier_id: string | null
  purchase_order_id: string | null
  unit_cost: number
  applied_cost: number
  decision: string
  recorded_at: string
  suppliers?: { name: string } | null
}

const DECISION_LABELS: Record<string, string> = {
  keep: 'Mantener actual',
  new_price: 'Precio orden',
  weighted: 'Prom. pond.',
  highest: 'Mayor precio',
}

const _refCache: {
  categories: Category[] | null
  suppliers: Supplier[] | null
  priceLists: PriceList[] | null
  brands: { id: string; name: string }[] | null
} = { categories: null, suppliers: null, priceLists: null, brands: null }

const emptyForm = {
  name: '',
  sku: '',
  description: '',
  category_id: '',
  supplier_id: '',
  brand_id: '',
  cost_price_net: '',
  vat_rate: '21',
  sell_price: '',
  initial_stock: '0',
  stock_min: '0',
  stock_max: '9999',
  use_fixed_sell_price: true,
  unit: 'unidad',
  price_mode: 'fixed' as 'fixed' | 'custom',
}

type FormState = typeof emptyForm

// Serializa el estado editable del form para comparar contra el snapshot base
// y detectar cambios sin guardar.
function serializeFormState(
  form: FormState,
  barcodes: string[],
  overridePrices: Record<string, string>,
  overrideModes: Record<string, 'pesos' | 'pct'>,
  overridePctValues: Record<string, string>,
  ruleQtys: Record<string, string>,
) {
  return JSON.stringify({ form, barcodes, overridePrices, overrideModes, overridePctValues, ruleQtys })
}

const PRICE_MODES = [
  { value: 'fixed' as const, label: 'Precio fijo', hint: 'Vos definís el precio' },
  { value: 'list' as const, label: 'Por lista', hint: 'Margen sobre costo' },
  { value: 'libre' as const, label: 'Precio libre', hint: 'Cajero lo ingresa' },
]

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text3)]">
      {children}
    </p>
  )
}

export function ProductForm({ product, stockCurrent, onSaved, onClose, onNavigateToProduct }: ProductFormProps) {
  const [form, setForm] = useState(emptyForm)
  const [barcodes, setBarcodes] = useState<string[]>([])
  const [newBarcode, setNewBarcode] = useState('')
  const [selectedBarcodeIdx, setSelectedBarcodeIdx] = useState<number>(0)
  const [duplicateWarning, setDuplicateWarning] = useState<Product | null>(null)
  const [checkingBarcode, setCheckingBarcode] = useState(false)
  const newBarcodeRef = useRef<HTMLInputElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const costPriceRef = useRef<HTMLInputElement>(null)
  const sellPriceRef = useRef<HTMLInputElement>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [priceLists, setPriceLists] = useState<PriceList[]>([])
  const [overridePrices, setOverridePrices] = useState<Record<string, string>>({})
  const [overrideModes, setOverrideModes] = useState<Record<string, 'pesos' | 'pct'>>({})
  const [overridePctValues, setOverridePctValues] = useState<Record<string, string>>({})
  // Cantidad desde la cual se "levanta" cada lista para ESTE producto (regla del
  // producto). Indexado por price_list_id. Vacío = hereda el min_quantity global.
  const [ruleQtys, setRuleQtys] = useState<Record<string, string>>({})
  const [supplierSubModal, setSupplierSubModal] = useState(false)
  const [brandSubModal, setBrandSubModal] = useState(false)
  const [newBrandName, setNewBrandName] = useState('')
  const [savingBrand, setSavingBrand] = useState(false)
  const [categorySubModal, setCategorySubModal] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatParent, setNewCatParent] = useState('')
  const [savingCat, setSavingCat] = useState(false)
  const [costHistoryOpen, setCostHistoryOpen] = useState(false)
  const [costHistory, setCostHistory] = useState<CostHistoryEntry[]>([])
  const [costHistoryLoading, setCostHistoryLoading] = useState(false)
  const [expressMode, setExpressMode] = useState(true)
  const [adjustStockModal, setAdjustStockModal] = useState(false)
  const [displayStock, setDisplayStock] = useState<number>(0)
  // Timer de reconciliación del stock tras un ajuste (ver reconcileStock).
  const stockReconcileTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Reglas "se levanta desde" recién guardadas, para reconciliar contra el lag de
  // la réplica al recargar el producto tras guardar (ver loadPriceRules).
  const expectedRulesRef = useRef<{ productId: string; rules: Record<string, string> } | null>(null)
  const rulesReconcileTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [confirmClose, setConfirmClose] = useState(false)
  const baselineRef = useRef('')
  const { workstation } = useWorkstation()

  const isEdit = !!product

  // Detección de cambios sin guardar (solo en edición). El snapshot base se
  // captura al cargar el producto (ver el useEffect que pobla el form).
  const snapshot = serializeFormState(form, barcodes, overridePrices, overrideModes, overridePctValues, ruleQtys)
  const isDirty = isEdit && snapshot !== baselineRef.current

  // Cierra el panel, pero si hay cambios sin guardar pide confirmación primero.
  const requestClose = () => {
    if (saving) return
    if (isDirty) { setConfirmClose(true); return }
    onClose()
  }
  const costNet = Number(form.cost_price_net) || 0
  const vatRate = Number(form.vat_rate) || 0
  const costWithVat = Math.round(costNet * (1 + vatRate / 100) * 100) / 100

  const currentPriceMode = form.price_mode === 'custom' ? 'libre' : form.use_fixed_sell_price ? 'fixed' : 'list'

  // Si el producto tiene al menos una regla "desde X" propia, esas reglas definen
  // TODOS los tramos por cantidad y las cantidades globales de las listas se ignoran.
  const hasAnyRule = Object.values(ruleQtys).some(v => v.trim() !== '' && Number(v) >= 1)

  const setPriceMode = (mode: 'list' | 'fixed' | 'libre') => {
    if (mode === 'libre') setForm(f => ({ ...f, price_mode: 'custom', use_fixed_sell_price: false }))
    else if (mode === 'fixed') setForm(f => ({ ...f, price_mode: 'fixed', use_fixed_sell_price: true }))
    else setForm(f => ({ ...f, price_mode: 'fixed', use_fixed_sell_price: false }))
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setForm(f => ({
          ...f,
          use_fixed_sell_price: !f.use_fixed_sell_price,
          sell_price: f.use_fixed_sell_price ? '' : f.sell_price,
        }))
        return
      }
      if (e.key !== 'Enter') return
      const { handleSave, saving, anySubModalOpen } = saveActionsRef.current
      if (saving) return
      // Si hay un sub-modal abierto (nueva categoría/marca/proveedor), el Enter
      // es de ese modal: no debe disparar el guardado del producto de atrás.
      if (anySubModalOpen) return
      // El guardado del producto es SIEMPRE con Ctrl/Cmd+Enter. El Enter pelado
      // nunca guarda (lo usan campos puntuales para navegar o sumar códigos).
      if (!(e.metaKey || e.ctrlKey)) return
      e.preventDefault()
      handleSave()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    setExpressMode(!product)
    setCostHistoryOpen(false)
    setCostHistory([])
    setDuplicateWarning(null)
    setNewBarcode('')
    setDisplayStock(stockCurrent ?? product?.stock_current ?? 0)
    // Al cambiar de producto (o desmontar), cancelamos cualquier reconciliación
    // de stock en vuelo para que no pise el stock del producto nuevo.
    return () => {
      if (stockReconcileTimer.current) {
        clearTimeout(stockReconcileTimer.current)
        stockReconcileTimer.current = null
      }
    }
  }, [product, stockCurrent])

  // Tras un ajuste de stock, el refetch inmediato puede pegarle a la réplica con
  // lag (read-after-write) y devolver el stock viejo, pisando en el input el valor
  // recién ajustado. Aplicamos el valor esperado de forma optimista y reconciliamos:
  // mientras el server siga devolviendo el valor previo (stale) reintentamos en
  // silencio; en cuanto devuelve algo distinto lo aceptamos (esperado o una
  // reconciliación por venta concurrente). Mismo patrón que orders/quotes/CC.
  const reconcileStock = useCallback((productId: string, before: number, expected: number, attempt = 0) => {
    setDisplayStock(expected)
    api.get<Product>(`/api/products/${productId}`)
      .then(updated => {
        const server = updated.stock_current ?? 0
        if (server !== before || attempt >= 4) {
          setDisplayStock(server)
          return
        }
        stockReconcileTimer.current = setTimeout(
          () => reconcileStock(productId, before, expected, attempt + 1),
          1500,
        )
      })
      .catch(() => { /* mantener el valor optimista */ })
  }, [])

  // Carga las reglas "se levanta desde" del producto reconciliando contra el lag
  // de la réplica. Tras guardar dejamos en expectedRulesRef lo recién persistido:
  // mientras el GET siga devolviendo lo viejo (stale) mantenemos el valor esperado
  // en el input y reintentamos en silencio, en vez de revertir y "traer" el nuevo
  // con delay. Mismo patrón que orders/quotes/CC.
  const loadPriceRules = useCallback((
    productId: string,
    baseForm: FormState,
    baseBarcodes: string[],
    baseOv: Record<string, string>,
    attempt = 0,
  ) => {
    api.get<{ price_list_id: string; min_quantity: number }[]>(`/api/products/${productId}/price-rules`)
      .then(rules => {
        const qtyMap: Record<string, string> = {}
        for (const r of rules) qtyMap[r.price_list_id] = String(r.min_quantity)
        const expected = expectedRulesRef.current?.productId === productId
          ? expectedRulesRef.current.rules
          : null
        const matches = expected
          ? Object.keys(expected).length === Object.keys(qtyMap).length &&
            Object.keys(expected).every(k => qtyMap[k] === expected[k])
          : true
        if (expected && !matches && attempt < 4) {
          // La réplica todavía no refleja lo guardado → mantenemos lo esperado.
          setRuleQtys(expected)
          baselineRef.current = serializeFormState(baseForm, baseBarcodes, baseOv, {}, {}, expected)
          rulesReconcileTimer.current = setTimeout(
            () => loadPriceRules(productId, baseForm, baseBarcodes, baseOv, attempt + 1),
            1000,
          )
          return
        }
        expectedRulesRef.current = null
        setRuleQtys(qtyMap)
        baselineRef.current = serializeFormState(baseForm, baseBarcodes, baseOv, {}, {}, qtyMap)
      })
      .catch(() => {})
  }, [])

  const handleCostHistoryToggle = async () => {
    if (costHistoryOpen) { setCostHistoryOpen(false); return }
    setCostHistoryOpen(true)
    if (costHistory.length > 0 || costHistoryLoading) return
    setCostHistoryLoading(true)
    try {
      const data = await api.get<CostHistoryEntry[]>(`/api/purchases/product-cost-history/${product!.id}`)
      setCostHistory(data)
    } catch { toast.error('Error al cargar historial de costos') }
    finally { setCostHistoryLoading(false) }
  }

  useEffect(() => {
    // Pintar las listas cacheadas al instante; igual se revalidan abajo.
    if (_refCache.priceLists) setPriceLists(_refCache.priceLists)
    const load = async () => {
      const [cats, sups, lists, brnds] = await Promise.all([
        _refCache.categories ?? api.get<Category[]>('/api/products/categories'),
        _refCache.suppliers ?? api.get<Supplier[]>('/api/purchases/suppliers'),
        // Siempre fresco: el min_quantity de una lista (o su paso a manual)
        // puede haber cambiado y el form debe reflejarlo.
        api.get<PriceList[]>('/api/price-lists'),
        _refCache.brands ?? api.get<{ id: string; name: string }[]>('/api/brands'),
      ])
      _refCache.categories = cats; setCategories(cats)
      _refCache.suppliers = sups; setSuppliers(sups)
      _refCache.priceLists = lists; setPriceLists(lists)
      _refCache.brands = brnds; setBrands(brnds)
      if (!product && lists.length === 0) {
        setForm(f => ({ ...f, use_fixed_sell_price: true }))
      }
    }
    load().catch(() => {})
  }, [])

  useEffect(() => {
    if (product) {
      const loadedForm = {
        name: product.name,
        sku: product.sku ?? '',
        description: product.description ?? '',
        category_id: product.category_id ?? '',
        supplier_id: product.supplier_id ?? '',
        brand_id: product.brand_id ?? '',
        cost_price_net: String(product.cost_price_net ?? product.cost_price ?? 0),
        vat_rate: String(product.vat_rate ?? 0),
        sell_price: product.use_fixed_sell_price ? String(product.sell_price) : '',
        initial_stock: String(product.stock_current ?? 0),
        stock_min: String(product.stock_min ?? 0),
        stock_max: String(product.stock_max ?? 9999),
        use_fixed_sell_price: product.use_fixed_sell_price ?? false,
        unit: product.unit,
        price_mode: product.price_mode ?? 'fixed',
      }
      setForm(loadedForm)
      // El producto ya viene completo desde la página (incluye product_barcodes
      // y price_overrides), así que poblamos todo de forma síncrona — sin un
      // segundo fetch que haría aparecer el código de barras con retraso.
      const bars = (product.product_barcodes ?? []).map(b => b.barcode)
      const loadedBarcodes = bars.length > 0 ? bars : (product.barcode ? [product.barcode] : [])
      setBarcodes(loadedBarcodes)
      const ovMap: Record<string, string> = {}
      for (const ov of (product.price_overrides ?? [])) {
        ovMap[ov.price_list_id] = String(ov.price)
      }
      setOverridePrices(ovMap)
      // Los modos/porcentajes de override son helpers de UI, no se cargan del
      // producto: arrancan limpios en cada apertura.
      setOverrideModes({})
      setOverridePctValues({})
      // Si venimos de guardar ESTE producto, sembramos las reglas recién guardadas
      // para no mostrar el input vacío ni revertirlo mientras la réplica sincroniza.
      const seededRules = expectedRulesRef.current?.productId === product.id
        ? expectedRulesRef.current.rules
        : {}
      setRuleQtys(seededRules)
      // Snapshot base para detectar cambios sin guardar (ver `snapshot`/`isDirty`).
      baselineRef.current = serializeFormState(loadedForm, loadedBarcodes, ovMap, {}, {}, seededRules)

      // Las reglas de cantidad por lista viven en otra tabla → fetch aparte, con
      // reconciliación contra el lag de la réplica (ver loadPriceRules).
      if (rulesReconcileTimer.current) { clearTimeout(rulesReconcileTimer.current); rulesReconcileTimer.current = null }
      loadPriceRules(product.id, loadedForm, loadedBarcodes, ovMap)
      return () => {
        if (rulesReconcileTimer.current) { clearTimeout(rulesReconcileTimer.current); rulesReconcileTimer.current = null }
      }
    } else {
      expectedRulesRef.current = null
      setForm(emptyForm)
      setBarcodes([])
      setOverridePrices({})
      setOverrideModes({})
      setOverridePctValues({})
      setRuleQtys({})
      setErrors({})
    }
  }, [product, loadPriceRules])

  const addBarcode = async (overrideVal?: string) => {
    const val = (overrideVal ?? newBarcode).replace(/\D/g, '')
    if (!val) return
    if (barcodes.includes(val)) { toast.error('Ese código ya está cargado'); return }
    if (checkingBarcode) return

    setCheckingBarcode(true)
    try {
      const existing = await api.get<Product>(`/api/products/barcode/${encodeURIComponent(val)}`)
      if (existing && existing.id !== product?.id) {
        setDuplicateWarning(existing)
        return
      }
    } catch {
      // Not found = safe to add
    } finally {
      setCheckingBarcode(false)
    }

    setBarcodes(prev => [...prev, val])
    setNewBarcode('')
    // En express, tras agregar el código el foco va al nombre. Esto corre
    // después del await del chequeo de duplicado, así que es el que manda
    // (evita que el foco "rebote" al input de código un segundo después).
    if (expressMode && !isEdit) {
      nameInputRef.current?.focus()
    } else {
      newBarcodeRef.current?.focus()
    }
  }

  const handleBarcodePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').trim()
    if (!pasted) return
    e.preventDefault()
    addBarcode(pasted)
  }

  const removeBarcode = (idx: number) => {
    setBarcodes(prev => {
      const next = prev.filter((_, i) => i !== idx)
      setSelectedBarcodeIdx(Math.min(idx, next.length - 1))
      return next
    })
  }

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(f => ({ ...f, [field]: e.target.value }))
    setErrors(er => ({ ...er, [field]: '' }))
  }

  // Al enfocar un input numérico, si el valor es "0" lo limpiamos para que el
  // usuario (mouse o Tab) pueda escribir directo sin borrar el 0. Al salir, si
  // quedó vacío, restauramos el valor por defecto.
  const numFocus = (field: string) => (e: React.FocusEvent<HTMLInputElement>) => {
    if (e.target.value === '0') setForm(f => ({ ...f, [field]: '' }))
  }
  const numBlur = (field: string, fallback = '0') => (e: React.FocusEvent<HTMLInputElement>) => {
    if (e.target.value.trim() === '') setForm(f => ({ ...f, [field]: fallback }))
  }

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = 'El nombre es obligatorio'
    if (Number(form.cost_price_net) < 0) errs.cost_price_net = 'Debe ser mayor o igual a 0'
    if (Number(form.stock_min) < 0) errs.stock_min = 'Debe ser mayor o igual a 0'
    if (Number(form.stock_max) < 0) errs.stock_max = 'Debe ser mayor o igual a 0'
    if (Number(form.stock_max) < Number(form.stock_min)) errs.stock_max = 'Debe ser mayor o igual al stock mínimo'
    return errs
  }

  const buildPayload = () => {
    let sellPrice: number
    if (form.use_fixed_sell_price && Number(form.sell_price) > 0) {
      sellPrice = Number(form.sell_price)
    } else {
      const defaultList = priceLists.find(l => l.is_default) ?? priceLists[0]
      sellPrice = defaultList
        ? Math.round(costWithVat * (1 + defaultList.margin_pct / 100) * 100) / 100
        : costWithVat
    }
    return {
      name: form.name.trim(),
      barcodes,
      sku: form.sku.trim() || null,
      description: form.description.trim() || null,
      category_id: form.category_id || null,
      supplier_id: form.supplier_id || null,
      brand_id: form.brand_id || null,
      cost_price: costWithVat,
      cost_price_net: costNet,
      vat_rate: vatRate,
      cost_price_with_vat: costWithVat,
      sell_price: sellPrice,
      use_fixed_sell_price: form.use_fixed_sell_price,
      initial_stock: Number(form.initial_stock) || 0,
      stock_min: Number(form.stock_min) || 0,
      stock_max: Number(form.stock_max) || 0,
      unit: form.unit,
      price_mode: form.price_mode,
    }
  }

  const buildOverrides = () =>
    Object.entries(overridePrices)
      .filter(([, v]) => v !== '' && Number(v) > 0)
      .map(([price_list_id, price]) => ({ price_list_id, price: Number(price) }))

  // Reglas de cantidad por lista de este producto. Vacío = hereda la global.
  const buildRules = () =>
    Object.entries(ruleQtys)
      .filter(([, v]) => v !== '' && Number(v) >= 1)
      .map(([price_list_id, min_quantity]) => ({ price_list_id, min_quantity: Number(min_quantity) }))

  const handleSave = async () => {
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setSaving(true)
    try {
      const payload = buildPayload()
      const overridePayload = buildOverrides()
      const rulesPayload = buildRules()
      if (isEdit) {
        await api.patch(`/api/products/${product!.id}`, payload)
        await api.put(`/api/products/${product!.id}/price-overrides`, overridePayload)
        await api.put(`/api/products/${product!.id}/price-rules`, rulesPayload)
        // Registramos las reglas recién guardadas para que la recarga las mantenga
        // mientras la réplica sincroniza (evita el revert + delay del input).
        expectedRulesRef.current = {
          productId: product!.id,
          rules: Object.fromEntries(rulesPayload.map(r => [r.price_list_id, String(r.min_quantity)])),
        }
        toast.success('Producto actualizado')
        onSaved()
        // Mantenemos el panel abierto y recargamos los datos frescos del producto
        onNavigateToProduct(product!.id)
      } else {
        const created = await api.post<{ id: string }>('/api/products', payload)
        if (overridePayload.length > 0) {
          await api.put(`/api/products/${created.id}/price-overrides`, overridePayload)
        }
        if (rulesPayload.length > 0) {
          await api.put(`/api/products/${created.id}/price-rules`, rulesPayload)
        }
        toast.success('Producto creado')
        onSaved()
        onNavigateToProduct(created.id)
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveAndNew = async () => {
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setSaving(true)
    try {
      const created = await api.post<{ id: string }>('/api/products', buildPayload())
      const overridePayload = buildOverrides()
      const rulesPayload = buildRules()
      if (overridePayload.length > 0) {
        await api.put(`/api/products/${created.id}/price-overrides`, overridePayload)
      }
      if (rulesPayload.length > 0) {
        await api.put(`/api/products/${created.id}/price-rules`, rulesPayload)
      }
      toast.success('Producto creado')
      onSaved()
      setForm(emptyForm)
      setBarcodes([])
      setNewBarcode('')
      setErrors({})
      setOverridePrices({})
      setOverrideModes({})
      setOverridePctValues({})
      setRuleQtys({})
      setDuplicateWarning(null)
      setTimeout(() => newBarcodeRef.current?.focus(), 50)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  // Mantiene los handlers de guardado siempre frescos para el listener de
  // teclado (que se suscribe una sola vez al montar y si no quedaría stale).
  const anySubModalOpen = categorySubModal || brandSubModal || supplierSubModal
  const saveActionsRef = useRef({ handleSave, handleSaveAndNew, isEdit, saving, expressMode, anySubModalOpen })
  saveActionsRef.current = { handleSave, handleSaveAndNew, isEdit, saving, expressMode, anySubModalOpen }

  const handleSupplierSaved = async () => {
    const prevIds = new Set(suppliers.map(s => s.id))
    const updated = await api.get<Supplier[]>('/api/purchases/suppliers').catch(() => suppliers)
    setSuppliers(updated)
    const newOne = updated.find(s => !prevIds.has(s.id))
    if (newOne) setForm(f => ({ ...f, supplier_id: newOne.id }))
    setSupplierSubModal(false)
  }

  const handleBrandQuickSave = async () => {
    if (!newBrandName.trim()) return
    setSavingBrand(true)
    try {
      const created = await api.post<{ id: string; name: string }>('/api/brands', { name: newBrandName.trim() })
      const updated = await api.get<{ id: string; name: string }[]>('/api/brands').catch(() => brands)
      const merged = updated.some(b => b.id === created.id) ? updated : [...updated, created]
      _refCache.brands = merged
      setBrands(merged)
      setForm(f => ({ ...f, brand_id: created.id }))
      setNewBrandName('')
      setBrandSubModal(false)
      toast.success('Marca creada')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al crear marca')
    } finally {
      setSavingBrand(false)
    }
  }

  const handleCategoryQuickSave = async () => {
    if (!newCatName.trim()) return
    setSavingCat(true)
    try {
      const created = await api.post<Category>('/api/products/categories', {
        name: newCatName.trim(),
        parent_id: newCatParent || null,
      })
      // Aseguramos que la categoría recién creada exista en la lista local: el GET
      // puede pegarle a una réplica con lag y no traerla todavía, dejando el
      // breadcrumb sin poder resolver el id (chip vacío). La sembramos sí o sí.
      const seed: Category = { ...created, parent_id: created.parent_id ?? (newCatParent || undefined) }
      const updated = await api.get<Category[]>('/api/products/categories').catch(() => categories)
      const merged = updated.some(c => c.id === seed.id) ? updated : [...updated, seed]
      _refCache.categories = merged
      setCategories(merged)
      setForm(f => ({ ...f, category_id: created.id }))
      setNewCatName('')
      setNewCatParent('')
      setCategorySubModal(false)
      toast.success('Categoría creada')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al crear categoría')
    } finally {
      setSavingCat(false)
    }
  }

  const categoryMap = new Map(categories.map(c => [c.id, c]))
  const childrenMap = new Map<string | null, Category[]>()
  categories.forEach(c => {
    const key = c.parent_id ?? null
    if (!childrenMap.has(key)) childrenMap.set(key, [])
    childrenMap.get(key)!.push(c)
  })

  const supplierOptions = suppliers.map(s => ({ value: s.id, label: s.name }))
  const brandOptions = brands.map(b => ({ value: b.id, label: b.name }))

  const selectClass = 'w-full px-2 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed'

  const renderBarcodeField = (autoFocus?: boolean) => (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-[var(--text2)]">Código de barras (EAN)</label>
      {barcodes.length > 0 && (
        <div className="flex gap-1 mb-1">
          <select
            value={selectedBarcodeIdx}
            onChange={e => setSelectedBarcodeIdx(Number(e.target.value))}
            className="flex-1 min-w-0 pl-2 pr-7 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-colors mono"
          >
            {barcodes.map((b, i) => (
              <option key={i} value={i}>{b}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => removeBarcode(selectedBarcodeIdx)}
            className="flex-shrink-0 px-2 py-2 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--danger,#ef4444)] hover:bg-[var(--surface2)] transition-colors"
            title="Eliminar código seleccionado"
          >
            <X size={14} />
          </button>
        </div>
      )}
      <div className="flex gap-1">
        <input
          ref={newBarcodeRef}
          type="text"
          inputMode="numeric"
          autoFocus={autoFocus}
          value={newBarcode}
          onChange={e => { setNewBarcode(e.target.value.replace(/\D/g, '')); setDuplicateWarning(null) }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addBarcode()
            }
          }}
          onPaste={handleBarcodePaste}
          placeholder="7790895000152"
          className="flex-1 min-w-0 px-2 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)] transition-colors mono"
        />
        <button
          type="button"
          onClick={() => addBarcode()}
          disabled={checkingBarcode}
          className="flex-shrink-0 px-2 py-2 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--accent)] hover:bg-[var(--surface2)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          title={checkingBarcode ? 'Verificando código…' : 'Agregar código'}
        >
          {checkingBarcode ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
        </button>
      </div>
      {checkingBarcode && (
        <p className="flex items-center gap-1.5 text-xs text-[var(--text3)] mt-1">
          <Loader2 size={11} className="animate-spin" />
          Verificando si el código ya existe…
        </p>
      )}
      {duplicateWarning && (
        <div className="flex items-center gap-2 mt-1 px-3 py-2 rounded-[var(--radius-md)] bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-700 text-sm">
          <AlertTriangle size={13} className="text-amber-500 flex-shrink-0" />
          <span className="flex-1 text-[var(--text)] text-xs">
            Este código ya pertenece a <strong>{duplicateWarning.name}</strong>
          </span>
          <button
            type="button"
            onClick={() => { onNavigateToProduct(duplicateWarning.id); setDuplicateWarning(null); setNewBarcode('') }}
            className="text-[var(--accent)] text-xs font-medium hover:opacity-80 transition-opacity whitespace-nowrap"
          >
            Ver ese producto →
          </button>
          <button
            type="button"
            onClick={() => setDuplicateWarning(null)}
            className="p-0.5 text-[var(--text3)] hover:text-[var(--text)] transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      )}
      <p className="text-xs text-[var(--text3)]">
        {barcodes.length === 0
          ? 'Si no ingresás un código de barras, StockOS generará uno automáticamente.'
          : 'Escaneá o pegá el código'}
      </p>
    </div>
  )

  return (
    <div className="flex flex-col min-h-full">

      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-5 py-4 bg-[var(--bg)] border-b border-[var(--border)]">
        <button
          type="button"
          onClick={requestClose}
          className="p-1.5 rounded-[var(--radius-md)] text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors"
          title="Cerrar"
        >
          <ArrowLeft size={16} />
        </button>
        <h2 className="text-base font-semibold text-[var(--text)] flex-1">
          {isEdit ? product!.name : 'Nuevo producto'}
        </h2>
      </div>

      {/* Content */}
      <div className="flex-1 p-5 space-y-5">

        {/* Toggle express / completo */}
        {!isEdit && (
          <button
            type="button"
            onClick={() => setExpressMode(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-[var(--radius-md)] bg-[var(--surface2)] border border-[var(--border)] text-left cursor-pointer hover:bg-[var(--surface3)] transition-colors"
          >
            <p className="text-xs text-[var(--text2)]">
              {expressMode
                ? 'Modo express — escaneá el código, completá el nombre y guardá.'
                : 'Modo completo — todos los campos disponibles.'}
            </p>
            <span className="text-xs text-[var(--accent)] hover:opacity-80 transition-opacity flex-shrink-0 ml-3">
              {expressMode ? 'Ver más campos' : 'Modo express'}
            </span>
          </button>
        )}

        {/* ── MODO EXPRESS ── */}
        {expressMode && !isEdit && (
          <>
            {renderBarcodeField(true)}

            <Input
              ref={nameInputRef}
              label="Nombre *"
              value={form.name}
              onChange={set('name')}
              placeholder="Ej: Coca Cola 500ml"
              error={errors.name}
            />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-[var(--text2)]">Costo e IVA</p>
                <p className="text-xs text-[var(--text3)]">Las listas calculan sobre el costo con IVA</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Input
                  ref={costPriceRef}
                  label="Costo"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.cost_price_net}
                  onChange={set('cost_price_net')}
                  placeholder="0.00"
                  error={errors.cost_price_net}
                />
                <Select label="IVA" options={VAT_OPTIONS} value={form.vat_rate} onChange={set('vat_rate')} />
                <Input
                  label="Costo con IVA"
                  value={costWithVat ? String(costWithVat) : '0'}
                  readOnly
                  placeholder="0.00"
                  hint="Calculado automáticamente"
                />
              </div>
            </div>

            {form.price_mode === 'fixed' && (
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <div className="relative flex-shrink-0">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={form.use_fixed_sell_price}
                      onChange={e => {
                        const checked = e.target.checked
                        setForm(f => ({ ...f, use_fixed_sell_price: checked, sell_price: checked ? f.sell_price : '' }))
                        if (checked) setTimeout(() => sellPriceRef.current?.focus(), 30)
                      }}
                    />
                    <div className="w-9 h-5 rounded-full bg-[var(--border)] peer-checked:bg-[var(--accent)] transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-[var(--text)]">Precio de venta fijo</p>
                      <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded border border-[var(--border)] bg-[var(--surface2)] text-[var(--text3)]">Alt+F</kbd>
                    </div>
                    <p className="text-xs text-[var(--text3)]">Ideal cuando no usás márgenes.</p>
                  </div>
                </label>
                {form.use_fixed_sell_price && (
                  <Input
                    ref={sellPriceRef}
                    label="Precio de venta"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.sell_price}
                    onChange={set('sell_price')}
                    placeholder="0.00"
                    error={errors.sell_price}
                  />
                )}
              </div>
            )}

            {/* Ayuda de atajos para carga rápida */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-[var(--text3)]">
              <span className="flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded border border-[var(--border)] bg-[var(--surface2)] text-[var(--text3)]">⌘/Ctrl + ↵</kbd>
                crear producto
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded border border-[var(--border)] bg-[var(--surface2)] text-[var(--text3)]">Tab</kbd>
                pasar de campo
              </span>
            </div>
          </>
        )}

        {/* ── MODO COMPLETO / EDICIÓN ── */}
        {(!expressMode || isEdit) && (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-x-6">

            {/* Columna izquierda */}
            <div className="space-y-4 sm:border-r sm:border-[var(--border)] sm:pr-6">
              <SectionLabel>Identificación</SectionLabel>

              {renderBarcodeField(!isEdit)}

              <Input
                ref={nameInputRef}
                label="Nombre *"
                value={form.name}
                onChange={set('name')}
                placeholder="Ej: Coca Cola 500ml"
                error={errors.name}
                autoFocus={isEdit}
              />

              <div className="grid grid-cols-2 gap-3">
                <Input label="Código interno" value={form.sku} onChange={set('sku')} placeholder="COC-500" />
                <Select label="Unidad" options={UNITS} value={form.unit} onChange={set('unit')} />
              </div>

              <div className="pt-2"><SectionLabel>Clasificación</SectionLabel></div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-[var(--text2)]">Categoría</label>
                  <button
                    type="button"
                    onClick={() => { setNewCatName(''); setNewCatParent(form.category_id); setCategorySubModal(true) }}
                    className="flex items-center gap-0.5 text-xs text-[var(--accent)] hover:opacity-80 transition-opacity"
                  >
                    <Plus size={12} /> Nueva
                  </button>
                </div>
                <CategoryTreePicker
                  categoryMap={categoryMap}
                  childrenMap={childrenMap}
                  value={form.category_id}
                  onChange={id => { setForm(f => ({ ...f, category_id: id })); setErrors(er => ({ ...er, category_id: '' })) }}
                  selectClass={selectClass}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-[var(--text2)]">Proveedor</label>
                  <button
                    type="button"
                    onClick={() => setSupplierSubModal(true)}
                    className="flex items-center gap-0.5 text-xs text-[var(--accent)] hover:opacity-80 transition-opacity"
                  >
                    <Plus size={12} /> Nuevo
                  </button>
                </div>
                <Select options={supplierOptions} value={form.supplier_id} onChange={set('supplier_id')} placeholder="Sin proveedor" />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-[var(--text2)]">Marca</label>
                  <button
                    type="button"
                    onClick={() => { setNewBrandName(''); setBrandSubModal(true) }}
                    className="flex items-center gap-0.5 text-xs text-[var(--accent)] hover:opacity-80 transition-opacity"
                  >
                    <Plus size={12} /> Nueva
                  </button>
                </div>
                <Select options={brandOptions} value={form.brand_id} onChange={set('brand_id')} placeholder="Sin marca" />
              </div>
            </div>

            {/* Columna derecha */}
            <div className="space-y-4">
              <SectionLabel>Costos y precios</SectionLabel>

              <div className="grid grid-cols-3 gap-3">
                <Input
                  ref={costPriceRef}
                  label="Costo neto"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.cost_price_net}
                  onChange={set('cost_price_net')}
                  placeholder="0.00"
                  error={errors.cost_price_net}
                />
                <Select label="IVA" options={VAT_OPTIONS} value={form.vat_rate} onChange={set('vat_rate')} />
                <Input label="c/ IVA" value={costWithVat ? String(costWithVat) : '0'} readOnly placeholder="0.00" hint="Auto" />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-[var(--text2)]">Precio de venta</label>
                  <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded border border-[var(--border)] bg-[var(--surface2)] text-[var(--text3)]">Alt+F</kbd>
                </div>
                <div className="flex rounded-[var(--radius-md)] border border-[var(--border)] overflow-hidden">
                  {PRICE_MODES.map((opt, i) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPriceMode(opt.value)}
                      className={cn(
                        'flex-1 px-3 py-2.5 text-center transition-colors',
                        i > 0 && 'border-l border-[var(--border)]',
                        currentPriceMode === opt.value
                          ? 'bg-[var(--accent)] text-white'
                          : 'text-[var(--text2)] hover:bg-[var(--surface2)]'
                      )}
                    >
                      <span className="block text-sm font-medium leading-tight">{opt.label}</span>
                      <span className={cn('block text-[10px] mt-0.5 leading-tight', currentPriceMode === opt.value ? 'text-white/70' : 'text-[var(--text3)]')}>
                        {opt.hint}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {currentPriceMode === 'fixed' && (
                <Input
                  ref={sellPriceRef}
                  label="Precio de venta"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.sell_price}
                  onChange={set('sell_price')}
                  placeholder="0.00"
                  error={errors.sell_price}
                />
              )}

              {currentPriceMode === 'list' && costWithVat > 0 && priceLists.length > 0 && (
                <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--surface2)]/35 p-3 space-y-1.5">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text3)]">Precios por lista</p>
                    <p className="text-[10px] text-[var(--text3)]">Editá precio o porcentaje</p>
                  </div>
                  {priceLists.map(list => {
                    const calculated = Math.round(costWithVat * (1 + list.margin_pct / 100) * 100) / 100
                    const overrideVal = overridePrices[list.id] ?? ''
                    const displayPrice = overrideVal !== '' ? Number(overrideVal) : calculated
                    const gain = displayPrice - costWithVat
                    const isOverridden = overrideVal !== ''
                    const mode = overrideModes[list.id] ?? 'pesos'
                    const pctVal = overridePctValues[list.id] ?? ''
                    return (
                      <div key={list.id} className={cn(
                        'rounded-[var(--radius-md)] px-2.5 py-1.5 text-sm transition-colors',
                        isOverridden ? 'bg-[var(--accent)]/8 ring-1 ring-[var(--accent)]/25' : 'bg-[var(--surface)]/75'
                      )}>
                       <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-[var(--text2)] truncate text-xs">{list.name}</p>
                            {isOverridden && (
                              <span className="flex-shrink-0 text-[9px] font-semibold uppercase tracking-wide text-[var(--accent)] bg-[var(--accent)]/12 px-1 py-0.5 rounded">Custom</span>
                            )}
                          </div>
                          <p className="text-[10px] text-[var(--text3)]">
                            {mode === 'pct' && pctVal !== '' ? (
                              <>+{pctVal}%{' '}<span className="text-[var(--text2)] font-medium">= ${displayPrice.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span><span className="ml-1 opacity-50">era +{list.margin_pct}%</span></>
                            ) : (
                              <>+{list.margin_pct}%{isOverridden && mode === 'pesos' && (<span className="ml-1 line-through opacity-50">${calculated.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>)}{' · '}${gain.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <div className="flex rounded border border-[var(--border)] overflow-hidden text-[9px] font-bold">
                            <button
                              type="button"
                              title="Ingresar precio en pesos"
                              onClick={() => { if (mode !== 'pesos') setOverrideModes(prev => { const n = { ...prev }; delete n[list.id]; return n }) }}
                              className={cn('px-1.5 py-0.5 transition-colors', mode === 'pesos' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text3)] hover:bg-[var(--surface2)]')}
                            >$</button>
                            <button
                              type="button"
                              title="Ingresar margen en porcentaje"
                              onClick={() => {
                                if (mode !== 'pct') {
                                  setOverrideModes(prev => ({ ...prev, [list.id]: 'pct' }))
                                  if (overrideVal !== '' && costWithVat > 0) {
                                    const pct = ((Number(overrideVal) / costWithVat - 1) * 100).toFixed(2)
                                    setOverridePctValues(prev => ({ ...prev, [list.id]: pct }))
                                  }
                                }
                              }}
                              className={cn('px-1.5 py-0.5 border-l border-[var(--border)] transition-colors', mode === 'pct' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text3)] hover:bg-[var(--surface2)]')}
                            >%</button>
                          </div>

                          {mode === 'pesos' ? (
                            <>
                              <span className="text-[var(--text3)] text-xs">$</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={overrideVal}
                                onChange={e => {
                                  const v = e.target.value
                                  setOverridePrices(prev => { const next = { ...prev }; if (v === '') delete next[list.id]; else next[list.id] = v; return next })
                                }}
                                placeholder={calculated.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                className={cn(
                                  'w-24 px-2 py-1 text-xs font-medium text-right rounded-[var(--radius-sm)] bg-[var(--surface)] border transition-colors focus:outline-none mono',
                                  isOverridden ? 'border-[var(--accent)]/40 text-[var(--accent)] focus:border-[var(--accent)]' : 'border-[var(--border)] text-[var(--text2)] focus:border-[var(--accent)]'
                                )}
                              />
                              {overrideVal !== '' && costWithVat > 0 && (
                                <span className="text-[9px] font-mono text-[var(--text3)]">= {((Number(overrideVal) / costWithVat - 1) * 100).toFixed(1)}%</span>
                              )}
                            </>
                          ) : (
                            <>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={pctVal}
                                onChange={e => {
                                  const v = e.target.value
                                  setOverridePctValues(prev => ({ ...prev, [list.id]: v }))
                                  if (v !== '' && !isNaN(Number(v)) && costWithVat > 0) {
                                    const pricePesos = Math.round(costWithVat * (1 + Number(v) / 100) * 100) / 100
                                    setOverridePrices(prev => ({ ...prev, [list.id]: String(pricePesos) }))
                                  } else if (v === '') {
                                    setOverridePrices(prev => { const n = { ...prev }; delete n[list.id]; return n })
                                  }
                                }}
                                placeholder={list.margin_pct.toFixed(2)}
                                className={cn(
                                  'w-20 px-2 py-1 text-xs font-medium text-right rounded-[var(--radius-sm)] bg-[var(--surface)] border transition-colors focus:outline-none mono',
                                  pctVal !== '' ? 'border-[var(--accent)]/40 text-[var(--accent)] focus:border-[var(--accent)]' : 'border-[var(--border)] text-[var(--text2)] focus:border-[var(--accent)]'
                                )}
                              />
                              <span className="text-[var(--text3)] text-xs">%</span>
                            </>
                          )}

                          {isOverridden && (
                            <button
                              type="button"
                              onClick={() => {
                                setOverridePrices(prev => { const n = { ...prev }; delete n[list.id]; return n })
                                setOverridePctValues(prev => { const n = { ...prev }; delete n[list.id]; return n })
                                setOverrideModes(prev => { const n = { ...prev }; delete n[list.id]; return n })
                              }}
                              title="Restaurar precio calculado"
                              className="p-1 text-[var(--text3)] hover:text-[var(--danger,#ef4444)] transition-colors"
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>
                       </div>

                       {/* Regla de cantidad por lista (solo listas con cantidad).
                           Si el producto NO tiene ninguna regla → vacío hereda la global.
                           Si tiene al menos una regla → las globales se ignoran y las
                           listas sin "desde" no se auto-aplican (ver hasAnyRule). */}
                       {list.min_quantity != null && (
                         <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-[var(--border)]/50">
                           <span className="text-[10px] text-[var(--text3)]">Se levanta desde</span>
                           <input
                             type="number"
                             min="1"
                             step="1"
                             value={ruleQtys[list.id] ?? ''}
                             onChange={e => {
                               const v = e.target.value
                               setRuleQtys(prev => { const next = { ...prev }; if (v === '') delete next[list.id]; else next[list.id] = v; return next })
                             }}
                             placeholder={String(list.min_quantity)}
                             className={cn(
                               'w-14 px-1.5 py-0.5 text-[11px] font-medium text-center rounded-[var(--radius-sm)] bg-[var(--surface)] border transition-colors focus:outline-none mono',
                               (ruleQtys[list.id] ?? '') !== '' ? 'border-[var(--accent)]/40 text-[var(--accent)] focus:border-[var(--accent)]' : 'border-[var(--border)] text-[var(--text2)] focus:border-[var(--accent)]'
                             )}
                           />
                           <span className="text-[10px] text-[var(--text3)]">unidades</span>
                           {(ruleQtys[list.id] ?? '') === '' ? (
                             hasAnyRule ? (
                               <span className="text-[9px] text-[var(--text3)] ml-auto" title="Como el producto ya tiene reglas propias, esta lista sin cantidad no se auto-aplica. Ponele un 'desde' para que arme un tramo.">no auto-aplica</span>
                             ) : (
                               <span className="text-[9px] text-[var(--text3)] ml-auto">global: {list.min_quantity} u.</span>
                             )
                           ) : (
                             <button
                               type="button"
                               onClick={() => setRuleQtys(prev => { const n = { ...prev }; delete n[list.id]; return n })}
                               title={Object.entries(ruleQtys).some(([id, v]) => id !== list.id && v.trim() !== '' && Number(v) >= 1)
                                 ? 'Quitar esta regla (esta lista dejará de auto-aplicarse mientras haya otras reglas)'
                                 : 'Quitar la regla y volver a la cantidad global de la lista'}
                               className="ml-auto text-[9px] text-[var(--accent)] hover:opacity-80 transition-opacity"
                             >
                               {Object.entries(ruleQtys).some(([id, v]) => id !== list.id && v.trim() !== '' && Number(v) >= 1)
                                 ? 'quitar regla'
                                 : `usar global (${list.min_quantity} u.)`}
                             </button>
                           )}
                         </div>
                       )}
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="pt-2"><SectionLabel>Stock</SectionLabel></div>

              <div className="grid grid-cols-3 gap-3">
                {isEdit ? (
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-[var(--text2)]">Actual</label>
                    <div className="flex items-center gap-1">
                      <div className="flex-1 px-2 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface2)] border border-[var(--border)] text-[var(--text)] mono font-medium">
                        {displayStock}
                      </div>
                      <button
                        type="button"
                        onClick={() => setAdjustStockModal(true)}
                        title="Ajustar stock"
                        className="flex-shrink-0 p-2 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--accent)] hover:bg-[var(--surface2)] transition-colors"
                      >
                        <SlidersHorizontal size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <Input label="Inicial" type="number" min="0" step="1" value={form.initial_stock} onChange={set('initial_stock')} onFocus={numFocus('initial_stock')} onBlur={numBlur('initial_stock')} placeholder="0" />
                )}
                <Input label="Mínimo" type="number" min="0" step="1" value={form.stock_min} onChange={set('stock_min')} onFocus={numFocus('stock_min')} onBlur={numBlur('stock_min')} placeholder="0" error={errors.stock_min} hint="Alerta" />
                <Input label="Máximo" type="number" min="0" step="1" value={form.stock_max} onChange={set('stock_max')} onFocus={numFocus('stock_max')} onBlur={numBlur('stock_max', '9999')} placeholder="9999" error={errors.stock_max} />
              </div>

              <div className="pt-2"><SectionLabel>Descripción (opcional)</SectionLabel></div>

              <textarea
                value={form.description}
                onChange={set('description')}
                placeholder="Descripción opcional del producto..."
                rows={2}
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)] transition-colors resize-none"
              />
            </div>

          </div>
        )}

        {/* Historial de costos — solo en edición */}
        {isEdit && (
          <div className="border border-[var(--border)] rounded-[var(--radius-md)] overflow-hidden">
            <button
              type="button"
              onClick={handleCostHistoryToggle}
              className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors"
            >
              <span>Historial de costos por proveedor</span>
              <ChevronDown size={14} className={cn('transition-transform', costHistoryOpen && 'rotate-180')} />
            </button>
            {costHistoryOpen && (
              <div className="border-t border-[var(--border)]">
                {costHistoryLoading ? (
                  <div className="flex justify-center py-4">
                    <div className="w-5 h-5 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />
                  </div>
                ) : costHistory.length === 0 ? (
                  <p className="text-xs text-[var(--text3)] text-center py-4">Sin historial de compras registrado</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[var(--border)]">
                          <th className="text-left px-3 py-2 text-[var(--text3)] font-medium">Fecha</th>
                          <th className="text-left px-3 py-2 text-[var(--text3)] font-medium">Proveedor</th>
                          <th className="text-right px-3 py-2 text-[var(--text3)] font-medium">P. orden</th>
                          <th className="text-right px-3 py-2 text-[var(--text3)] font-medium">Aplicado</th>
                          <th className="text-left px-3 py-2 text-[var(--text3)] font-medium">Criterio</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {costHistory.map(h => (
                          <tr key={h.id}>
                            <td className="px-3 py-2 mono text-[var(--text2)]">
                              {new Date(h.recorded_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                            </td>
                            <td className="px-3 py-2 text-[var(--text)]">{h.suppliers?.name ?? <span className="text-[var(--text3)]">—</span>}</td>
                            <td className="px-3 py-2 text-right mono text-[var(--text2)]">{formatCurrency(h.unit_cost)}</td>
                            <td className="px-3 py-2 text-right mono font-medium text-[var(--text)]">{formatCurrency(h.applied_cost)}</td>
                            <td className="px-3 py-2 text-[var(--text3)]">{DECISION_LABELS[h.decision] ?? h.decision}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>

      {/* Footer */}
      <div className="sticky bottom-0 z-10 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end px-5 py-4 bg-[var(--bg)] border-t border-[var(--border)]">
        <Button variant="secondary" onClick={requestClose} disabled={saving}>Cancelar</Button>
        {!isEdit && (
          <Button variant="secondary" onClick={handleSaveAndNew} loading={saving}>
            Guardar y agregar otro
          </Button>
        )}
        <Button onClick={handleSave} loading={saving}>
          {isEdit ? 'Guardar cambios' : 'Crear producto'}
          <kbd className="ml-2 px-1.5 py-0.5 text-[10px] font-mono rounded border border-white/30 bg-white/10 text-white/80">⌘/Ctrl + ↵</kbd>
        </Button>
      </div>

      {/* Sub-modal: Ajuste de stock */}
      <AdjustStockModal
        open={adjustStockModal}
        onClose={() => setAdjustStockModal(false)}
        onSaved={(delta) => {
          setAdjustStockModal(false)
          onSaved()
          // El ajuste modifica el stock del producto por `delta` (el total varía en
          // la misma magnitud que el depósito). Reconciliamos contra el lag de la
          // réplica en vez de pisar el input con el valor viejo del refetch.
          if (product && typeof delta === 'number') {
            reconcileStock(product.id, displayStock, displayStock + delta)
          }
        }}
        product={product}
        stockCurrent={displayStock}
        warehouseId={workstation?.warehouse_id}
      />

      {/* Sub-modal: Nuevo proveedor */}
      <SupplierModal
        open={supplierSubModal}
        onClose={() => setSupplierSubModal(false)}
        onSaved={handleSupplierSaved}
        zIndex={60}
      />

      {/* Sub-modal: Nueva categoría */}
      {categorySubModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-sm bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-2xl p-5 space-y-4">
            <h3 className="text-base font-semibold text-[var(--text)]">Nueva categoría</h3>
            <Input
              label="Nombre *"
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  e.stopPropagation()
                  if (newCatName.trim() && !savingCat) handleCategoryQuickSave()
                }
              }}
              placeholder="Ej: Bebidas, Lácteos..."
              autoFocus
            />
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-[var(--text2)]">Categoría padre</label>
              <CategoryTreePicker
                categoryMap={categoryMap}
                childrenMap={childrenMap}
                value={newCatParent}
                onChange={setNewCatParent}
                rootLabel="Sin padre (categoría principal)"
                selectClass={selectClass}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setCategorySubModal(false)} disabled={savingCat}>Cancelar</Button>
              <Button onClick={handleCategoryQuickSave} loading={savingCat} disabled={!newCatName.trim()}>Crear categoría</Button>
            </div>
          </div>
        </div>
      )}

      {/* Sub-modal: Nueva marca */}
      {brandSubModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-sm bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-2xl p-5 space-y-4">
            <h3 className="text-base font-semibold text-[var(--text)]">Nueva marca</h3>
            <Input
              label="Nombre *"
              value={newBrandName}
              onChange={e => setNewBrandName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  e.stopPropagation()
                  if (newBrandName.trim() && !savingBrand) handleBrandQuickSave()
                }
              }}
              placeholder="Ej: Arcor"
              autoFocus
            />
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setBrandSubModal(false)} disabled={savingBrand}>Cancelar</Button>
              <Button onClick={handleBrandQuickSave} loading={savingBrand} disabled={!newBrandName.trim()}>Crear marca</Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmación al salir con cambios sin guardar */}
      <ConfirmDialog
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        onConfirm={() => { setConfirmClose(false); onClose() }}
        title="Cambios sin guardar"
        message="Tenés cambios sin guardar. Si salís ahora se van a descartar."
        confirmLabel="Descartar y salir"
        danger
      />
    </div>
  )
}
