'use client'
import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import type { Product, Category, Supplier } from '@/types'
import type { PriceList } from '@/app/price-lists/page'

interface ProductModalProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
  product?: Product | null   // null = crear, Product = editar
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

const emptyForm = {
  name: '',
  barcode: '',
  sku: '',
  description: '',
  category_id: '',
  supplier_id: '',
  cost_price: '',
  stock_current: '',
  stock_min: '',
  stock_max: '',
  unit: 'unidad',
}

export function ProductModal({ open, onClose, onSaved, product }: ProductModalProps) {
  const [form, setForm] = useState(emptyForm)
  const [categories, setCategories] = useState<Category[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [priceLists, setPriceLists] = useState<PriceList[]>([])


  const isEdit = !!product

  // Cargar categorías y proveedores
  useEffect(() => {
    if (!open) return
    api.get<Category[]>('/api/products/categories').then(setCategories).catch(() => { })
    api.get<Supplier[]>('/api/purchases/suppliers').then(setSuppliers).catch(() => { })
    api.get<PriceList[]>('/api/price-lists').then(setPriceLists).catch(() => { })  // ← agregar

  }, [open])

  // Pre-cargar datos al editar
  useEffect(() => {
    if (product) {
      setForm({
        name: product.name,
        barcode: product.barcode ?? '',
        sku: product.sku ?? '',
        description: product.description ?? '',
        category_id: product.category_id ?? '',
        supplier_id: product.supplier_id ?? '',
        cost_price: String(product.cost_price),
        stock_current: String(product.stock_current),
        stock_min: String(product.stock_min),
        stock_max: String(product.stock_max),
        unit: product.unit,
      })
    } else {
      setForm(emptyForm)
    }
    setErrors({})
  }, [product, open])

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(f => ({ ...f, [field]: e.target.value }))
    setErrors(er => ({ ...er, [field]: '' }))
  }

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = 'El nombre es obligatorio'
    if (Number(form.cost_price) < 0) errs.cost_price = 'Debe ser mayor a 0'
    if (Number(form.stock_min) < 0) errs.stock_min = 'Debe ser mayor o igual a 0'
    return errs
  }

  const handleSave = async () => {
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        barcode: form.barcode.trim() || null,
        sku: form.sku.trim() || null,
        description: form.description.trim() || null,
        category_id: form.category_id || null,
        supplier_id: form.supplier_id || null,
        cost_price: Number(form.cost_price) || 0,
        stock_current: Number(form.stock_current) || 0,
        stock_min: Number(form.stock_min) || 0,
        stock_max: Number(form.stock_max) || 9999,
        unit: form.unit,
      }

      if (isEdit) {
        await api.patch(`/api/products/${product!.id}`, payload)
        toast.success('Producto actualizado')
      } else {
        await api.post('/api/products', payload)
        toast.success('Producto creado')
      }

      onSaved()
      onClose()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const categoryOptions = categories.map(c => ({ value: c.id, label: c.name }))
  const supplierOptions = suppliers.map(s => ({ value: s.id, label: s.name }))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar producto' : 'Nuevo producto'}
      size="lg"
    >
      <div className="space-y-5">

        {/* Fila 1: Nombre + Unidad */}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Input
              label="Nombre *"
              value={form.name}
              onChange={set('name')}
              placeholder="Ej: Coca Cola 500ml"
              error={errors.name}
            />
          </div>
          <Select
            label="Unidad"
            options={UNITS}
            value={form.unit}
            onChange={set('unit')}
          />
        </div>

        {/* Fila 2: Código de barras + SKU */}
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Código de barras (EAN)"
            value={form.barcode}
            onChange={set('barcode')}
            placeholder="7790895000152"
          />
          <Input
            label="SKU interno"
            value={form.sku}
            onChange={set('sku')}
            placeholder="COC-500"
          />
        </div>

        {/* Fila 3: Categoría + Proveedor */}
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Categoría"
            options={categoryOptions}
            value={form.category_id}
            onChange={set('category_id')}
            placeholder="Sin categoría"
          />
          <Select
            label="Proveedor"
            options={supplierOptions}
            value={form.supplier_id}
            onChange={set('supplier_id')}
            placeholder="Sin proveedor"
          />
        </div>

        {/* Fila 4: Precios */}
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Precio de costo"
            type="number"
            min="0"
            step="0.01"
            value={form.cost_price}
            onChange={set('cost_price')}
            placeholder="0.00"
            error={errors.cost_price}
          />
        </div>

        {/* Precios por lista */}
        {form.cost_price && Number(form.cost_price) > 0 && categories.length >= 0 && (
          <div className="px-3 py-2 bg-[var(--surface2)] rounded-[var(--radius-md)] space-y-1.5">
            <p className="text-xs font-medium text-[var(--text3)] mb-1">Precio según lista</p>
            {priceLists.slice(0, 3).map(list => {
              const price = Math.round(Number(form.cost_price) * (1 + list.margin_pct / 100) * 100) / 100
              const gain = price - Number(form.cost_price)
              return (
                <div key={list.id} className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text2)]">{list.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[var(--text3)]">
                      +{list.margin_pct}% · ganancia ${gain.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="font-semibold mono text-[var(--accent)]">
                      ${price.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Fila 5: Stock */}
        <div className="grid grid-cols-3 gap-3">
          <Input
            label={isEdit ? 'Stock actual' : 'Stock inicial'}
            type="number"
            min="0"
            step="1"
            value={form.stock_current}
            onChange={set('stock_current')}
            placeholder="0"
            hint={isEdit ? 'Usá ajuste de stock para modificar' : undefined}
            disabled={isEdit}
          />
          <Input
            label="Stock mínimo"
            type="number"
            min="0"
            step="1"
            value={form.stock_min}
            onChange={set('stock_min')}
            placeholder="0"
            error={errors.stock_min}
            hint="Alerta si baja de este valor"
          />
          <Input
            label="Stock máximo"
            type="number"
            min="0"
            step="1"
            value={form.stock_max}
            onChange={set('stock_max')}
            placeholder="9999"
          />
        </div>

        {/* Descripción */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-[var(--text2)]">Descripción</label>
          <textarea
            value={form.description}
            onChange={set('description')}
            placeholder="Descripción opcional del producto..."
            rows={2}
            className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)] transition-colors resize-none"
          />
        </div>

        {/* Acciones */}
        {/* Footer sticky dentro del scroll */}
        <div className="sticky bottom-0 bg-[var(--surface)] pt-3 pb-5 mt-4 border-t border-[var(--border)]">
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} loading={saving}>
              {isEdit ? 'Guardar cambios' : 'Crear producto'}
            </Button>
          </div>
        </div>

      </div>
    </Modal>
  )
}
