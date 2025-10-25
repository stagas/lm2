import { wasmSourceMap } from './wasm-sourcemap.ts'

interface SetupOptions {
  hex: string
  sourcemapUrl: string
  config: {
    options: {
      importMemory: boolean
      initialMemory: number
      maximumMemory: number
      sharedMemory: boolean
    }
  }
}

export type WasmSetup<T> = Awaited<ReturnType<typeof wasmSetup<T>>>
export async function wasmSetup<T>({ hex, sourcemapUrl, config }: SetupOptions) {
  const fromHexString = (hexString: string) =>
    Uint8Array.from(hexString.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)))
  const uint8 = fromHexString(hex)
  const buffer = wasmSourceMap.setSourceMapURL(uint8.buffer, sourcemapUrl)
  const binary = new Uint8Array(buffer)

  const memory = new WebAssembly.Memory({
    initial: config.options.initialMemory,
    maximum: config.options.maximumMemory,
    shared: config.options.sharedMemory,
  })
  const mod = await WebAssembly.compile(binary)
  const instance = await WebAssembly.instantiate(mod, {
    env: {
      memory,
      abort(message$: number, fileName$: number, lineNumber$: number, columnNumber$: number) {
        const message = __liftString(message$ >>> 0)
        const fileName = __liftString(fileName$ >>> 0)
        const lineNumber = lineNumber$ >>> 0
        const columnNumber = columnNumber$ >>> 0
        throw new Error(`${message} in ${fileName}:${lineNumber}:${columnNumber}`)
      },
      seed: () => Date.now() * Math.random(),
      log: console.log,
      'console.log': (textPtr: number) => {
        console.log(__liftString(textPtr))
      },
    },
  })
  function __liftString(pointer: number) {
    if (!pointer) return null
    const end = (pointer + new Uint32Array(memory.buffer)[(pointer - 4) >>> 2]) >>> 1,
      memoryU16 = new Uint16Array(memory.buffer)
    let start = pointer >>> 1,
      string = ''
    while (end - start > 1024)
      string += String.fromCharCode(...memoryU16.subarray(start, (start += 1024)))
    return string + String.fromCharCode(...memoryU16.subarray(start, end))
  }

  const wasm: T = instance.exports as any

  return {
    wasm,
    memory,
  }
}
