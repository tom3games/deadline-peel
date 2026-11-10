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
  const G = dpl.G
  // 半額を先に剥がす
  for (const kind of ['half', 'disc']) {
    const h = dpl.hintXY().filter(h => h.kind === kind).sort((a, b) => b.z - a.z)[0]; const S = dpl.toScreen(1, 0)[0]
    const x0 = h.x / S, y0 = h.y / S, ux = h.cx - h.x, uy = h.cy - h.y, l = Math.hypot(ux, uy), sp = kind === 'half' ? 5 : 26.7
    dpl.inputDown(x0, y0); dpl.dbg.step(1)
    for (let i = 1; i < 60 && G.active; i++) { dpl.inputMove(x0 + ux / l * sp * i, y0 + uy / l * sp * i); dpl.dbg.step(1) }
    dpl.inputUp(); dpl.dbg.step(1)
  }
  const s = G.stickers.find(s => s.kind === 'disc'), cu = s.cuts[0], pts = s.pts.filter(q => q.alive)
  let best = pts[0], bd = 1e9; for (const q of pts) { const d = q.x * cu.nx + q.y * cu.ny; if (d < bd) { bd = d; best = q } }
  const pk = dpl.pickAt(best.x, best.y)
  dpl.inputDown(best.x, best.y); const g = G.active
  const info = { alive: pts.length, total: s.pts.length, pick: pk && Object.keys(pk), act: !!g, u: g && g.u, cut: [cu.nx, cu.ny], extent: g && (g.c1 - g.c0) }
  let x = best.x, y = best.y
  for (let i = 0; i < 80 && G.active; i++) { x += cu.nx * 4; y += cu.ny * 4; dpl.inputMove(x, y); dpl.dbg.step(1) }
  info.done = s.done; info.torn = G.stats.torn
  return info
})
console.log(JSON.stringify(r))
await b.close(); server.kill()
