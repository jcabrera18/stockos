'use client'
import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { PlanLimitBanner } from '@/components/modules/PlanLimitBanner'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import { Upload, ShieldCheck, Receipt } from 'lucide-react'

const IVA_OPTIONS = [
  { value: 'RI', label: 'Responsable Inscripto (Facturas A/B)' },
  { value: 'MO', label: 'Monotributista (Facturas C)' },
  { value: 'EX', label: 'Exento' },
]

const ENV_OPTIONS = [
  { value: 'homo', label: 'Homologación (testing)' },
  { value: 'prod', label: 'Producción' },
]

interface FiscalConfig {
  cuit: string
  razon_social: string | null
  iva_condition: string
  afip_punto_venta: number
  afip_environment: string
  is_active: boolean
  has_cert: boolean
  has_key: boolean
}

interface Props {
  open: boolean
  onClose: () => void
  branchId: string
  branchName: string
  /** El plan del negocio habilita el emisor fiscal por sucursal (multilocal+) */
  canUse: boolean
}

// Carga el .crt/.key como TEXTO para conservar los saltos de línea del PEM.
function readPemFile(
  file: File | undefined,
  setContent: (v: string) => void,
  setName: (v: string) => void,
  expected: RegExp,
  label: string,
) {
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const text = String(reader.result ?? '')
    if (!expected.test(text)) {
      toast.error(`El archivo no parece un ${label} válido (falta el encabezado -----BEGIN...).`)
      return
    }
    setContent(text)
    setName(file.name)
  }
  reader.onerror = () => toast.error('No se pudo leer el archivo')
  reader.readAsText(file)
}

export function BranchFiscalModal({ open, onClose, branchId, branchName, canUse }: Props) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving]   = useState(false)

  const [cuit, setCuit]                 = useState('')
  const [razonSocial, setRazonSocial]   = useState('')
  const [ivaCondition, setIvaCondition] = useState('RI')
  const [ptoVenta, setPtoVenta]         = useState('')
  const [env, setEnv]                   = useState('homo')

  const [cert, setCert]         = useState('')
  const [key, setKey]           = useState('')
  const [certName, setCertName] = useState('')
  const [keyName, setKeyName]   = useState('')
  const [hasCert, setHasCert]   = useState(false)
  const [hasKey, setHasKey]     = useState(false)

  useEffect(() => {
    if (!open) return
    // Reset y carga
    setCert(''); setKey(''); setCertName(''); setKeyName('')
    setLoading(true)
    api.get<FiscalConfig | null>(`/api/branches/${branchId}/fiscal-config`)
      .then(cfg => {
        if (cfg) {
          setCuit(cfg.cuit ?? '')
          setRazonSocial(cfg.razon_social ?? '')
          setIvaCondition(cfg.iva_condition ?? 'RI')
          setPtoVenta(cfg.afip_punto_venta ? String(cfg.afip_punto_venta) : '')
          setEnv(cfg.afip_environment ?? 'homo')
          setHasCert(cfg.has_cert)
          setHasKey(cfg.has_key)
        } else {
          setCuit(''); setRazonSocial(''); setIvaCondition('RI'); setPtoVenta(''); setEnv('homo')
          setHasCert(false); setHasKey(false)
        }
      })
      .catch(() => toast.error('No se pudo cargar la configuración fiscal'))
      .finally(() => setLoading(false))
  }, [open, branchId])

  const handleSave = async () => {
    if (!cuit.trim())     return toast.error('Ingresá el CUIT')
    if (!ptoVenta.trim()) return toast.error('Ingresá el punto de venta')
    // Al crear (aún sin cert guardado) exigimos subir cert + key.
    if (!hasCert && !cert.trim()) return toast.error('Subí el certificado digital')
    if (!hasKey && !key.trim())   return toast.error('Subí la clave privada')

    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        cuit: cuit.trim(),
        razon_social: razonSocial.trim() || null,
        iva_condition: ivaCondition,
        afip_punto_venta: Number(ptoVenta),
        afip_environment: env,
      }
      if (cert.trim()) payload.afip_cert = cert.trim()
      if (key.trim())  payload.afip_key  = key.trim()

      await api.put(`/api/branches/${branchId}/fiscal-config`, payload)
      toast.success('Configuración fiscal guardada')
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={`Configuración fiscal · ${branchName}`}
      footer={canUse ? (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Guardando...' : 'Guardar emisor'}
          </Button>
        </div>
      ) : undefined}
    >
      {!canUse ? (
        <div className="space-y-3">
          <PlanLimitBanner
            title="Facturar con un CUIT propio por sucursal es del plan Multilocal"
            subtitle="Cada sucursal puede emitir con su propio CUIT, punto de venta y certificado ARCA. Actualizá tu plan para habilitarlo."
          />
        </div>
      ) : loading ? (
        <div className="py-8 text-center text-sm text-[var(--text3)]">Cargando…</div>
      ) : (
        <div className="space-y-4">
          <p className="flex items-start gap-2 text-xs text-[var(--text3)] bg-[var(--surface2)] rounded-[var(--radius-md)] p-2.5">
            <Receipt size={14} className="text-[var(--accent)] shrink-0 mt-0.5" />
            Esta sucursal facturará ante ARCA con este CUIT y punto de venta. Las ventas de esta sucursal se emiten con este emisor; el resto usa el emisor por defecto del negocio (Configuración).
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-[var(--text3)] mb-1">CUIT (sin guiones)</p>
              <Input value={cuit} onChange={e => setCuit(e.target.value)} placeholder="20123456789" />
            </div>
            <div>
              <p className="text-xs text-[var(--text3)] mb-1">Razón social</p>
              <Input value={razonSocial} onChange={e => setRazonSocial(e.target.value)} placeholder="Nombre fiscal" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-[var(--text3)] mb-1">Condición IVA</p>
              <Select options={IVA_OPTIONS} value={ivaCondition} onChange={e => setIvaCondition(e.target.value)} />
            </div>
            <div>
              <p className="text-xs text-[var(--text3)] mb-1">Ambiente</p>
              <Select options={ENV_OPTIONS} value={env} onChange={e => setEnv(e.target.value)} />
            </div>
            <div>
              <p className="text-xs text-[var(--text3)] mb-1">Punto de venta</p>
              <Input type="number" min="1" max="99999" value={ptoVenta} onChange={e => setPtoVenta(e.target.value)} placeholder="Ej: 2" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-[var(--text3)] mb-1">
                Certificado digital (.crt / .pem)
                {hasCert && <span className="ml-1 text-[var(--accent)]">· cargado</span>}
              </p>
              <label className="flex flex-col items-center justify-center gap-1 w-full h-[92px] text-xs text-[var(--text3)] bg-[var(--surface2)] border border-dashed border-[var(--border)] rounded-[var(--radius-md)] cursor-pointer hover:border-[var(--accent)] transition-colors">
                {hasCert && !certName ? <ShieldCheck size={18} className="text-[var(--accent)]" /> : <Upload size={18} className={certName ? 'text-[var(--accent)]' : ''} />}
                <span className={certName ? 'text-[var(--accent)] font-medium' : ''}>
                  {certName || (hasCert ? 'Reemplazar .crt' : 'Elegir archivo .crt')}
                </span>
                <input type="file" accept=".crt,.pem,.cer,application/x-x509-ca-cert,application/pkix-cert" className="hidden"
                  onChange={e => readPemFile(e.target.files?.[0], setCert, setCertName, /-----BEGIN CERTIFICATE-----/, 'certificado')} />
              </label>
            </div>
            <div>
              <p className="text-xs text-[var(--text3)] mb-1">
                Clave privada (.key)
                {hasKey && <span className="ml-1 text-[var(--accent)]">· cargada</span>}
              </p>
              <label className="flex flex-col items-center justify-center gap-1 w-full h-[92px] text-xs text-[var(--text3)] bg-[var(--surface2)] border border-dashed border-[var(--border)] rounded-[var(--radius-md)] cursor-pointer hover:border-[var(--accent)] transition-colors">
                {hasKey && !keyName ? <ShieldCheck size={18} className="text-[var(--accent)]" /> : <Upload size={18} className={keyName ? 'text-[var(--accent)]' : ''} />}
                <span className={keyName ? 'text-[var(--accent)] font-medium' : ''}>
                  {keyName || (hasKey ? 'Reemplazar .key' : 'Elegir archivo .key')}
                </span>
                <input type="file" accept=".key,.pem" className="hidden"
                  onChange={e => readPemFile(e.target.files?.[0], setKey, setKeyName, /-----BEGIN (RSA |EC |ENCRYPTED )?PRIVATE KEY-----/, 'clave privada')} />
              </label>
            </div>
          </div>

          {env === 'prod' && (
            <p className="text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-[var(--radius-md)] p-2">
              Ambiente de <strong>producción</strong>: los comprobantes de esta sucursal serán válidos ante ARCA.
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}
