'use client'
import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/Input'
import { MoneyInput } from '@/components/ui/MoneyInput'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { ArrowLeft } from 'lucide-react'
import type { CustomerSummary, DeliveryZone, ClientCategory } from '@/app/customers/page'

interface PriceList {
  id: string
  name: string
}

const IVA_CONDITIONS = [
  { value: 'consumidor_final',      label: 'Consumidor Final' },
  { value: 'responsable_inscripto', label: 'Responsable Inscripto' },
  { value: 'monotributista',        label: 'Monotributista' },
  { value: 'exento',                label: 'Exento' },
  { value: 'no_responsable',        label: 'No Responsable' },
]

const DOCUMENT_TYPES = [
  { value: 'DNI',       label: 'DNI' },
  { value: 'CUIT',      label: 'CUIT' },
  { value: 'CUIL',      label: 'CUIL' },
  { value: 'RUT',       label: 'RUT' },
  { value: 'CI',        label: 'CI' },
  { value: 'Pasaporte', label: 'Pasaporte' },
  { value: 'Otro',      label: 'Otro' },
]

const LATAM_COUNTRIES = [
  'Argentina', 'Bolivia', 'Brasil', 'Chile', 'Colombia',
  'Ecuador', 'México', 'Paraguay', 'Perú', 'Uruguay', 'Venezuela',
].map(c => ({ value: c, label: c }))

const AR_PROVINCES = [
  'Buenos Aires', 'CABA', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba',
  'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja',
  'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta', 'San Juan',
  'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero',
  'Tierra del Fuego', 'Tucumán',
].map(p => ({ value: p, label: p }))

const empty = {
  customer_code:      '',
  full_name:          '',
  razon_social:       '',
  nombre_fantasia:    '',
  iva_condition:      '',
  contact_name:       '',
  document_type:      '',
  document:           '',
  phone:              '',
  email:              '',
  address:            '',
  locality:           '',
  province:           '',
  postal_code:        '',
  country:            'Argentina',
  birthdate:          '',
  credit_limit:       '',
  notes:              '',
  delivery_zone_id:   '',
  client_category_id: '',
  price_list_id:      '',
}

interface CustomerFormProps {
  customer: CustomerSummary | null
  onSaved: () => void
  onClose: () => void
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text3)]">
      {children}
    </p>
  )
}

const _cache: {
  zones: DeliveryZone[] | null
  categories: ClientCategory[] | null
  priceLists: PriceList[] | null
} = { zones: null, categories: null, priceLists: null }

export function CustomerForm({ customer, onSaved, onClose }: CustomerFormProps) {
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [zones, setZones] = useState<DeliveryZone[]>([])
  const [categories, setCategories] = useState<ClientCategory[]>([])
  const [priceLists, setPriceLists] = useState<PriceList[]>([])
  const nameInputRef = useRef<HTMLInputElement>(null)

  const isEdit = !!customer

  useEffect(() => {
    const load = async () => {
      const [z, c, p] = await Promise.all([
        _cache.zones ?? api.get<DeliveryZone[]>('/api/delivery-zones'),
        _cache.categories ?? api.get<ClientCategory[]>('/api/client-categories'),
        _cache.priceLists ?? api.get<PriceList[]>('/api/price-lists'),
      ])
      _cache.zones = z; setZones(z)
      _cache.categories = c; setCategories(c)
      _cache.priceLists = p; setPriceLists(p)
    }
    load().catch(() => {})
  }, [])

  useEffect(() => {
    if (!customer) {
      setForm(empty)
      setErrors({})
      requestAnimationFrame(() => nameInputRef.current?.focus())
      return
    }
    setErrors({})
    api.get<CustomerSummary>(`/api/customers/${customer.id}`)
      .then(data => {
        setForm({
          customer_code:      data.customer_code ?? '',
          full_name:          data.full_name,
          razon_social:       data.razon_social ?? '',
          nombre_fantasia:    data.nombre_fantasia ?? '',
          iva_condition:      data.iva_condition ?? '',
          contact_name:       data.contact_name ?? '',
          document_type:      data.document_type ?? '',
          document:           data.document ?? '',
          phone:              data.phone ?? '',
          email:              data.email ?? '',
          address:            data.address ?? '',
          locality:           data.locality ?? '',
          province:           data.province ?? '',
          postal_code:        data.postal_code ?? '',
          country:            data.country ?? 'Argentina',
          birthdate:          data.birthdate ?? '',
          credit_limit:       data.credit_limit > 0 ? String(data.credit_limit) : '',
          notes:              data.notes ?? '',
          delivery_zone_id:   data.delivery_zone_id ?? '',
          client_category_id: data.client_category_id ?? '',
          price_list_id:      data.price_list_id ?? '',
        })
      })
      .catch(() => toast.error('Error al cargar datos del cliente'))
  }, [customer])

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(f => ({ ...f, [field]: e.target.value }))
    setErrors(er => ({ ...er, [field]: '' }))
  }
  const setMoney = (field: string) => (v: string) => {
    setForm(f => ({ ...f, [field]: v }))
    setErrors(er => ({ ...er, [field]: '' }))
  }

  const handleSave = async (mode: 'close' | 'create-another' = 'close') => {
    if (!form.full_name.trim()) { setErrors({ full_name: 'El nombre es obligatorio' }); return }
    setSaving(true)
    try {
      const payload = {
        customer_code:      form.customer_code.trim() || null,
        full_name:          form.full_name.trim(),
        razon_social:       form.razon_social.trim() || null,
        nombre_fantasia:    form.nombre_fantasia.trim() || null,
        iva_condition:      form.iva_condition || null,
        contact_name:       form.contact_name.trim() || null,
        document_type:      form.document_type || null,
        document:           form.document.trim() || null,
        phone:              form.phone.trim() || null,
        email:              form.email.trim() || null,
        address:            form.address.trim() || null,
        locality:           form.locality.trim() || null,
        province:           form.province.trim() || null,
        postal_code:        form.postal_code.trim() || null,
        country:            form.country || null,
        birthdate:          form.birthdate || null,
        credit_limit:       Number(form.credit_limit) || 0,
        notes:              form.notes.trim() || null,
        delivery_zone_id:   form.delivery_zone_id || null,
        client_category_id: form.client_category_id || null,
        price_list_id:      form.price_list_id || null,
      }
      if (isEdit) {
        await api.patch(`/api/customers/${customer!.id}`, payload)
        toast.success('Cliente actualizado')
        onSaved()
        onClose()
      } else {
        await api.post('/api/customers', payload)
        toast.success(mode === 'create-another' ? 'Cliente creado. Listo para cargar otro.' : 'Cliente creado')
        onSaved()
        if (mode === 'create-another') {
          setForm(empty)
          setErrors({})
          requestAnimationFrame(() => nameInputRef.current?.focus())
        } else {
          onClose()
        }
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const isArgentina = form.country === 'Argentina'
  const zoneOptions = zones.map(z => ({ value: z.id, label: z.name }))
  const categoryOptions = categories.map(c => ({ value: c.id, label: c.name }))
  const priceListOptions = priceLists.map(p => ({ value: p.id, label: p.name }))

  return (
    <div className="flex flex-col min-h-full">

      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-5 py-4 bg-[var(--bg)] border-b border-[var(--border)]">
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-[var(--radius-md)] text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors"
          title="Cerrar"
        >
          <ArrowLeft size={16} />
        </button>
        <h2 className="text-base font-semibold text-[var(--text)] flex-1">
          {isEdit ? customer!.full_name : 'Nuevo cliente'}
        </h2>
      </div>

      {/* Content */}
      <div className="flex-1 p-5">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-x-8">

          {/* Columna izquierda */}
          <div className="space-y-5 sm:border-r sm:border-[var(--border)] sm:pr-6">

            <div className="space-y-3">
              <SectionLabel>Empresa</SectionLabel>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Razón social" value={form.razon_social} onChange={set('razon_social')}
                  placeholder="Ej: García e Hijos S.R.L." />
                <Input label="Nombre de fantasía" value={form.nombre_fantasia} onChange={set('nombre_fantasia')}
                  placeholder="Ej: El Económico" />
                <Input label="Persona de contacto" value={form.contact_name} onChange={set('contact_name')}
                  placeholder="Ej: María García" />
                <Select label="Condición IVA" value={form.iva_condition} onChange={set('iva_condition')}
                  options={IVA_CONDITIONS} placeholder="Seleccionar..." />
              </div>
            </div>

            <div className="space-y-3">
              <SectionLabel>Datos básicos</SectionLabel>
              <div className="grid grid-cols-2 gap-3">
                <Input ref={nameInputRef} label="Nombre y apellido *" value={form.full_name} onChange={set('full_name')}
                  placeholder="Ej: Juan García" error={errors.full_name} autoFocus={!isEdit} />
                <Input label="Código" value={form.customer_code} onChange={set('customer_code')}
                  placeholder="Ej: CLI-001" />
                <Select label="Tipo de documento" value={form.document_type} onChange={set('document_type')}
                  options={DOCUMENT_TYPES} placeholder="Seleccionar..." />
                <Input label="Número de documento" value={form.document} onChange={set('document')}
                  placeholder="Ej: 20-12345678-9" />
                <Input label="Teléfono" value={form.phone} onChange={set('phone')} placeholder="+54 11 1234-5678" />
                <Input label="Email" type="email" value={form.email} onChange={set('email')} placeholder="cliente@email.com" />
                <Input label="Fecha de nacimiento" type="date" value={form.birthdate} onChange={set('birthdate')} />
              </div>
            </div>

          </div>

          {/* Columna derecha */}
          <div className="space-y-5">

            <div className="space-y-3">
              <SectionLabel>Clasificación</SectionLabel>
              <div className="grid grid-cols-2 gap-3">
                <Select label="Zona de entrega" value={form.delivery_zone_id} onChange={set('delivery_zone_id')}
                  options={zoneOptions} placeholder="Sin zona" />
                <Select label="Categoría" value={form.client_category_id} onChange={set('client_category_id')}
                  options={categoryOptions} placeholder="Sin categoría" />
                <MoneyInput label="Límite de crédito"
                  value={form.credit_limit} onChange={setMoney('credit_limit')} placeholder="0 = sin límite" />
                {priceListOptions.length > 0 ? (
                  <Select label="Lista de precios" value={form.price_list_id} onChange={set('price_list_id')}
                    options={priceListOptions} placeholder="Sin lista asignada" />
                ) : <div />}
              </div>
            </div>

            <div className="space-y-3">
              <SectionLabel>Ubicación</SectionLabel>
              <div className="grid grid-cols-2 gap-3">
                <Select label="País" value={form.country} onChange={set('country')}
                  options={LATAM_COUNTRIES} placeholder="Seleccionar..." />
                {isArgentina ? (
                  <Select label="Provincia" value={form.province} onChange={set('province')}
                    options={AR_PROVINCES} placeholder="Seleccionar..." />
                ) : (
                  <Input label="Provincia / Estado" value={form.province} onChange={set('province')}
                    placeholder="Ej: São Paulo" />
                )}
                <Input label="Localidad" value={form.locality} onChange={set('locality')} placeholder="Ej: Palermo" />
                <Input label="Código postal" value={form.postal_code} onChange={set('postal_code')} placeholder="Ej: 1425" />
                <div className="col-span-2">
                  <Input label="Dirección" value={form.address} onChange={set('address')}
                    placeholder="Calle, número, piso..." />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-[var(--text2)]">Notas</label>
              <textarea
                value={form.notes}
                onChange={set('notes')}
                rows={3}
                placeholder="Observaciones del cliente..."
                className="w-full px-3 py-2 text-sm rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[var(--accent)] resize-none"
              />
            </div>

          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 z-10 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end px-5 py-4 bg-[var(--bg)] border-t border-[var(--border)]">
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
        {!isEdit && (
          <Button variant="secondary" onClick={() => void handleSave('create-another')} loading={saving}>
            Guardar y crear otro
          </Button>
        )}
        <Button onClick={() => void handleSave('close')} loading={saving}>
          {isEdit ? 'Guardar cambios' : 'Crear cliente'}
        </Button>
      </div>

    </div>
  )
}
