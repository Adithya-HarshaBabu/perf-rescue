import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { defineConfig, type Plugin } from 'vite'
import type { OutputChunk } from 'rolldown'

// Writes bundle-stats.json: gzipped JS each page needs before its first render (its entry chunk
// plus everything it imports statically) and in total (including lazy chunks).
function bundleStats(): Plugin {
  return {
    name: 'perf-rescue-bundle-stats',
    apply: 'build',
    generateBundle(_, bundle) {
      const chunks = new Map<string, OutputChunk>()
      for (const out of Object.values(bundle)) if (out.type === 'chunk') chunks.set(out.fileName, out)
      const gz = (c: OutputChunk) => gzipSync(c.code).length
      const walk = (name: string, lazy: boolean, seen: Set<string>) => {
        if (seen.has(name)) return
        seen.add(name)
        const c = chunks.get(name)!
        c.imports.forEach((i) => walk(i, lazy, seen))
        if (lazy) c.dynamicImports.forEach((i) => walk(i, lazy, seen))
      }
      const stats: Record<string, { initialKb: number; totalKb: number }> = {}
      for (const c of chunks.values()) {
        if (!c.isEntry || !c.name) continue
        const sum = (lazy: boolean) => {
          const seen = new Set<string>()
          walk(c.fileName, lazy, seen)
          return Math.round([...seen].reduce((n, f) => n + gz(chunks.get(f)!), 0) / 1024)
        }
        stats[c.name] = { initialKb: sum(false), totalKb: sum(true) }
      }
      this.emitFile({ type: 'asset', fileName: 'bundle-stats.json', source: JSON.stringify(stats) })
    },
  }
}

// Three pages: the race (/) plus the before (/slow/) and after (/fast/) dashboards, each with its
// own entry so their bundles stay separate and comparable.
export default defineConfig({
  plugins: [react(), bundleStats()],
  server: { host: '127.0.0.1', port: 5191, strictPort: true },
  preview: { host: '127.0.0.1', port: 4191, strictPort: true },
  build: {
    rollupOptions: {
      input: {
        race: resolve(import.meta.dirname, 'index.html'),
        slow: resolve(import.meta.dirname, 'slow/index.html'),
        fast: resolve(import.meta.dirname, 'fast/index.html'),
      },
    },
  },
})
