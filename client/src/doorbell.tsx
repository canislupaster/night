import { Suspense, render, useEffect, useState } from 'preact/compat'

import { DoorbellButton } from './components/doorbell'
import { useServer, ServerProvider, ErrorScreen, LoadingScreen } from './index'
import { ServerContextData, connect } from './lib/api';

export default function App() {
  let [ctx,setCtx] = useState<ServerContextData>({state: "connecting"});
  useEffect(() => connect(setCtx), [])

  return (
    <main className="grid font-main items-center min-h-screen bg-gray-900 text-white p-3">
      <DoorbellButton data={ctx} />
    </main>
  )
}

render(<App />, document.getElementById('app')!)