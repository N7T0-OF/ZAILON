interface ToggleProps {
  checked: boolean
  onChange: () => void
  size?: 'sm' | 'md'
}

export function Toggle({ checked, onChange, size = 'md' }: ToggleProps) {
  const sm = size === 'sm'
  return (
    <button
      onClick={onChange}
      className={`relative rounded-full transition-all duration-200 flex-shrink-0 ${
        sm ? 'w-7 h-4' : 'w-9 h-5'
      } ${checked ? 'bg-gold' : 'bg-ink-50'}`}
    >
      <span className={`absolute top-0.5 rounded-full bg-white transition-all duration-200 ${
        sm ? 'w-3 h-3' : 'w-4 h-4'
      } ${checked ? (sm ? 'left-3.5' : 'left-4') : 'left-0.5'}`} />
    </button>
  )
}
