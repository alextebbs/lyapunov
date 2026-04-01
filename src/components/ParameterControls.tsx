import { useAppState } from '../state/context'
import { ParameterSlider } from './ParameterSlider'

const MAP_FUNCTIONS = [
  { label: 'Logistic', value: 0 },
  { label: 'Sine', value: 1 },
  { label: 'Cubic', value: 2 },
  { label: 'Gaussian', value: 3 },
]

const LAMBDA_PRESETS: { label: string; range: [number, number] }[] = [
  { label: 'Micro', range: [-0.05, 0.05] },
  { label: 'Tight', range: [-0.2, 0.2] },
  { label: 'Default', range: [-0.5, 0.5] },
  { label: 'Wide', range: [-1.5, 1.5] },
  { label: 'Full', range: [-3, 3] },
]

export function ParameterControls() {
  const {
    lambdaRange, x0, mapFunction, exponent, cValue, sequence,
    setLambdaRange, setX0, setMapFunction, setExponent, setCValue,
  } = useAppState()

  const hasC = sequence.includes(2)

  return (
    <div className="space-y-4">
      <label className="text-xs font-medium text-white/60 uppercase tracking-wider">
        Parameters
      </label>

      {/* Map function selector */}
      <div className="space-y-1.5">
        <label className="text-xs text-white/60">Map Function</label>
        <div className="flex gap-1.5 flex-wrap">
          {MAP_FUNCTIONS.map(mf => (
            <button
              key={mf.value}
              onClick={() => setMapFunction(mf.value)}
              className={`px-3 py-1.5 rounded text-xs transition-colors ${
                mapFunction === mf.value
                  ? 'bg-white/25 text-white'
                  : 'bg-white/5 text-white/40 hover:bg-white/10 active:bg-white/15'
              }`}
            >
              {mf.label}
            </button>
          ))}
        </div>
      </div>

      {mapFunction === 0 && (
        <ParameterSlider
          label="Exponent"
          value={exponent}
          min={0.5}
          max={3.0}
          defaultValue={1.0}
          onChange={setExponent}
          precision={2}
        />
      )}

      <ParameterSlider
        label="Initial x₀"
        value={x0}
        min={0.01}
        max={0.99}
        defaultValue={0.5}
        onChange={setX0}
      />

      {hasC && (
        <ParameterSlider
          label="C Value (r)"
          value={cValue}
          min={0}
          max={4}
          defaultValue={3.0}
          onChange={setCValue}
        />
      )}

      <div className="space-y-2">
        <ParameterSlider
          label="Lambda Min"
          value={lambdaRange[0]}
          min={-3}
          max={0}
          defaultValue={-0.5}
          onChange={v => setLambdaRange([v, lambdaRange[1]])}
        />
        <ParameterSlider
          label="Lambda Max"
          value={lambdaRange[1]}
          min={0}
          max={3}
          defaultValue={0.5}
          onChange={v => setLambdaRange([lambdaRange[0], v])}
        />
        <div className="flex gap-1.5 flex-wrap pt-1">
          {LAMBDA_PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => setLambdaRange(p.range)}
              className={`px-2.5 py-1 rounded text-xs transition-colors ${
                lambdaRange[0] === p.range[0] && lambdaRange[1] === p.range[1]
                  ? 'bg-white/25 text-white'
                  : 'bg-white/5 text-white/40 hover:bg-white/10 active:bg-white/15'
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
