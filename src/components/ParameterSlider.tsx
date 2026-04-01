interface Props {
  label: string
  value: number
  min: number
  max: number
  step?: number
  defaultValue: number
  onChange: (v: number) => void
  precision?: number
}

export function ParameterSlider({ label, value, min, max, step, defaultValue, onChange, precision = 3 }: Props) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center min-h-[24px]">
        <label className="text-xs text-white/60">{label}</label>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-white/80">{value.toFixed(precision)}</span>
          {Math.abs(value - defaultValue) > 0.001 && (
            <button
              onClick={() => onChange(defaultValue)}
              className="text-[11px] px-1.5 py-0.5 rounded bg-white/10 text-white/40 hover:text-white/70 hover:bg-white/15 active:bg-white/20"
              title="Reset to default"
            >
              reset
            </button>
          )}
        </div>
      </div>
      <input
        type="range"
        min={min} max={max} step={step ?? 'any'}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-2 appearance-none bg-white/15 rounded-full cursor-pointer touch-none
                   [&::-webkit-slider-thumb]:appearance-none
                   [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
                   [&::-webkit-slider-thumb]:rounded-full
                   [&::-webkit-slider-thumb]:bg-white
                   [&::-webkit-slider-thumb]:shadow-[0_0_4px_rgba(0,0,0,0.4)]
                   [&::-webkit-slider-thumb]:active:w-6 [&::-webkit-slider-thumb]:active:h-6
                   [&::-moz-range-thumb]:appearance-none
                   [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5
                   [&::-moz-range-thumb]:rounded-full
                   [&::-moz-range-thumb]:bg-white
                   [&::-moz-range-thumb]:border-none
                   [&::-moz-range-thumb]:shadow-[0_0_4px_rgba(0,0,0,0.4)]"
      />
    </div>
  )
}
