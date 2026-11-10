import '../mute-auto.mjs'   // ブラウザでは音を出さない。音は記録して後から重ねる
// X 投稿用の縦長プレイ動画（1080x1920・30fps）。node promo/film.mjs
// 上手い bot で通しで遊び、場面ごとに見せ場だけ撮る（間は早送り）。冷蔵庫で一度わざと速く引いて破る
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { serve, open, Recorder, mix, encode, inspect, stills } from '../../_shared/promo-film.mjs'

const ROOT = new URL('..', import.meta.url).pathname
const SLUG = 'deadline-peel', SEED = +(process.env.SEED || 41)
const TMP = process.env.FRAMES || join(tmpdir(), `${SLUG}-frames-${Date.now()}`)
const OUT_DIR = join(homedir(), 'Desktop/バカゲー動画'); mkdirSync(OUT_DIR, { recursive: true })
// [場面, 始まり, 終わり]（場面に入ってからの秒）。'end' は結果
const CUTS = [[0, 0.4, 5.2], [1, 0.6, 5.4], [2, 0.4, 4.6], [3, 0.3, 3.0], [4, 0.2, 99], ['end', 0, 3.2]]

const srv = await serve(ROOT)
const { b, p, errs } = await open({ chromium, port: srv.port, path: '/', ready: '__dplReady' })
await p.evaluate(sd => {
  const F = window.__film
  dpl.seed(sd); dpl.G.forceTut = true
  F.hookSnd(); F.on()
  dpl.startGame()
  dpl.DATA.stages.forEach(s => s.drain *= 0.6)
  Object.assign(dpl.bot, { on: true, style: 'expert', st: 'think', t: 0.5, x: 200, y: 600 })
  F.rec.push({ k: 'l', t: 0, slot: 'peel', url: 'snd/peel_loop.mp3', vol: 0, fade: 0.01 })
}, SEED)
const tick = (F, a) => {
  const G = dpl.G
  F.gain('peel', (window.Snd || Snd).droneVol || 0)   // eslint-disable-line no-undef
  // 冷蔵庫で一枚だけ速く引いて破る
  if (G.st === 1 && G.stageT > 2.2 && G.stageT < 3.6) dpl.bot.style = 'reckless'; else if (dpl.bot.style === 'reckless') dpl.bot.style = 'expert'
  if (a.mode === 'to') return G.mode === 'end' || (G.st === a.st && G.mode === 'play' && G.stageT >= a.t)
  if (a.mode === 'until') return G.mode === 'end' || G.st !== a.st || G.stageT >= a.t
  if (a.mode === 'end') return G.mode === 'end'
  if (a.mode === 'n') { F.k = (F.k || 0) + 1; return F.k >= a.n }
  return false
}
const rec = new Recorder(p, TMP)
const segs = []
for (const c of CUTS) {
  if (c[0] === 'end') {
    await rec.run(tick, { ff: true, max: 30 * 120, arg: { mode: 'end' } })
    await p.evaluate(() => { window.__film.k = 0 })
    const t0 = rec.sec; await rec.run(tick, { max: 200, arg: { mode: 'n', n: Math.round(c[2] * 30) } }); segs.push(['end', t0, rec.sec])
  } else {
    await rec.run(tick, { ff: true, max: 30 * 120, arg: { mode: 'to', st: c[0], t: c[1] } })
    const t0 = rec.sec; await rec.run(tick, { max: 30 * 8, arg: { mode: 'until', st: c[0], t: c[2] } }); segs.push([c[0], t0, rec.sec])
  }
}
// 最後の1.5秒: 題名を重ねる（タイトル画面と同じ書体）
await p.evaluate(() => {
  const c = document.createElement('div')
  c.innerHTML = '<span style="display:inline-block;background:#efe3c2;color:#2b2620;font:400 26px \'Yusei Magic\';padding:6px 14px;transform:rotate(-2deg)">明日締切なのに</span><br><span style="display:inline-block;margin-top:6px;background:#ffd84a;color:#e2412b;font:900 30px \'Zen Kaku Gothic New\';white-space:nowrap;padding:6px 14px;border-radius:8px;transform:rotate(-1deg)">シール剥がしが止まらない</span>'
  c.style.cssText = 'position:fixed;left:0;right:0;top:58%;z-index:99998;text-align:center;pointer-events:none;filter:drop-shadow(0 8px 14px rgba(0,0,0,.6))'
  document.body.appendChild(c); window.__film.k = 0
})
await rec.run(tick, { max: 60, arg: { mode: 'n', n: 45 } })
const log = await p.evaluate(() => ({ rec: window.__film.rec, gains: window.__film.gains, notes: window.__film.notes }))
await b.close(); srv.close()
const dur = rec.sec
const wav = join(TMP, 'mix.wav'), out = join(OUT_DIR, `${SLUG}-x-1080x1920.mp4`)
// 外の世界の音（環境音・ノック等）は少し下げる
mix({ rec: log.rec, gains: log.gains, dur, root: ROOT, out: wav })
encode({ frames: TMP, wav, out })
const info = inspect(out)
const st = stills(out, [0.5, ...segs.map(s => (s[1] + s[2]) / 2), dur - 0.6], join(TMP, 'still'))
writeFileSync(join(ROOT, 'promo/film-log.json'), JSON.stringify({ seed: SEED, cuts: CUTS, segs, info, errs }, null, 1))
console.log(JSON.stringify({ out, info, segs, errs, stills: st }, null, 1))
