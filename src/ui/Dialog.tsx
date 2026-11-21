import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { CloseIcon } from './icons.tsx'

type Props = {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  className?: string
}

/**
 * Modal built on the native <dialog>: the browser makes the rest of the page inert, traps
 * Tab inside, and closes on Escape. Focus returns to whatever opened it.
 */
export function Dialog({ open, title, onClose, children, className }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  // True while the parent is closing the dialog (e.g. switching to another dialog), so that close
  // isn't reported back as the player dismissing it.
  const closingFromProp = useRef(false)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      dialog.showModal()
    } else if (!open && dialog.open) {
      closingFromProp.current = true
      dialog.close()
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      className={`dialog ${className ?? ''}`}
      aria-labelledby={titleId}
      onClose={() => {
        if (closingFromProp.current) {
          closingFromProp.current = false
          return
        }
        onClose()
        // Return focus to the opener; for the first-visit tutorial (no opener), go to the puzzle.
        const target = opener.current?.isConnected ? opener.current : document.getElementById('puzzle')
        target?.focus()
      }}
      onClick={event => {
        // A click on the backdrop (outside the dialog box) closes it.
        if (event.target === event.currentTarget) {
          const box = event.currentTarget.getBoundingClientRect()
          const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom
          if (!inside) event.currentTarget.close()
        }
      }}
    >
      <div className="dialog__inner">
        <header className="dialog__header">
          <h2 id={titleId} className="dialog__title">{title}</h2>
          <button type="button" className="icon-button" onClick={() => ref.current?.close()} aria-label="Close">
            <CloseIcon />
          </button>
        </header>
        {open && children}
      </div>
    </dialog>
  )
}
