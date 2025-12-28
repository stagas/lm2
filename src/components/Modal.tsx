import { createPortal } from 'preact/compat'
import { useEffect } from 'preact/hooks'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  width?: string
  maxWidth?: string
  className?: string
  contentClassName?: string
  children: preact.ComponentChildren
}

export function Modal({
  isOpen,
  onClose,
  title,
  width = 'w-full',
  maxWidth = 'max-w-lg',
  className = '',
  contentClassName = '',
  children,
}: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }

    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const handleBackdropClick = (e: preact.TargetedEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
      <div
        className={`bg-[#1a1a1a] border border-[#333] rounded-lg shadow-xl ${width} ${maxWidth} ${className}`}
        onClick={handleBackdropClick}
      >
        {title && (
          <div className="flex items-center justify-between p-6 border-b border-[#333]">
            <h2 className="text-xl font-semibold text-white">{title}</h2>
            <button
              onClick={onClose}
              className="text-[#888] hover:text-white text-2xl leading-none"
              aria-label="Close modal"
            >
              ×
            </button>
          </div>
        )}
        <div className={`text-white ${contentClassName}`}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}
