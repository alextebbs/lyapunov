import { Shader } from './shader'

import shader from './shader.glsl'

export const App = () => {
    return <div style={{height: '100vh', width: '100vw'}}>
        <Shader fs={shader} />
    </div>
}

export default App
