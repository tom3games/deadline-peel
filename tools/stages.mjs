import '../mute-auto.mjs'
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
const ROOT = new URL('..', import.meta.url).pathname
const PORT = 6464
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch()
const [w, h] = (process.argv[2] || '390x844').split('x').map(Number)
const p = await (await b.newContext({ locale: process.argv[3] || 'ja-JP', viewport: { width: w, height: h }, deviceScaleFactor: 2 })).newPage()
const errs = []; p.on('pageerror', e => errs.push(e.message))
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__dplReady)
await p.screenshot({ path: ROOT + `shots/g-title-${w}.png` })
await p.evaluate(() => { dpl.dbg.pause(true); dpl.seed(5); dpl.startGame(); Object.assign(dpl.bot, { on: true, style: 'expert', st: 'think', t: 0.6, x: 180, y: 600 }); dpl.DATA.stages.forEach(s => s.drain = 0.02) })
const got = {}
for (let i = 0; i < 2400; i++) {
  await p.evaluate(() => dpl.dbg.step(3))
  const s = await p.evaluate(() => ({ st: dpl.G.st, mode: dpl.G.mode, act: !!dpl.G.active, f: dpl.G.active ? (dpl.G.active.idx / dpl.G.active.list.length) : 0 }))
  if (s.mode === 'play' && s.act && s.f > 0.4 && !got[s.st]) { got[s.st] = 1; await p.screenshot({ path: ROOT + `shots/g-st${s.st}-${w}.png` }) }
  if (s.mode === 'end') break
}
await p.screenshot({ path: ROOT + `shots/g-end-${w}.png` })
console.log('errs', errs)
await b.close(); server.kill()
