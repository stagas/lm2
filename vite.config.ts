import fs from 'node:fs'
import path from 'node:path'
import { type ConfigEnv, defineConfig, loadEnv, type UserConfig } from 'vite'
import { assemblyScript } from 'vite-plugin-assemblyscript'
import { coopCoep } from 'vite-plugin-coop-coep'
import { hexLoader } from 'vite-plugin-hex-loader'
import { openInEditor } from 'vite-plugin-open-in-editor'

export default ({ mode }: ConfigEnv): UserConfig => {
  const dirname = process.cwd()
  const env = loadEnv(mode, dirname)
  Object.assign(process.env, env)

  return defineConfig({
    plugins: [
      openInEditor({ cmd: 'cursor' }),
      coopCoep(),
      hexLoader(),
      assemblyScript({
        configFile: 'asconfig.json',
        projectRoot: '.',
        srcMatch: 'as/assembly',
        srcEntryFile: 'as/assembly/index.ts',
        mapFile: './as/build/index.wasm.map',
      }),
    ],
    root: '.',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    clearScreen: false,
    server: {
      host: '0.0.0.0',
      hmr: {
        host: 'localhost',
      },
      https: {
        key: fs.readFileSync(
          path.resolve(__dirname, '/home/stagas/.ssl-certs/devito.test-key.pem'),
        ),
        cert: fs.readFileSync(path.resolve(__dirname, '/home/stagas/.ssl-certs/devito.test.pem')),
      },
    },
  })
}
