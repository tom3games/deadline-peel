import './mute-auto.mjs'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
// 公開URLの確認。node live.mjs（ログインしていないブラウザで見る）。SKIPGH=1 で GitHub ページの確認を省く
// deadline-peel __dpl を置き換え、「遊びの通し」をゲームに合わせて書く
import { chromium, webkit } from 'playwright'
import { execSync } from 'node:child_process'
// 個人のアカウント名は公開リポジトリに書かない。実行時に gh から取る（2026-11-02 live.mjs に名前が文字で入ったまま5本公開していた）
const OWNER = (() => { try { return execSync('gh api user -q .login', { encoding: 'utf8' }).trim().toLowerCase() } catch { return '' } })()
const URL0 = 'https://tom3games.github.io/deadline-peel/'
const out = []
for (const [name, bt, opts] of [['chromium', chromium, {}], ['webkit', webkit, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
  const b = await bt.launch(bt === chromium ? MUTE_LAUNCH : {}), ctx = await b.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, ...opts })
  await muteContext(ctx)
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
  p.on('requestfailed', r => errs.push('fail ' + r.url()))
  // github.io は横丁（tom3games.com）へ転送される。横丁に入る前でも公開物そのものを確かめるため、転送の1行だけ外して配る
  await p.route(u => u.href.startsWith(URL0) && /\/deadline-peel\/(\?|$)/.test(u.href), async r => { const res = await r.fetch(); const body = (await res.text()).replace(/<script id="ghMove">[^<]*<\/script>/, ''); r.fulfill({ response: res, body }) })
  await p.goto(URL0 + '?t=' + Date.now(), { waitUntil: 'networkidle' })
  await p.waitForFunction(() => window.__dplReady, null, { timeout: 15000 })
  await p.click('#bStart'); await p.waitForFunction(() => dpl.G.mode === 'play', null, { timeout: 5000 })
  const muted = await p.evaluate(() => window.__muteOk())
  const r = await p.evaluate(() => { dpl.dbg.pause(true); Object.assign(dpl.bot, { on: true, style: 'expert', st: 'think', t: 0.5, x: 180, y: 600 }); let t = 0; while (dpl.G.mode !== 'end' && t < 300) { dpl.dbg.step(30); t += 0.5 } return { mode: dpl.G.mode, rank: dpl.G.R && dpl.G.R.rank, n: dpl.G.stats.n } })
  out.push(`${name}: run=${JSON.stringify(r)} muted=${muted} snd=${(await p.evaluate(() => Object.keys(Snd.bufs).length))}`)
  await p.screenshot({ path: `shots/live-${name}.png` })
  const og = await p.evaluate(async () => { const r = await fetch('og.png'); return r.status + ' ' + r.headers.get('content-type') })
  out.push(`${name}: og=${og} errors=${errs.length ? errs.join(' | ') : 'none'}`)
  await b.close()
}
if (process.env.SKIPGH) { console.log(out.join('\n')); process.exit(0) }
// ログアウト状態でリポジトリ・更新履歴に個人のIDが出ていないか
const b = await chromium.launch(MUTE_LAUNCH), p = await b.newPage()
for (const u of ['https://github.com/tom3games/deadline-peel', 'https://github.com/tom3games/deadline-peel/commits/main']) {
  const res = await p.goto(u, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500)
  out.push(`${u} status=${res.status()} owner=${OWNER && (await p.content()).toLowerCase().includes(OWNER) ? 'FOUND' : 'none'}`)
}
await b.close()
console.log(out.join('\n'))
