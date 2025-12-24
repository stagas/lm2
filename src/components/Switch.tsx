import { useEffect, useState } from 'react'

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

  useEffect(() => {
    if (checked !== undefined) setInternal(checked)
  }, [checked])

  const isOn = checked === undefined ? internal : checked

  function toggle(e: React.PointerEvent<HTMLButtonElement>) {
    e.stopPropagation()
    if (disabled) return
    const next = !isOn
    if (checked === undefined) setInternal(next)
    onChange?.(next)
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOn}
      onPointerDown={toggle}
      disabled={disabled}
      className={`inline-flex items-center ${className} `
        + `w-9 h-5 p-1 rounded-md transition-colors duration-200 `
        + `${isOn ? 'bg-orange-600' : 'bg-gray-700'} `
        + `${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        aria-hidden
        className={`block bg-white w-3.5 h-3.5 rounded-md transform transition-transform duration-200 `
          + `${isOn ? 'translate-x-4' : 'translate-x-0'}`}
      />
    </button>
  )
}

export default Switch
