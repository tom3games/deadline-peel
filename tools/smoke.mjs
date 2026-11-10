import '../mute-auto.mjs'
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
const ROOT = new URL('..', import.meta.url).pathname
mkdirSync(ROOT + 'shots', { recursive: true })
const PORT = 6461
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch()
const ctx = await b.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const p = await ctx.newPage(); const errs = []
p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()) })
await p.goto(`http://localhost:${PORT}/?seed=1`); await p.waitForFunction(() => window.__dplReady, null, { timeout: 15000 })
await p.screenshot({ path: ROOT + 'shots/s-title.png' })
await p.evaluate(() => { dpl.seed(3); dpl.dbg.pause(true); dpl.startGame(); dpl.dbg.step(60) })
await p.screenshot({ path: ROOT + 'shots/s-play0.png' })
const style = process.argv[2] || 'human'
await p.evaluate(s => { dpl.bot.on = true; dpl.bot.style = s }, style)
const shots = [3, 8, 14, 20, 28, 36, 45]
let t = 1
for (let i = 0; i < 400; i++) {
  await p.evaluate(() => dpl.dbg.step(30)); t += 0.5
  const st = await p.evaluate(() => dpl.state())
  if (shots.includes(t)) await p.screenshot({ path: ROOT + `shots/s-t${t}.png` })
  if (i % 6 === 0) console.log(t.toFixed(1), JSON.stringify(st))
  if (st.mode === 'end') break
}
await p.screenshot({ path: ROOT + 'shots/s-end.png' })
console.log('errs', errs)
await b.close(); server.kill()
