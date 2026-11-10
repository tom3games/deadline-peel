import '../mute-auto.mjs'
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
const ROOT = new URL('..', import.meta.url).pathname
const PORT = 6465
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch(); const p = await (await b.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 } })).newPage()
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__dplReady)
const r = await p.evaluate(() => {
  dpl.dbg.pause(true); dpl.seed(7); dpl.startGame(); dpl.dbg.step(30)
  const h = dpl.hintXY().filter(h => h.kind === 'disc')[0]; const S = dpl.toScreen(1, 0)[0]
  const x0 = h.x / S, y0 = h.y / S, ux = h.cx - h.x, uy = h.cy - h.y, l = Math.hypot(ux, uy)
  dpl.inputDown(x0, y0); dpl.dbg.step(1); const out = [{ act: !!dpl.G.active, stack: h.stack }]
  for (let i = 1; i < 12; i++) { dpl.inputMove(x0 + ux / l * 26.7 * i, y0 + uy / l * 26.7 * i); dpl.dbg.step(1); const g = dpl.G.active; out.push(g ? { r: +g.ratio.toFixed(2), s: +g.stress.toFixed(2), f: +(g.idx / g.list.length).toFixed(2), n: g.members.length } : { done: dpl.G.stats }) }
  return out
})
console.log(JSON.stringify(r, null, 0))
await b.close(); server.kill()
