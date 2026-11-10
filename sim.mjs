import './mute-auto.mjs'
// 遊び方ごとの分布。node sim.mjs [回数=12] [style,...]
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
const ROOT = import.meta.dirname
const PORT = 6462
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const N = +(process.argv[2] || 12)
const styles = (process.argv[3] || 'expert,human,reckless,idle').split(',')
const b = await chromium.launch()
const ctx = await b.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 } })
const p = await ctx.newPage(); const errs = []
p.on('pageerror', e => errs.push(e.message))
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__dplReady, null, { timeout: 15000 })
const rows = []
for (const style of styles) {
  const res = []
  for (let i = 0; i < N; i++) {
    const r = await p.evaluate(([style, i, MUL]) => {
      dpl.dbg.pause(true); dpl.seed(1000 + i * 77); dpl.G.forceTut = false
      if (!window.__d0) window.__d0 = dpl.DATA.stages.map(s => s.drain)
      dpl.DATA.stages.forEach((s, k) => s.drain = window.__d0[k] * MUL)
      dpl.startGame(); Object.assign(dpl.bot, { on: true, style, st: 'think', t: 0.6, x: 180, y: 600, hold: false })
      let t = 0, stT = [0, 0, 0, 0, 0], fmin = [1, 1, 1, 1, 1]
      while (dpl.G.mode !== 'end' && t < 600) { dpl.dbg.step(30); t += 0.5; stT[dpl.G.st] += 0.5; fmin[dpl.G.st] = Math.min(fmin[dpl.G.st], dpl.G.focus) }
      const G = dpl.G
      return { st: G.st, clear: !!(G.ended && G.ended.clear), t, torn: G.stats.torn, tsurun: G.stats.tsurun, n: G.stats.n, stack: G.stats.maxStack, stT, fmin }
    }, [style, i, +(process.env.MUL || 1)])
    res.push(r)
  }
  const avg = k => (res.reduce((a, r) => a + r[k], 0) / res.length).toFixed(1)
  const dist = [0, 0, 0, 0, 0, 0]; for (const r of res) dist[r.clear ? 5 : r.st]++
  const fm = [0,1,2,3,4].map(k => (res.reduce((a, r) => a + r.fmin[k], 0) / res.length).toFixed(2)).join('/')
  rows.push(`${style.padEnd(9)} 最低集中=${fm} 到達(値札..月,全部)=${dist.join('/')}  時間=${avg('t')}s 剥がした=${avg('n')} ツルン=${avg('tsurun')} 破れ=${avg('torn')} 最大まとめ=${avg('stack')}`)
  console.log(rows[rows.length - 1])
}
console.log('errs', errs.length, errs.slice(0, 3))
await b.close(); server.kill()
