import '../mute-auto.mjs'
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
const ROOT = new URL('..', import.meta.url).pathname
const PORT = 6463
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch(); const p = await (await b.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 } })).newPage()
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__dplReady)
const out = await p.evaluate(([style, sd]) => {
  dpl.dbg.pause(true); dpl.seed(sd); dpl.startGame(); Object.assign(dpl.bot, { on: true, style, st: 'think', t: 0.6, x: 180, y: 600 })
  const lines = []; let t = 0
  while (dpl.G.mode !== 'end' && t < 120) { dpl.dbg.step(15); t += 0.25; const s = dpl.state(); if (s.st >= +(window.MINST || 0)) lines.push(`${t.toFixed(2)} st${s.st} ${s.mode} f=${s.focus} left=${s.left} act=${s.active} r=${s.ratio} j=${s.jolt ? s.jolt.type + ':' + s.jolt.phase : '-'} bot=${dpl.bot.st}${dpl.bot.hold ? ':hold' : ''}`) }
  return lines
}, [process.argv[2] || 'human', +(process.argv[3] || 1000)])
console.log(out.filter(l => / st2 /.test(l)).join('\n'))
await b.close(); server.kill()
