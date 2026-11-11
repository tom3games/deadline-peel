import './mute-auto.mjs'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
// node verify.mjs
import { chromium, webkit } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
const ROOT = import.meta.dirname
mkdirSync(ROOT + '/shots', { recursive: true })
const PORT = 6461
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const URL0 = `http://localhost:${PORT}/`
let pass = 0, fail = 0
const results = []
async function t(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('false'); pass++; results.push(`ok   ${name}${r && r !== true ? '  ' + JSON.stringify(r) : ''}`) }
  catch (e) { fail++; results.push(`FAIL ${name}  ${e.message.split('\n')[0]}`) }
}
const expect = (c, msg) => { if (!c) throw new Error(msg) }
async function open(browser, opts = {}, url = URL0) {
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, ...opts })
  await muteContext(ctx)
  await ctx.addInitScript(() => { try { localStorage.clear() } catch (e) {} })
  const p = await ctx.newPage(); p.errs = []
  p.on('pageerror', e => p.errs.push('pageerror ' + e.message))
  p.on('console', m => { if (m.type() === 'error') p.errs.push('console ' + m.text()) })
  p.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)/.test(r.url())) p.errs.push('reqfail ' + r.url()) })
  await p.goto(url); await p.waitForFunction(() => window.__dplReady, null, { timeout: 15000 })
  return p
}
const overflow = p => p.evaluate(() => {
  const W = document.documentElement.clientWidth, bad = []
  for (const el of document.querySelectorAll('main:not([hidden]) *, .say:not([hidden])')) {
    if (el.closest('[hidden]') || (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true }))) continue
    if (el.closest('#notes')) continue
    const r = el.getBoundingClientRect(); if (r.width && (r.right > W + 1 || r.left < -1)) bad.push((el.id || el.className || el.tagName) + ':' + Math.round(r.left) + '-' + Math.round(r.right))
  }
  return { sw: document.documentElement.scrollWidth, W, bad: bad.slice(0, 5) }
})
const fit = q => q.evaluate(() => {
  const H = innerHeight, de = document.documentElement, over = []
  if (de.scrollHeight > H + 1) over.push('page:' + de.scrollHeight)
  for (const el of document.querySelectorAll('main:not([hidden]) button, main:not([hidden]) a, #corner button')) { if (!el.offsetParent) continue; const r = el.getBoundingClientRect(); if (r.bottom > H + 1 || r.top < -1) over.push((el.id || el.className) + ':' + Math.round(r.top) + '-' + Math.round(r.bottom)) }
  const nb = document.querySelector('#notes'); if (nb && nb.offsetParent && nb.scrollHeight > nb.clientHeight + 1) over.push('notes:' + nb.scrollHeight + '>' + nb.clientHeight)
  return { H, over: over.slice(0, 6) }
})
const lumVar = p => p.evaluate(() => {
  const c = document.querySelector('#cv'), x = c.getContext('2d'), d = x.getImageData(0, 0, c.width, c.height).data
  let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4 * 97) { const v = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; s += v; s2 += v * v; n++ }
  return Math.round(s2 / n - (s / n) ** 2)
})
// 本物のポインタで、つまんで引く（時間は止めて1コマずつ進める）。speed = 指の速さ（世界の単位/秒）
async function drag(p, x, y, dx, dy, dist, speed, release = true) {
  const S = await p.evaluate(() => dpl.toScreen(1, 0)[0])
  await p.mouse.move(x, y); await p.mouse.down()
  await p.evaluate(() => dpl.dbg.step(1))
  if (dx == null) { const u = await p.evaluate(() => dpl.G.active ? dpl.G.active.u : [0, 1]); dx = u[0]; dy = u[1] }
  const per = speed / 60, n = Math.ceil(dist / per)
  for (let i = 1; i <= n; i++) {
    await p.mouse.move(x + dx * per * i * S, y + dy * per * i * S)
    await p.evaluate(() => dpl.dbg.step(1))
    const st = await p.evaluate(() => ({ act: dpl.G.active ? 1 : 0, mode: dpl.G.mode }))
    if (!st.act && i > 2) break
  }
  if (release) await p.mouse.up()
  await p.evaluate(() => dpl.dbg.step(2))
}
const startPaused = (p, sd = 7) => p.evaluate(sd => { dpl.dbg.pause(true); dpl.seed(sd); dpl.startGame(); dpl.dbg.step(30) }, sd)
const hintOf = (p, kind) => p.evaluate(k => dpl.hintXY().filter(h => !k || h.kind === k).sort((a, b) => b.z - a.z)[0], kind)
const sticker = (p, id) => p.evaluate(id => { const s = dpl.G.stickers.find(s => s.id === id); return { done: s.done, pg: !!s.pg, cuts: s.cuts.length } }, id)

const browser = await chromium.launch(MUTE_LAUNCH)
let p = await open(browser)
await t('起動時にエラーが出ない', async () => { expect(p.errs.length === 0, p.errs.join('|')) })
await t('ブラウザの拡大が起きない（viewport・ピンチ・Ctrl+ホイール・Ctrl+プラス）', async () => {
  const r = await p.evaluate(() => {
    const vp = document.querySelector('meta[name=viewport]').content
    const g = new Event('gesturestart', { cancelable: true }); document.dispatchEvent(g)
    const w = new WheelEvent('wheel', { ctrlKey: true, deltaY: -10, bubbles: true, cancelable: true }); window.dispatchEvent(w)
    const k = new KeyboardEvent('keydown', { key: '+', ctrlKey: true, bubbles: true, cancelable: true }); window.dispatchEvent(k)
    return { vp, gesture: g.defaultPrevented, wheel: w.defaultPrevented, key: k.defaultPrevented, ta: getComputedStyle(document.documentElement).touchAction, us: getComputedStyle(document.body).userSelect, cv: getComputedStyle(document.querySelector('#cv')).touchAction }
  })
  expect(/user-scalable=no/.test(r.vp) && r.gesture && r.wheel && r.key && r.ta === 'manipulation' && r.us === 'none' && r.cv === 'none', JSON.stringify(r)); return r
})
await t('OGP 一式がある（tom3games.com の絶対URL）', async () => {
  const r = await p.evaluate(() => ({ has: ['og:title', 'og:description', 'og:image', 'og:url', 'og:type'].map(k => !!document.querySelector(`meta[property="${k}"]`)), tw: !!document.querySelector('meta[name="twitter:card"]'), img: document.querySelector('meta[property="og:image"]').content, canon: document.querySelector('link[rel=canonical]').href }))
  expect(r.has.every(Boolean) && r.tw && r.img === 'https://tom3games.com/play/deadline-peel/og.png' && /tom3games\.com\/play\/deadline-peel\/$/.test(r.canon), JSON.stringify(r))
})
await t('タイトル: 背景が描けている（輝度のばらつき）', async () => { const v = await lumVar(p); expect(v > 200, v); return v })
await t('タイトルの「はじめる」を押すと遊びが始まる（本物のクリック）', async () => {
  await p.click('#bStart'); await p.waitForFunction(() => dpl.G.mode === 'play', null, { timeout: 3000 })
  const r = await p.evaluate(() => ({ vis: !document.querySelector('#vPlay').hidden, hud: !!document.querySelector('#clock svg') }))
  expect(r.vis, JSON.stringify(r)); return r
})
await t('音: 始めたあと実際には無音（__muteOk）', async () => { const r = await p.evaluate(() => window.__muteOk()); expect(r, r) })

// ---- 剥がす手ざわり（本物のポインタ）
await startPaused(p)
await t('角をつまんでほどよい速さで引くと剥がれてツルン（本物のマウス）', async () => {
  const h = await hintOf(p, 'half'), S = await p.evaluate(() => dpl.toScreen(1, 0)[0])
  const ux = (h.cx - h.x), uy = (h.cy - h.y), l = Math.hypot(ux, uy)
  const before = await p.evaluate(() => dpl.G.stats.n)
  await drag(p, h.x, h.y, ux / l, uy / l, 200, 300)
  const r = await p.evaluate(() => ({ n: dpl.G.stats.n, ts: dpl.G.stats.tsurun, torn: dpl.G.stats.torn, played: { ...Snd.played } }))
  expect(r.n === before + 1 && r.ts === 1 && r.torn === 0, JSON.stringify(r)); return { n: r.n, ts: r.ts }
})
await t('剥がした音は録音（pull が鳴る・合成音なし）', async () => { const r = await p.evaluate(() => ({ pull: Snd.played.pull || 0, osc: typeof window.__oscCount === 'number' ? window.__oscCount : 0 })); expect(r.pull >= 1, JSON.stringify(r)); return r })
await t('シールの真ん中を押してもつまめない（端だけ）', async () => {
  const h = await hintOf(p, 'label'); await p.mouse.move(h.cx - 20, h.cy + 4); await p.mouse.down(); await p.evaluate(() => dpl.dbg.step(2))
  const a = await p.evaluate(() => !!dpl.G.active); await p.mouse.up(); await p.evaluate(() => dpl.dbg.step(2))
  expect(!a, a)
})
await t('速すぎると破れる（ビリッ・破れ数が増える）', async () => {
  const h = await hintOf(p, 'disc'), ux = (h.cx - h.x), uy = (h.cy - h.y), l = Math.hypot(ux, uy)
  await drag(p, h.x, h.y, ux / l, uy / l, 260, 1600)
  const r = await p.evaluate(() => ({ torn: dpl.G.stats.torn, left: dpl.state().left }))
  expect(r.torn >= 1, JSON.stringify(r)); return r
})
await t('破れた残りは破れた端からつまみ直せる', async () => {
  const r = await p.evaluate(() => {
    const s = dpl.G.stickers.find(s => !s.done && s.cuts.length); if (!s) return { none: 1 }
    const cu = s.cuts[s.cuts.length - 1], pts = s.pts.filter(q => q.alive); let best = pts[0], bd = 1e9
    for (const q of pts) { const d = q.x * cu.nx + q.y * cu.ny; if (d < bd) { bd = d; best = q } }
    const [sx, sy] = dpl.toScreen(best.x, best.y); return { x: sx, y: sy, ux: cu.nx, uy: cu.ny, kind: s.kind }
  })
  expect(!r.none, 'no torn sticker')
  await drag(p, r.x, r.y, null, null, 300, 240)
  const st = await p.evaluate(() => dpl.G.stickers.filter(s => s.kind === 'disc')[0].done)
  expect(st, JSON.stringify(r))
})
await p.close()

// ---- 重なりをまとめて剥がす
p = await open(browser)
await startPaused(p, 11)
await t('重なりは下の一枚からまとめて剥がせる（3枚まとめて）', async () => {
  const h = await hintOf(p, 'label'); expect(h.stack >= 3, 'stack ' + h.stack)
  const ux = (h.cx - h.x), uy = (h.cy - h.y), l = Math.hypot(ux, uy)
  await drag(p, h.x, h.y, ux / l, uy / l, 560, 180)
  const r = await p.evaluate(() => ({ max: dpl.G.stats.maxStack, n: dpl.G.stats.n }))
  expect(r.max >= 3, JSON.stringify(r)); return r
})
await p.close()

// ---- 途中で離して、めくれた先からつまみ直す
p = await open(browser)
await startPaused(p, 12)
await t('途中で離してもめくれたまま。めくれた先をつまむと続きから（ツルンは付かない）', async () => {
  const h = await hintOf(p, 'half'), ux = (h.cx - h.x), uy = (h.cy - h.y), l = Math.hypot(ux, uy)
  await drag(p, h.x, h.y, ux / l, uy / l, 40, 200)
  const mid = await sticker(p, h.id)
  expect(mid.pg && !mid.done, JSON.stringify(mid))
  const tip = await p.evaluate(id => { const s = dpl.G.stickers.find(s => s.id === id), g = s.pg; const it = g.list[0], d = 2 * (g.f - it.p); return dpl.toScreen(it.pt.x + g.u[0] * d, it.pt.y + g.u[1] * d).concat(g.u) }, h.id)
  await drag(p, tip[0], tip[1], tip[2], tip[3], 200, 220)
  const r = { ...(await sticker(p, h.id)), ts: await p.evaluate(() => dpl.G.stats.tsurun) }
  expect(r.done && r.ts === 0, JSON.stringify(r)); return r
})
await t('揺れの最中は、ふだん平気な速さでも破れる', async () => {
  const r = await p.evaluate(() => {
    const G = dpl.G, s = G.stickers.filter(s => !s.done && !s.pg && s.fresh).sort((a, b) => b.z - a.z)[0]
    const hg = dpl.hintGeo(s), P = dpl.toWorld(s, hg.p[0], hg.p[1])
    G.jolt = { type: 'door', phase: 'hit', t: 5 }
    dpl.inputDown(P[0], P[1]); const g = G.active; if (!g) return { noGrab: 1 }
    let x = P[0], y = P[1], torn0 = G.stats.torn
    for (let i = 0; i < 90 && G.active; i++) { x += g.u[0] * 300 / 60; y += g.u[1] * 300 / 60; dpl.inputMove(x, y); dpl.dbg.step(1) }
    dpl.inputUp(); G.jolt = null
    return { tornAdd: G.stats.torn - torn0, vs: s.vs }
  })
  expect(r.tornAdd >= 1, JSON.stringify(r)); return r
})
await p.close()

// ---- 何もしないと最初の場面で我に返る（最低の称号）
p = await open(browser)
await t('何もしない通し: 最初の場面で我に返り、最低の称号', async () => {
  const r = await p.evaluate(() => { dpl.dbg.pause(true); dpl.seed(3); dpl.startGame(); let t = 0; while (dpl.G.mode !== 'end' && t < 120) { dpl.dbg.step(30); t += 0.5 } return { mode: dpl.G.mode, rank: dpl.G.R && dpl.G.R.rank, t, n: dpl.G.stats.n } })
  expect(r.mode === 'end' && r.rank === 0 && r.t < 40 && r.n === 0, JSON.stringify(r)); return r
})
await t('結果: ロック画面に称号・時刻・通知が出て、画面に収まる', async () => {
  const r = await p.evaluate(() => ({ rank: document.querySelector('#rankSt').textContent, time: document.querySelector('#lkTime').textContent, notes: document.querySelectorAll('#notes .nt').length }))
  const f = await fit(p)
  expect(r.rank === '値札で我に返った人' && /\d+:\d\d/.test(r.time) && r.notes >= 1 && !f.over.length, JSON.stringify(r) + JSON.stringify(f)); return r
})
await p.close()

// ---- 上手い bot で最後まで（全部剥がす）。同じ種なら同じ結果
p = await open(browser)
const run = (style, sd) => p.evaluate(([style, sd]) => {
  dpl.dbg.pause(true); dpl.seed(sd); dpl.startGame(); Object.assign(dpl.bot, { on: true, style, st: 'think', t: 0.6, x: 180, y: 600, hold: false })
  let t = 0, maxSay = 0, flash = 0, lastDark = null, flashT = [], stT = {}
  while (dpl.G.mode !== 'end' && t < 400) {
    dpl.dbg.step(6); t += 0.1; maxSay = Math.max(maxSay, dpl.state().says)
    stT[dpl.G.st] = (stT[dpl.G.st] || 0) + 0.1
  }
  dpl.bot.on = false
  return { mode: dpl.G.mode, rank: dpl.G.R && dpl.G.R.rank, clock: Math.round(dpl.G.clock), n: dpl.G.stats.n, torn: dpl.G.stats.torn, ts: dpl.G.stats.tsurun, maxSay, t: +t.toFixed(1), log: dpl.G.log.length }
}, [style, sd])
let E1
await t('上手い bot: 月まで全部剥がして「新品の月」', async () => { E1 = await run('expert', 21); expect(E1.mode === 'end' && E1.rank === 5, JSON.stringify(E1)); return E1 })
await t('画面の文字は同時に2つまで（通しの全コマ）', async () => { expect(E1.maxSay <= 2, E1.maxSay); return E1.maxSay })
await t('同じ種なら同じ結果（再現性）', async () => { const E2 = await run('expert', 21); expect(E2.clock === E1.clock && E2.n === E1.n && E2.ts === E1.ts, JSON.stringify(E2)) })
await t('結果: 見逃したものが並び、入りきらない分は「ほか N件」で一画面', async () => {
  const r = await p.evaluate(() => ({ notes: document.querySelectorAll('#notes .nt:not(.more)').length, more: (document.querySelector('#notes .more') || {}).textContent || '', top: (document.querySelector('#notes .nt b') || {}).textContent }))
  const f = await fit(p)
  expect(r.notes >= 3 && !f.over.length, JSON.stringify(r) + JSON.stringify(f)); return r
})
await t('結果の画像（1080x1350）が描ける', async () => {
  const r = await p.evaluate(() => { const c = dpl.drawCard(), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4 * 101) { const v = d[i]; s += v; s2 += v * v; n++ } return { w: c.width, h: c.height, v: Math.round(s2 / n - (s / n) ** 2) } })
  expect(r.w === 1080 && r.h === 1350 && r.v > 100, JSON.stringify(r)); return r
})
await t('Xでポスト: 本文に称号と公開URL', async () => {
  const u = await p.evaluate(() => { let got = ''; const o = window.open; window.open = x => { got = x }; document.querySelector('#bPost').click(); window.open = o; return got })
  const d = decodeURIComponent(u)
  expect(/x\.com\/intent\/post/.test(u) && d.includes('新品の月をとどけた人') && d.includes('tom3games.com/play/deadline-peel/'), d); return d.slice(0, 90)
})
await t('最後の通知は上司の「例の企画書、まだ待ってます」', async () => { const r = await p.evaluate(() => document.querySelector('#notes .nt span span') && document.querySelector('#notes .nt .tx span').textContent); expect(r === '例の企画書、まだ待ってます', r); return r })
await t('時間が速く進む場面で空が点滅しない（1秒に3回まで）', async () => {
  const r = await p.evaluate(() => {
    dpl.dbg.pause(true); dpl.seed(4); dpl.startGame(); dpl.setupStage(3); Object.assign(dpl.bot, { on: true, style: 'expert', st: 'think', t: 0.3, x: 180, y: 600 })
    const c = document.querySelector('#cv'), x = c.getContext('2d'), lum = []
    for (let i = 0; i < 240 && dpl.G.mode === 'play'; i++) { dpl.dbg.step(1); const d = x.getImageData(Math.round(c.width * 0.5), Math.round(c.height * 0.03), 1, 1).data; lum.push(d[0] * .3 + d[1] * .59 + d[2] * .11) }
    dpl.bot.on = false
    let flips = 0, dir = 0; for (let i = 1; i < lum.length; i++) { const dd = lum[i] - lum[i - 1]; if (Math.abs(dd) > 25) { const s = Math.sign(dd); if (dir && s !== dir) flips++; dir = s } }
    return { frames: lum.length, flips, perSec: +(flips / (lum.length / 60)).toFixed(2) }
  })
  expect(r.perSec <= 3, JSON.stringify(r)); return r
})
await p.close()

// ---- 英語
p = await open(browser)
await t('English: タイトル・遊び方・結果が英語になる', async () => {
  await p.click('#bLang')
  const r = await p.evaluate(() => ({ t: document.querySelector('#t1').textContent + document.querySelector('#t2').textContent, start: document.querySelector('#bStart').textContent, how: document.querySelector('#bHow').textContent }))
  await p.click('#bHow'); const hw = await p.evaluate(() => document.querySelector('#howBody').textContent); await p.click('#howClose')
  const e = await p.evaluate(() => { dpl.dbg.pause(true); dpl.seed(3); dpl.startGame(); let t = 0; while (dpl.G.mode !== 'end' && t < 120) { dpl.dbg.step(30); t += 0.5 } return { h: document.querySelector('#lkH').textContent, rank: document.querySelector('#rankSt').textContent, again: document.querySelector('#bAgain').textContent, notes: document.querySelector('#notes').textContent } })
  const jp = /[ぁ-んァ-ヶ一-龠]/
  expect(!jp.test(r.t + r.start + r.how + hw + e.h + e.rank + e.again + e.notes), JSON.stringify({ r, e })); return { title: r.t, rank: e.rank }
})
await p.close()

// ---- 3サイズ × 全画面で一画面・はみ出しなし
const SIZES = [[360, 640, 'small'], [390, 844, 'phone'], [430, 932, 'max']]
for (const [w, h, name] of SIZES) {
  const q = await open(browser, { viewport: { width: w, height: h } })
  const views = {}
  views.title = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-title.png` })
  await q.click('#bHow'); views.how = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-how.png` }); await q.click('#howClose')
  for (let k = 0; k < 5; k++) {
    await q.evaluate(k => { dpl.dbg.pause(true); dpl.seed(9); if (dpl.G.mode !== 'play') dpl.startGame(); dpl.setupStage(k); dpl.dbg.step(40) }, k)
    views['st' + k] = await fit(q)
    const inView = await q.evaluate(() => dpl.hintXY().every(h => h.x > 4 && h.x < innerWidth - 4 && h.y > 60 && h.y < innerHeight - 4))
    if (!inView) views['st' + k].over.push('hint outside')
    const cov = await q.evaluate(() => dpl.hintXY().filter(h => h.covered).map(h => h.kind))
    if (cov.length) views['st' + k].over.push('hint covered ' + cov.join(','))
    // 角を本物のマウスでつまめる（一番上のシール）
    const grab = await q.evaluate(() => { const h = dpl.hintXY().filter(h => !h.covered).sort((a, b) => b.z - a.z)[0]; return h })
    if (grab) { await q.mouse.move(grab.x, grab.y); await q.mouse.down(); await q.evaluate(() => dpl.dbg.step(1)); const ok = await q.evaluate(() => !!dpl.G.active); await q.mouse.up(); await q.evaluate(() => dpl.dbg.step(1)); if (!ok) views['st' + k].over.push('cannot grab ' + grab.kind) }
    const lv = await lumVar(q); if (lv < 150) views['st' + k].over.push('blank ' + lv)
    await q.screenshot({ path: `${ROOT}/shots/fit-${name}-st${k}.png` })
  }
  await q.evaluate(() => { dpl.G.ended = { clear: true }; dpl.G.st = 4; let i = 0; while (dpl.G.log.length < 18 && i < 30) { dpl.G.log.push({ at: 1400 + i * 1000, who: { ja: '上司', en: 'Boss' }, msg: { ja: 'テスト ' + i, en: 'test ' + i }, src: 'phone' }); i++ } dpl.finish() })
  views.end = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-end.png` })
  for (const [v, r] of Object.entries(views)) await t(`一画面に収まる ${name} ${w}x${h} ${v}`, async () => { expect(!r.over.length, JSON.stringify(r)) })
  await t(`${name}: はみ出し・エラーなし`, async () => { const o = await overflow(q); expect(o.sw <= o.W && !o.bad.length && !q.errs.length, JSON.stringify(o) + q.errs.join('|')) })
  await q.close()
}
await browser.close()

// ---- WebKit（iPhone 相当）
const wb = await webkit.launch(), wp = await open(wb, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
await t('WebKit: 2本指の touchmove を止める', async () => {
  const r = await wp.evaluate(() => { const e = new Event('touchmove', { cancelable: true, bubbles: true }); Object.defineProperty(e, 'touches', { value: [{}, {}] }); document.body.dispatchEvent(e); return e.defaultPrevented })
  expect(r, r)
})
await t('WebKit: タップで始まり、実際には無音', async () => {
  await wp.tap('#bStart'); await wp.waitForFunction(() => dpl.G.mode === 'play', null, { timeout: 3000 })
  const r = await wp.evaluate(() => window.__muteOk()); expect(r, r)
})
await t('WebKit: 指で剥がせる（ポインタの流れ）', async () => {
  const r = await wp.evaluate(() => {
    dpl.dbg.pause(true); dpl.seed(7); dpl.startGame(); dpl.dbg.step(10)
    const h = dpl.hintXY().filter(h => h.kind === 'half')[0], cv = document.querySelector('#cv')
    const ux = h.cx - h.x, uy = h.cy - h.y, l = Math.hypot(ux, uy)
    const ev = (type, x, y) => cv.dispatchEvent(new PointerEvent(type, { pointerId: 5, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true }))
    ev('pointerdown', h.x, h.y); dpl.dbg.step(1)
    const S = dpl.toScreen(1, 0)[0]
    for (let i = 1; i < 60 && dpl.G.stats.n === 0; i++) { ev('pointermove', h.x + ux / l * 5 * S * i, h.y + uy / l * 5 * S * i); dpl.dbg.step(1) }
    ev('pointerup', h.x, h.y); dpl.dbg.step(1)
    return { n: dpl.G.stats.n, ts: dpl.G.stats.tsurun }
  })
  expect(r.n === 1, JSON.stringify(r)); return r
})
await t('WebKit: 遊びの画面のスクショ', async () => { await wp.screenshot({ path: `${ROOT}/shots/webkit-play.png` }); return true })
await t('WebKit: エラーなし', async () => { expect(wp.errs.length === 0, wp.errs.join('|')) })
// ---- ページを離れた時の音（2026-11-11 横丁へ移っても BGM が鳴り続けた不具合の再発防止）
await t('WebKit: 裏に回ると BGM と環境音が止まり suspend。戻っても触るまで鳴らない（bfcache の pageshow でも）', async () => {
  const r = await wp.evaluate(async () => {
    if (!Snd.ctx) Snd.init()
    const url = Object.values(Snd.files).flat()[0]; Snd.loop('vtest', url, 0.2)
    for (let i = 0; i < 30 && !Snd.playing().includes('vtest'); i++) await new Promise(r => setTimeout(r, 100))
    Snd.drone('snd/peel_loop.mp3'); for (let i = 0; i < 30 && !(Snd.dr && Snd.dr.s); i++) await new Promise(r => setTimeout(r, 100)); const dr0 = !!(Snd.dr && Snd.dr.s)
    const c = Snd.ctx; let sus = 0; const os = c.suspend.bind(c); c.suspend = () => { sus++; return os() }
    const before = Snd.playing().length, wake0 = Snd.life.wake
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange'))
    const hid = { away: Snd.away, playing: Snd.playing().length, sus, gain: Snd.master.gain.value, dr: !!(Snd.dr && Snd.dr.s), dr0 }
    const name = Object.keys(Snd.files)[0], src = Snd.play(name); Snd.loop('vtest2', url, 0.2);    // 裏にいる間の音は鳴らさない
    await new Promise(r => setTimeout(r, 400)); const quiet = Snd.playing().length
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))
    await new Promise(r => setTimeout(r, 400)); const back = { away: Snd.away, playing: Snd.playing().length, gain: Snd.master.gain.value }
    Snd.loop('vtest2', null)
    return { before, wake0, hid, src: src === null, quiet, back }
  })
  // ボタンでない所を1回タップ（触ったら鳴らし直す）
  const pt = await wp.evaluate(() => { for (let y = 0.5; y < 0.98; y += 0.06) for (let x = 0.08; x < 0.95; x += 0.12) { const X = innerWidth * x, Y = innerHeight * y, e = document.elementFromPoint(X, Y); if (e && !e.closest('button,a,input,select,textarea,label,[onclick],[role=button],[tabindex]')) return { x: X, y: Y } } return null })
  if (pt) await wp.touchscreen.tap(pt.x, pt.y); else await wp.keyboard.press('Shift')
  await wp.waitForTimeout(700)
  const after = await wp.evaluate(() => ({ away: Snd.away, playing: Snd.playing().length, wake: Snd.life.wake, mute: window.__muteOk(), dr: !!(Snd.dr && Snd.dr.s) }))
  await wp.evaluate(() => Snd.loop('vtest', null))
  expect(r.before >= 1 && r.hid.away && r.hid.playing === 0 && r.hid.sus === 1 && r.hid.gain === 0 && r.src && r.quiet === 0 && r.back.away && r.back.playing === 0 && r.back.gain === 0 && !after.away && after.playing >= r.before && after.wake === r.wake0 + 1 && after.mute && r.hid.dr0 && !r.hid.dr && after.dr, JSON.stringify({ r, after, pt })); return { before: r.before, after: after.playing }
})
await t('WebKit: 別のページへ移る（pagehide）と止まり、戻るで戻っても鳴っていない・エラーなし', async () => {
  await wp.evaluate(() => addEventListener('pagehide', () => { try { sessionStorage.setItem('vHide', JSON.stringify({ away: Snd.away, playing: Snd.playing().length, hide: Snd.life.hide })) } catch (e) {} }))
  await wp.evaluate(() => { if (!Snd.ctx) Snd.init(); Snd.loop('vtest', Object.values(Snd.files).flat()[0], 0.2) }); await wp.waitForTimeout(500)
  const pre = await wp.evaluate(() => Snd.playing().length)
  await wp.goto(URL0 + 'privacy.html'); await wp.waitForTimeout(300)
  const hid = await wp.evaluate(() => sessionStorage.getItem('vHide'))
  await wp.goBack(); await wp.waitForFunction(() => window.__dplReady, null, { timeout: 15000 }); await wp.waitForTimeout(800)
  const back = await wp.evaluate(() => ({ playing: typeof Snd === 'undefined' ? 0 : Snd.playing().length, mute: window.__muteOk() }))
  const h = JSON.parse(hid || '{}')
  expect(pre >= 1 && h.away && h.playing === 0 && back.playing === 0 && back.mute && wp.errs.length === 0, JSON.stringify({ pre, h, back, e: wp.errs })); return { pre, h, back }
})
await wb.close()
server.kill()
console.log(results.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
