export {}

const audioContext = new AudioContext()
await audioContext.audioWorklet.addModule(new URL('worklet.ts', import.meta.url).toString())
const dsp = new AudioWorkletNode(audioContext, 'dsp', {
  outputChannelCount: [2],
  processorOptions: {
    sourcemapUrl: new URL('/as/build/index.wasm.map', location.origin).toString(),
  },
})
dsp.connect(audioContext.destination)

const startButton = document.createElement('button')
startButton.textContent = 'Start'
startButton.addEventListener('mousedown', () => {
  dsp.port.postMessage({ type: 'start' })
})
document.body.appendChild(startButton)

const stopButton = document.createElement('button')
stopButton.textContent = 'Stop'
stopButton.addEventListener('mousedown', () => {
  dsp.port.postMessage({ type: 'stop' })
})
document.body.appendChild(stopButton)
