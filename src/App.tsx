import { AppProvider } from './state/context'
import { Canvas } from './components/Canvas'
import { Toolbar } from './components/Toolbar'

export function App() {
  return (
    <AppProvider>
      <div className="relative w-full h-full">
        <Canvas />
        <Toolbar />
      </div>
    </AppProvider>
  )
}

export default App
