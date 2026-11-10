import './mute-auto.mjs'
// og.png（1200x630）を作る。遊んでいる場面（月の保護フィルムを剥がしている途中）＋題名＋見逃した通知
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
const ROOT = import.meta.dirname
const PORT = 6466
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch()
const p = await (await b.newContext({ locale: 'ja-JP', viewport: { width: 400, height: 640 }, deviceScaleFactor: 2 })).newPage()
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__dplReady)
await p.evaluate(() => {
  dpl.dbg.pause(true); dpl.seed(31); dpl.startGame(); dpl.DATA.stages.forEach(s => s.drain = 0.01)
  Object.assign(dpl.bot, { on: true, style: 'expert', st: 'think', t: 0.4, x: 180, y: 500 })
  let t = 0
  while (dpl.G.st < 4 && t < 200) { dpl.dbg.step(6); t += 0.1 }
  // 月のフィルムを、上のシールごと半分まで
  while (t < 260) { dpl.dbg.step(1); t += 1 / 60; const g = dpl.G.active; if (g && g.members.length >= 3 && g.idx / g.list.length > 0.5) break }
  dpl.bot.on = false
  dpl.G.says = []; for (const k of ['pop', 'cap', 'toast']) document.querySelector('#' + k).hidden = true
  document.querySelector('#hud').style.visibility = 'hidden'
  dpl.G.shake = 0; dpl.dbg.step(1)
})
const shot = await p.screenshot({ type: 'png' })
const html = `<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Yusei+Magic&family=Zen+Kaku+Gothic+New:wght@700;900&display=swap" rel="stylesheet"><style>
*{margin:0;box-sizing:border-box}body{width:1200px;height:630px;background:#120e16;position:relative;overflow:hidden;font-family:"Zen Kaku Gothic New",sans-serif}
#g{position:absolute;left:0;top:-110px;width:500px;height:800px;background:url(data:image/png;base64,${shot.toString('base64')}) center/cover}
#fade{position:absolute;left:380px;top:0;width:160px;height:630px;background:linear-gradient(90deg,rgba(18,14,22,0),#120e16)}
#r{position:absolute;left:520px;top:44px;width:640px}
.tape{display:inline-block;background:#efe3c2;color:#2b2620;font:400 34px/1.2 "Yusei Magic";padding:8px 20px 6px;transform:rotate(-2deg);box-shadow:0 3px 6px rgba(0,0,0,.4)}
.lbl{display:inline-block;background:#f6f1e6;color:#211c18;font:900 62px/1.1 "Zen Kaku Gothic New";padding:10px 22px 12px;border-radius:10px;margin-top:10px;box-shadow:0 12px 24px rgba(0,0,0,.5);transform:rotate(1.2deg)}
.lbl.y{background:#ffd84a;color:#e2412b;transform:rotate(-1deg);margin-left:60px}
#n{margin-top:26px;display:flex;flex-direction:column;gap:9px}
.nt{width:560px;background:rgba(240,236,232,.9);border-radius:18px;padding:10px 16px;display:grid;grid-template-columns:38px 1fr auto;gap:12px;align-items:center;font-family:-apple-system,"Hiragino Sans",sans-serif;color:#16151a}
.ic{width:38px;height:38px;border-radius:10px;color:#fff;display:flex;align-items:center;justify-content:center;font:700 17px "Zen Kaku Gothic New"}
.nt b{display:block;font-size:16px}.nt span{font-size:18px}.tm{font-size:14px;color:#6b6770;align-self:start}
</style></head><body><div id="g"></div><div id="fade"></div><div id="r">
<span class="tape">明日締切なのに</span><br><span class="lbl">シール剥がしが</span><br><span class="lbl y">止まらない</span>
<div id="n">
<div class="nt"><span class="ic" style="background:#3d8bfd">上</span><span><b>上司</b><span>例の企画書、まだ待ってます</span></span><span class="tm">7年後</span></div>
<div class="nt"><span class="ic" style="background:#d1453b">企</span><span><b>企画書</b><span>提出期限を過ぎました</span></span><span class="tm">9:00</span></div>
</div></div></body></html>`
const q = await (await b.newContext({ viewport: { width: 1200, height: 630 } })).newPage()
await q.setContent(html); await q.waitForTimeout(1500); await q.evaluate(() => document.fonts.ready)
await q.screenshot({ path: ROOT + '/og.png' })
await b.close(); server.kill()
console.log('og.png')
