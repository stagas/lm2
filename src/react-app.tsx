import React from 'react'
import { createRoot } from 'react-dom/client'

function App(): React.JSX.Element {
  return (
    <div className="min-h-screen flex items-center justify-center text-white bg-black">
      <h1 className="text-3xl">Hello React</h1>
    </div>
  )
}

const root = createRoot(document.getElementById('root')!)
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
