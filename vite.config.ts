import react from '@vitejs/plugin-react-swc'
import fs from 'node:fs'
import path from 'node:path'
import { type ConfigEnv, defineConfig, loadEnv, type Plugin, type UserConfig } from 'vite'
import { assemblyScript } from 'vite-plugin-assemblyscript'
import { coopCoep } from 'vite-plugin-coop-coep'
import { openInEditor } from 'vite-plugin-open-in-editor'

function copyWasmSourcemap(): Plugin {
  return {
    name: 'copy-wasm-sourcemap',
    writeBundle() {
      const mapSource = path.resolve('as/build/index.wasm.map')
      const mapDest = path.resolve('dist/as/build/index.wasm.map')

      if (fs.existsSync(mapSource)) {
        fs.mkdirSync(path.dirname(mapDest), { recursive: true })
        fs.copyFileSync(mapSource, mapDest)
      }
    },
  }
}

export default ({ mode }: ConfigEnv): UserConfig => {
  const dirname = process.cwd()
  const env = loadEnv(mode, dirname)
  Object.assign(process.env, env)

  return defineConfig({
    plugins: [
      react(),
      openInEditor({ cmd: 'cursor' }),
      coopCoep(),
      assemblyScript({
        configFile: 'asconfig.json',
        projectRoot: '.',
        srcMatch: 'as/assembly',
        srcEntryFile: 'as/assembly/index.ts',
        mapFile: './as/build/index.wasm.map',
      }),
      {
        name: 'exclude-as-build-from-hmr',
        handleHotUpdate({ file, server }) {
          if (
            (file.includes('as/build/index.d.ts') && !file.includes('as/assembly'))
          ) {
            return []
          }
        },
      },
      ...(mode === 'production'
        ? [
          copyWasmSourcemap(),
        ]
        : []),
    ],
    root: '.',
    clearScreen: false,
    server: {
      host: '0.0.0.0',
      hmr: {
        host: 'localhost',
      },
      https: {
        key: fs.readFileSync(
          path.resolve(__dirname, '/home/stagas/.ssl-certs/localhost-key.pem'),
        ),
        cert: fs.readFileSync(path.resolve(__dirname, '/home/stagas/.ssl-certs/localhost.pem')),
      },
    },
  })
}
