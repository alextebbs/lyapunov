import { useState, useCallback } from 'react'

export function ShareButton() {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [])

  return (
    <button
      onClick={handleCopy}
      className="w-full px-3 py-1.5 rounded text-xs font-medium bg-white/10 text-white/80 hover:bg-white/20 transition-colors"
    >
      {copied ? 'Copied!' : 'Copy Link'}
    </button>
  )
}
