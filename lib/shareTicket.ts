import { toBlob } from 'html-to-image'

export type ShareTicketResult = 'shared' | 'downloaded' | 'cancelled'

/**
 * Captura un nodo del DOM como PNG y lo comparte por WhatsApp.
 *
 * 1) Web Share nativo (mobile / Mac): adjunta la imagen directo al chat. Si el
 *    usuario cancela el share sheet devolvemos 'cancelled' (no es error).
 * 2) Escritorio sin Web Share: descarga el PNG y abre WhatsApp para adjuntarlo.
 *
 * Lanza si no se pudo generar la imagen; el caller decide cómo notificar.
 */
export async function shareTicketImage(
  node: HTMLElement,
  opts: { fileName: string; customerPhone?: string },
): Promise<ShareTicketResult> {
  // Esperar a que las fuentes terminen de cargar para que el texto no salga
  // en blanco o con fallback (Safari/mobile sobre todo).
  if (document.fonts?.ready) {
    try { await document.fonts.ready } catch { /* noop */ }
  }

  // html-to-image clona SOLO el nodo indicado y respeta colores modernos como
  // oklch de Tailwind v4 — html2canvas fallaba acá.
  const blob = await toBlob(node, {
    backgroundColor: '#ffffff',
    pixelRatio: 2,
    cacheBust: true,
  })
  if (!blob) throw new Error('No se pudo generar la imagen')

  const file = new File([blob], opts.fileName, { type: 'image/png' })

  // Compartir SOLO el archivo. Adjuntar title/text junto a files hace que
  // WhatsApp en macOS duplique la imagen en el compositor.
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return 'shared'
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return 'cancelled'
      // Cualquier otro error real → caemos a la descarga.
    }
  }

  const phone = opts.customerPhone?.replace(/\D/g, '')
  const waUrl = phone ? `https://wa.me/${phone}` : 'https://web.whatsapp.com/'
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = opts.fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10000)
  window.open(waUrl, '_blank')
  return 'downloaded'
}
