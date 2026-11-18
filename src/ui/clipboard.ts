export type ShareOutcome = 'shared' | 'copied' | 'canceled' | 'manual'

/** Copies text to the clipboard. Returns false when the browser refuses. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard) return false
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

const prefersNativeShare = () =>
  typeof navigator.share === 'function' && typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches

/**
 * Uses the native share sheet on touch devices, the clipboard elsewhere, and reports
 * 'manual' when neither works so the caller can show the text for copying by hand.
 */
export async function shareOrCopy(text: string): Promise<ShareOutcome> {
  if (prefersNativeShare() && (navigator.canShare?.({ text }) ?? true)) {
    try {
      await navigator.share({ text })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'canceled'
      // Any other failure falls back to the clipboard.
    }
  }
  return (await copyText(text)) ? 'copied' : 'manual'
}
