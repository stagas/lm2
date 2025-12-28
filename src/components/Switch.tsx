import { useEffect, useRef, useState } from 'preact/hooks'

export function Switch({
  checked,
  onChange,
  disabled = false,
  className = '',
}: {
  checked?: boolean
  onChange?: (v: boolean) => void
  disabled?: boolean
  className?: string
}) {
  const [internal, setInternal] = useState<boolean>(checked ?? false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [didMount, setDidMount] = useState(false)

  useEffect(() => {
    if (checked !== undefined) setInternal(checked)
  }, [checked])

  const isOn = checked === undefined ? internal : checked

  function toggle(e: preact.TargetedPointerEvent<HTMLButtonElement>) {
    e.stopPropagation()
    if (disabled) return
    const next = !isOn
    if (checked === undefined) setInternal(next)
    onChange?.(next)
  }

  useEffect(() => {
    if (buttonRef.current && !didMount) {
      setTimeout(() => {
        setDidMount(true)
      }, 500)
    }
  }, [buttonRef])

  return (
    <button
      ref={buttonRef}
      type="button"
      role="switch"
      aria-checked={isOn}
      onPointerDown={toggle}
      disabled={disabled}
      className={`inline-flex items-center ${className} `
        + `w-9 h-5.5 p-1.5 rounded-md border-2 bg-gradient-to-b from-black to-neutral-700 ${
          didMount ? 'transition-colors duration-200' : ''
        } `
        + `${isOn ? 'border-orange-600' : 'border-black'} `
        + `${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        aria-hidden
        className={`block bg-white w-1 h-2 transform ${didMount ? 'transition-transform duration-200' : ''} `
          + `${isOn ? 'translate-x-4' : 'translate-x-0'}`}
      />
    </button>
  )
}

export default Switch
