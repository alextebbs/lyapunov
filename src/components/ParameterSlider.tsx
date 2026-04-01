interface Props {
  label: string
  value: number
  min: number
  max: number
  step: number
  defaultValue: number
  onChange: (v: number) => void
}

export function ParameterSlider({ label, value, min, max, step, defaultValue, onChange }: Props) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <label className="text-xs text-white/60">{label}</label>
        <div className="flex items-center gap-1">
          <span className="text-xs font-mono text-white/80">{value.toFixed(2)}</span>
          {value !== defaultValue && (
            <button
              onClick={() => onChange(defaultValue)}
              className="text-[10px] text-white/30 hover:text-white/60"
              title="Reset to default"
            >
              reset
            </button>
          )}
        </div>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1 appearance-none bg-white/20 rounded cursor-pointer
                   [&::-webkit-slider-thumb]:appearance-none
                   [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                   [&::-webkit-slider-thumb]:rounded-full
                   [&::-webkit-slider-thumb]:bg-white"
      />
    </div>
  )
}
