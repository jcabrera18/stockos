'use client'
import { Printer } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Toggle } from '@/components/ui/Toggle'
import { usePrintSettings, type PrintSettings, type PaperWidth } from '@/hooks/usePrintSettings'

/**
 * Campos de configuración de impresión. Reutilizable en /settings (tarjeta)
 * y en el POS (dentro de un modal), porque los cajeros no acceden a /settings
 * y la impresora se configura por terminal.
 */
export function PrintSettingsFields({
  settings,
  setSettings,
}: {
  settings: PrintSettings
  setSettings: (patch: Partial<PrintSettings>) => void
}) {
  const widthOptions: { value: PaperWidth; label: string; hint: string }[] = [
    { value: 80, label: '80 mm', hint: 'Estándar' },
    { value: 58, label: '58 mm', hint: 'Compacta' },
  ]

  return (
    <div className="space-y-4">
      {/* Ancho de papel */}
      <div>
        <p className="text-xs text-[var(--text3)] mb-2">Ancho de papel</p>
        <div className="grid grid-cols-2 gap-2">
          {widthOptions.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSettings({ paperWidth: opt.value })}
              className={`flex flex-col items-start px-3 py-2.5 rounded-[var(--radius-md)] border text-left transition-all ${
                settings.paperWidth === opt.value
                  ? 'border-[var(--accent)] bg-[var(--accent-subtle)]'
                  : 'border-[var(--border)] bg-[var(--surface2)] hover:border-[var(--accent)]'
              }`}
            >
              <span className={`text-sm font-semibold ${settings.paperWidth === opt.value ? 'text-[var(--accent)]' : 'text-[var(--text)]'}`}>
                {opt.label}
              </span>
              <span className="text-xs text-[var(--text3)]">{opt.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Impresión automática */}
      <div className="flex items-center justify-between py-1">
        <div className="pr-3">
          <p className="text-sm text-[var(--text)]">Impresión automática</p>
          <p className="text-xs text-[var(--text3)] mt-0.5">
            Imprime el ticket apenas se cierra la venta, sin clic extra
          </p>
        </div>
        <Toggle checked={settings.autoPrint} onChange={v => setSettings({ autoPrint: v })} />
      </div>

      {/* Copias */}
      <div>
        <p className="text-xs text-[var(--text3)] mb-2">Copias por ticket</p>
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map(n => (
            <button
              key={n}
              type="button"
              onClick={() => setSettings({ copies: n })}
              className={`py-2 text-sm font-semibold rounded-[var(--radius-md)] border transition-all ${
                settings.copies === n
                  ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]'
                  : 'border-[var(--border)] bg-[var(--surface2)] text-[var(--text2)] hover:border-[var(--accent)]'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Tamaño de fuente */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-[var(--text3)]">Tamaño de fuente</p>
          <span className="text-xs font-medium text-[var(--text2)]">{Math.round(settings.fontScale * 100)}%</span>
        </div>
        <input
          type="range"
          min={0.8}
          max={1.4}
          step={0.05}
          value={settings.fontScale}
          onChange={e => setSettings({ fontScale: Number(e.target.value) })}
          className="w-full accent-[var(--accent)]"
        />
        <p className="text-xs text-[var(--text3)] mt-1">
          Ajustá si el texto sale muy chico o se corta al borde del papel
        </p>
      </div>
    </div>
  )
}

/** Modal de configuración de impresión, pensado para abrirse desde el POS. */
export function PrintSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings, setSettings } = usePrintSettings()

  return (
    <Modal open={open} onClose={onClose} title="Impresión del ticket" size="sm">
      <div className="pb-5">
        <div className="flex items-start gap-2 mb-4 px-3 py-2.5 rounded-[var(--radius-md)] bg-[var(--surface2)]">
          <Printer size={15} className="text-[var(--accent)] mt-0.5 flex-shrink-0" />
          <p className="text-xs text-[var(--text3)]">
            Esta configuración se guarda en <strong>esta terminal</strong>. Cada caja puede tener su propia impresora.
          </p>
        </div>
        <PrintSettingsFields settings={settings} setSettings={setSettings} />
      </div>
    </Modal>
  )
}
