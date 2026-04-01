import { useState, useCallback } from 'react'
import { useAppState } from '../state/context'
import { sequenceToDisplayString, displayStringToSequence } from '../lib/url'

const PRESETS = [
  { label: 'AB', value: 'AB' },
  { label: 'AABAB', value: 'AABAB' },
  { label: 'ABBAAB', value: 'ABBAAB' },
  { label: 'BBAABA', value: 'BBAABA' },
  { label: 'BBBBBBAAAAAA', value: 'BBBBBBAAAAAA' },
  { label: 'AAABBBAAABBB', value: 'AAABBBAAABBB' },
  { label: 'AABBAABB', value: 'AABBAABB' },
  { label: 'ABCABC', value: 'ABCABC' },
  { label: 'AABCBC', value: 'AABCBC' },
]

const CHAR_COLORS: Record<string, string> = {
  A: 'bg-blue-500/80',
  B: 'bg-amber-500/80',
  C: 'bg-emerald-500/80',
}

function nextChar(c: string): string {
  if (c === 'A') return 'B'
  if (c === 'B') return 'C'
  return 'A'
}

export function SequenceEditor() {
  const { sequence, setSequence } = useAppState()
  const [inputValue, setInputValue] = useState(sequenceToDisplayString(sequence))

  const handleChange = useCallback(
    (value: string) => {
      const cleaned = value.toUpperCase().replace(/[^ABC]/g, '')
      setInputValue(cleaned)
      if (cleaned.length > 0) {
        setSequence(displayStringToSequence(cleaned))
      }
    },
    [setSequence],
  )

  const handlePreset = useCallback(
    (preset: string) => {
      setInputValue(preset)
      setSequence(displayStringToSequence(preset))
    },
    [setSequence],
  )

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-white/60 uppercase tracking-wider">
        Sequence
      </label>

      <input
        type="text"
        value={inputValue}
        onChange={e => handleChange(e.target.value)}
        className="w-full bg-white/10 border border-white/20 rounded px-2 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-white/40"
        placeholder="e.g. AABAB or ABCABC"
      />

      {/* Visual sequence blocks */}
      <div className="flex gap-0.5 flex-wrap">
        {inputValue.split('').map((char, i) => (
          <button
            key={i}
            onClick={() => {
              const arr = inputValue.split('')
              arr[i] = nextChar(arr[i]!)
              handleChange(arr.join(''))
            }}
            className={`w-6 h-6 rounded text-xs font-bold flex items-center justify-center transition-colors ${
              CHAR_COLORS[char] ?? 'bg-white/20'
            } text-white`}
          >
            {char}
          </button>
        ))}
        <button
          onClick={() => handleChange(inputValue + 'A')}
          className="w-6 h-6 rounded text-xs text-white/40 border border-white/20 flex items-center justify-center hover:bg-white/10"
        >
          +
        </button>
      </div>

      {/* Presets */}
      <div className="flex gap-1 flex-wrap">
        {PRESETS.map(p => (
          <button
            key={p.value}
            onClick={() => handlePreset(p.value)}
            className={`px-2 py-0.5 rounded text-xs transition-colors ${
              inputValue === p.value
                ? 'bg-white/20 text-white'
                : 'bg-white/5 text-white/50 hover:bg-white/10'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}
