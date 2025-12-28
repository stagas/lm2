import { createRoot } from 'preact/compat/client'
import { App } from './components/App.tsx'

const root = createRoot(document.getElementById('root')!)
root.render(
  <App />,
)
