import { useAppState } from '../state/context'
import { ParameterSlider } from './ParameterSlider'

const LAMBDA_PRESETS: { label: string; range: [number, number] }[] = [
  { label: 'Micro', range: [-0.05, 0.05] },
  { label: 'Tight', range: [-0.2, 0.2] },
  { label: 'Default', range: [-0.5, 0.5] },
  { label: 'Wide', range: [-1.5, 1.5] },
  { label: 'Full', range: [-3, 3] },
]

export function ParameterControls() {
  const { lambdaRange, x0, setLambdaRange, setX0 } = useAppState()

  return (
    <div className="space-y-3">
      <label className="text-xs font-medium text-white/60 uppercase tracking-wider">
        Parameters
      </label>

      <ParameterSlider
        label="Initial x₀"
        value={x0}
        min={0.01}
        max={0.99}
        step={0.01}
        defaultValue={0.5}
        onChange={setX0}
      />

      <div className="space-y-1">
        <ParameterSlider
          label="Lambda Min"
          value={lambdaRange[0]}
          min={-3}
          max={0}
          step={0.05}
          defaultValue={-0.5}
          onChange={v => setLambdaRange([v, lambdaRange[1]])}
        />
        <ParameterSlider
          label="Lambda Max"
          value={lambdaRange[1]}
          min={0}
          max={3}
          step={0.05}
          defaultValue={0.5}
          onChange={v => setLambdaRange([lambdaRange[0], v])}
        />
        <div className="flex gap-1 flex-wrap pt-1">
          {LAMBDA_PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => setLambdaRange(p.range)}
              className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                lambdaRange[0] === p.range[0] && lambdaRange[1] === p.range[1]
                  ? 'bg-white/20 text-white'
                  : 'bg-white/5 text-white/40 hover:bg-white/10'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
