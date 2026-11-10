'use strict'
// 明日締切なのに、シール剥がしが止まらない（deadline-peel）
window.__jsUp = true
const $ = s => document.querySelector(s)
const STEP = 1 / 60
let lang = 'ja'
try { const l = localStorage.getItem('dpl_lang'); if (l === 'ja' || l === 'en') lang = l; else if (!/^ja/i.test(navigator.language || 'ja')) lang = 'en' } catch (e) {}
const T = () => DATA.ui[lang]
const L = o => (o && (o[lang] != null ? o[lang] : o.ja)) || ''
let seed = (Date.now() % 2147483646) + 1
const rnd = () => (seed = seed * 16807 % 2147483647, (seed - 1) / 2147483646)
const rr = (a, b) => a + rnd() * (b - a)
const pick = a => a[Math.floor(rnd() * a.length)]
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const lerp = (a, b, t) => a + (b - a) * t
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const tx = (ja, en) => lang === 'ja' ? ja : en
const FG = '"Zen Kaku Gothic New","Hiragino Kaku Gothic ProN","Hiragino Sans",sans-serif'
const FH = '"Yusei Magic","Hiragino Maru Gothic ProN",sans-serif'
const FA = '"Zen Antique","Hiragino Mincho ProN",serif'
// 見た目だけの乱数（ゲームの乱数とは別。毎回同じ木目・星・クレーター）
function vr(n) { let s = n * 9301 + 49297; return () => (s = (s * 9301 + 49297) % 233280, s / 233280) }

// ---------------------------------------------------------------- 音
Snd.def({
  pull: ['snd/pull1.mp3', 'snd/pull2.mp3', 'snd/pull3.mp3', 'snd/pull4.mp3'], tear: ['snd/tear1.mp3', 'snd/tear2.mp3'], pop: ['snd/pop1.mp3', 'snd/pop2.mp3'],
  knock: ['snd/knock1.mp3', 'snd/knock2.mp3'], buzz: ['snd/buzz1.mp3', 'snd/buzz2.mp3'], sms: 'snd/sms.mp3', ring: 'snd/ring.mp3', alarm: 'snd/alarm.mp3', drill: 'snd/drill.mp3',
  birds: 'snd/birds.mp3', rooster: 'snd/rooster.mp3', doorbell: 'snd/doorbell.mp3', swish: ['snd/swish1.mp3', 'snd/swish2.mp3'], jEnd: 'snd/jingle_end.mp3', jStage: 'snd/jingle_stage.mp3',
  fridgeHit: 'snd/amb_fridge.mp3',
})
const AMB = [
  [['a1', 'snd/amb_fridge.mp3', 0.16], ['a2', 'snd/amb_clock.mp3', 0.26]],
  [['a1', 'snd/amb_fridge.mp3', 0.34], ['a2', 'snd/amb_clock.mp3', 0.18]],
  [['a1', 'snd/amb_fridge.mp3', 0.12], ['a2', 'snd/amb_clock.mp3', 0.26]],
  [['a1', 'snd/amb_street.mp3', 0.42], ['a2', null]],
  [['a1', null], ['a2', 'snd/amb_clock.mp3', 0.3]],
]
function sfx(name, o) { return Snd.play(name, o) }

// ---------------------------------------------------------------- 画面の大きさ（世界は幅360が基準）
const cv = $('#cv'), ctx = cv.getContext('2d')
const fl = document.createElement('canvas'), fctx = fl.getContext('2d')   // 剥がした側（めくれ）を描く層
let S = 1, W = 360, H = 700, DPR = 1, K = 1
const objC = k => {
  if (k === 3) return [W / 2, H * 0.35]
  if (k === 4) return [W / 2, H * 0.46]
  if (k === 1) return [W / 2, H * 0.49]
  if (k === 2) return [W / 2, H * 0.47]
  return [W / 2, H * 0.52]
}
function layout() {
  const w = innerWidth, h = innerHeight
  const oldC = objC(G.st)
  S = Math.min(w / 360, h / 620); W = w / S; H = h / S; DPR = Math.min(2, devicePixelRatio || 1); K = S * DPR
  cv.width = Math.round(w * DPR); cv.height = Math.round(h * DPR); fl.width = cv.width; fl.height = cv.height
  if (G.stickers.length) { const c = objC(G.st); shiftWorld(c[0] - oldC[0], c[1] - oldC[1]) }
  G.bgKey = ''
}

// ---------------------------------------------------------------- 状態
const G = {
  mode: 'title', st: 0, stickers: [], active: null, finger: { x: 0, y: 0, down: false }, focus: 0.7, clock: 1380, clockT: 1380, rate: 0,
  t: 0, stageT: 0, stagePeel: 0, jolt: null, nextJolt: 9, lastJolt: '', story: 0, log: [], fly: [], ball: [], stats: { n: 0, tsurun: 0, torn: 0, maxStack: 1 },
  shake: 0, says: [], snapT: 0, transT: 0, flags: {}, warned: {}, sayIdx: {}, plays: 0, tut: 0, bgKey: '', ended: null, firstGrab: false, idleT: 0,
}

// ---------------------------------------------------------------- シールの形
function rrect(p, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); p.moveTo(x + r, y); p.arcTo(x + w, y, x + w, y + h, r); p.arcTo(x + w, y + h, x, y + h, r); p.arcTo(x, y + h, x, y, r); p.arcTo(x, y, x + w, y, r); p.closePath() }
function shapePath(s) {
  if (s.path) return s.path
  const p = new Path2D(), sh = s.shape
  if (sh.t === 'rect') rrect(p, -sh.w / 2, -sh.h / 2, sh.w, sh.h, sh.r || 3)
  else if (sh.t === 'film') { rrect(p, -sh.w / 2, -sh.h / 2, sh.w, sh.h, 4); const tx0 = sh.tab > 0 ? sh.w / 2 - 44 : -sh.w / 2 + 8; rrect(p, tx0, sh.h / 2 - 6, 36, 24, 4) }
  else if (sh.t === 'circle') { p.arc(0, 0, sh.r, 0, Math.PI * 2); if (sh.tab) { p.moveTo(0, 0); rrect(p, sh.r * 0.62, sh.r * 0.62, 34, 34, 6) } }
  else if (sh.t === 'star') { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? sh.r * 0.47 : sh.r; i ? p.lineTo(Math.cos(a) * r, Math.sin(a) * r) : p.moveTo(Math.cos(a) * r, Math.sin(a) * r) } p.closePath() }
  else if (sh.t === 'heart') { const z = sh.z; p.moveTo(0, z * 0.42); p.bezierCurveTo(-z * 0.62, z * 0.02, -z * 0.56, -z * 0.5, -z * 0.02, -z * 0.24); p.lineTo(0, -z * 0.22); p.bezierCurveTo(z * 0.56, -z * 0.5, z * 0.62, z * 0.02, 0, z * 0.42); p.closePath() }
  else if (sh.t === 'flower') { const n = 11; for (let i = 0; i <= 64; i++) { const a = i / 64 * Math.PI * 2, r = sh.r * (0.9 + 0.1 * Math.abs(Math.cos(a * n / 2))); i ? p.lineTo(Math.cos(a) * r, Math.sin(a) * r) : p.moveTo(Math.cos(a) * r, Math.sin(a) * r) } p.closePath() }
  else if (sh.t === 'tape') { const w = sh.w / 2, h = sh.h / 2; p.moveTo(-w, -h); p.lineTo(w, -h); for (let i = 0; i <= 6; i++) p.lineTo(w + (i % 2 ? -3 : 0), -h + i * sh.h / 6); p.lineTo(-w, h); for (let i = 6; i >= 0; i--) p.lineTo(-w + (i % 2 ? 3 : 0), -h + i * sh.h / 6); p.closePath() }
  return (s.path = p)
}
function shapeBox(s) {
  const sh = s.shape
  if (sh.t === 'rect' || sh.t === 'tape') return [-sh.w / 2 - 2, -sh.h / 2 - 2, sh.w + 4, sh.h + 4]
  if (sh.t === 'film') return [-sh.w / 2 - 2, -sh.h / 2 - 2, sh.w + 4, sh.h + 24]
  if (sh.t === 'circle') { const e = sh.tab ? sh.r * 0.62 + 36 : sh.r; return [-sh.r - 2, -sh.r - 2, Math.max(sh.r, e) + sh.r + 4, Math.max(sh.r, e) + sh.r + 4] }
  if (sh.t === 'star' || sh.t === 'flower') return [-sh.r - 2, -sh.r - 2, sh.r * 2 + 4, sh.r * 2 + 4]
  if (sh.t === 'heart') return [-sh.z * 0.62, -sh.z * 0.52, sh.z * 1.24, sh.z * 0.98]
  if (sh.t === 'text') return [-sh.size * 0.6, -sh.size * 0.62, sh.size * 1.2, sh.size * 1.24]
  return [-50, -50, 100, 100]
}
// 形を塗る（文字は fillText）。ローカル座標で呼ぶ
function shapeFill(c, s, style) {
  c.fillStyle = style
  if (s.shape.t === 'text') { c.font = `${s.shape.size}px ${FA}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(s.shape.ch, 0, s.shape.dy || 0) }
  else c.fill(shapePath(s))
}
// 内外判定のための小さいマスクと、面積を数える点
function buildMask(s) {
  const b = shapeBox(s), k = Math.max(b[2], b[3]) < 90 ? 2 : 1
  const mw = Math.ceil(b[2] * k) + 2, mh = Math.ceil(b[3] * k) + 2
  const m = document.createElement('canvas'); m.width = mw; m.height = mh
  const c = m.getContext('2d'); c.setTransform(k, 0, 0, k, -b[0] * k, -b[1] * k); shapeFill(c, s, '#000')
  const d = c.getImageData(0, 0, mw, mh).data, a = new Uint8Array(mw * mh)
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3] > 110 ? 1 : 0
  s.mask = { a, mw, mh, k, x0: b[0], y0: b[1] }
  // 点
  const area = a.reduce((x, y) => x + y, 0) / (k * k)
  const g = Math.max(2.4, Math.sqrt(area / 380))
  const pts = []
  const cs = Math.cos(s.rot), sn = Math.sin(s.rot)
  for (let ly = b[1] + g / 2; ly < b[1] + b[3]; ly += g) for (let lx = b[0] + g / 2; lx < b[0] + b[2]; lx += g) {
    if (!localIn(s, lx, ly)) continue
    pts.push({ x: s.x + lx * cs - ly * sn, y: s.y + lx * sn + ly * cs, alive: true })
  }
  s.pts = pts; s.g = g; s.w = 1 / Math.max(1, pts.length); s.area = area
}
function localIn(s, lx, ly) { const m = s.mask, ix = Math.round((lx - m.x0) * m.k), iy = Math.round((ly - m.y0) * m.k); return ix >= 0 && iy >= 0 && ix < m.mw && iy < m.mh && m.a[iy * m.mw + ix] === 1 }
function worldIn(s, x, y) {
  const dx = x - s.x, dy = y - s.y, cs = Math.cos(-s.rot), sn = Math.sin(-s.rot)
  if (!localIn(s, dx * cs - dy * sn, dx * sn + dy * cs)) return false
  for (const c of s.cuts) if (x * c.nx + y * c.ny <= c.f) return false
  return true
}
function alivePts(s) { return s.pts.filter(p => p.alive) }

// ---------------------------------------------------------------- シールの絵（ローカル座標）
function txt(c, t, x, y, font, color, align = 'center') { c.font = font; c.fillStyle = color; c.textAlign = align; c.textBaseline = 'middle'; c.fillText(t, x, y) }
const ART = {
  label(c, s) {
    const w = s.shape.w, h = s.shape.h
    shapeFill(c, s, '#fbfaf5'); c.strokeStyle = '#d9d4c8'; c.lineWidth = 1; c.stroke(shapePath(s))
    txt(c, tx('のり弁当', 'NORI BENTO'), -w / 2 + 8, -h / 2 + 12, `700 11px ${FG}`, '#333', 'left')
    txt(c, tx('消費期限 本日23:59', 'USE BY 23:59'), -w / 2 + 8, -h / 2 + 25, `700 7.5px ${FG}`, '#666', 'left')
    const r = vr(7); c.fillStyle = '#222'
    for (let x = -w / 2 + 8; x < -w / 2 + 52; x += 1.6) { if (r() > 0.45) c.fillRect(x, h / 2 - 24, r() > 0.5 ? 1.4 : 0.8, 17) }
    txt(c, tx('498円', '$4.98'), w / 2 - 8, h / 2 - 15, `900 22px ${FG}`, '#111', 'right')
    txt(c, tx('税込', 'tax in'), w / 2 - 8, -h / 2 + 12, `700 8px ${FG}`, '#c0392b', 'right')
  },
  disc(c, s) {
    shapeFill(c, s, '#ffd51e'); c.strokeStyle = '#e0a800'; c.lineWidth = 1.2; c.stroke(shapePath(s))
    txt(c, tx('2割引', '20% OFF'), 0, 1, `900 ${lang === 'ja' ? 22 : 17}px ${FG}`, '#d21f12')
  },
  half(c, s) {
    const r = s.shape.r
    shapeFill(c, s, '#e8402a'); c.beginPath(); c.arc(0, 0, r - 4, 0, Math.PI * 2); c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 1.5; c.stroke()
    txt(c, tx('半額', '50%'), 0, lang === 'ja' ? 0 : -4, `900 ${Math.round(r * 0.72)}px ${FG}`, '#fff')
    if (lang !== 'ja') txt(c, 'OFF', 0, r * 0.42, `900 ${Math.round(r * 0.36)}px ${FG}`, '#fff')
  },
  star(c, s) {
    const r = s.shape.r, g = c.createLinearGradient(-r, -r, r, r); g.addColorStop(0, '#fff3a0'); g.addColorStop(0.45, '#f2c230'); g.addColorStop(1, '#c48a12')
    shapeFill(c, s, g); c.strokeStyle = '#9c6a0c'; c.lineWidth = 1.4; c.stroke(shapePath(s))
    c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.ellipse(-r * 0.18, -r * 0.3, r * 0.16, r * 0.08, -0.6, 0, Math.PI * 2); c.fill()
  },
  heart(c, s) {
    const z = s.shape.z
    shapeFill(c, s, '#f27aa6'); c.strokeStyle = '#c94a7a'; c.lineWidth = 1.4; c.stroke(shapePath(s))
    c.fillStyle = 'rgba(255,255,255,.6)'; c.beginPath(); c.ellipse(-z * 0.24, -z * 0.18, z * 0.1, z * 0.06, -0.7, 0, Math.PI * 2); c.fill()
    txt(c, 'LOVE', 0, z * 0.02, `900 ${Math.round(z * 0.2)}px ${FG}`, '#fff')
  },
  gas(c, s) {
    const w = s.shape.w, h = s.shape.h
    shapeFill(c, s, '#fdfdfb'); c.strokeStyle = '#1d4fa3'; c.lineWidth = 2; c.strokeRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6)
    txt(c, tx('ガス点検済', 'GAS CHECKED'), 0, -5, `900 ${lang === 'ja' ? 15 : 12}px ${FG}`, '#1d4fa3')
    txt(c, tx('平成31年4月', 'APR 2019'), 0, 12, `700 8px ${FG}`, '#1d4fa3')
  },
  water(c, s) {
    const w = s.shape.w, h = s.shape.h
    shapeFill(c, s, '#ffe23d'); c.fillStyle = '#1556c4'; c.fillRect(-w / 2, -h / 2, w, 20)
    txt(c, tx('水のトラブル', 'PLUMBING'), 0, -h / 2 + 10, `900 13px ${FG}`, '#fff')
    txt(c, tx('24時間', '24 HOURS'), -6, 6, `900 ${lang === 'ja' ? 19 : 15}px ${FG}`, '#d21f12')
    txt(c, '0120-000-000', 0, h / 2 - 11, `700 10px ${FG}`, '#1556c4')
    c.fillStyle = '#4aa3ff'; c.beginPath(); c.moveTo(w / 2 - 14, -2); c.quadraticCurveTo(w / 2 - 6, 8, w / 2 - 14, 12); c.quadraticCurveTo(w / 2 - 22, 8, w / 2 - 14, -2); c.fill()
  },
  point(c, s) {
    const r = s.shape.r
    shapeFill(c, s, '#ff7a1a'); c.beginPath(); c.arc(0, 0, r - 3, 0, Math.PI * 2); c.strokeStyle = '#fff'; c.lineWidth = 1.2; c.setLineDash([2, 2]); c.stroke(); c.setLineDash([])
    txt(c, tx('ポイント', 'POINTS'), 0, -7, `900 9px ${FG}`, '#fff')
    txt(c, tx('2倍', 'x2'), 0, 7, `900 17px ${FG}`, '#fff')
  },
  dont(c, s) {
    shapeFill(c, s, 'rgba(236,223,190,.95)')
    c.globalAlpha = 0.25; c.fillStyle = '#fff'; c.fillRect(-s.shape.w / 2, -s.shape.h / 2, s.shape.w, 5); c.globalAlpha = 1
    txt(c, tx('はがさないで', "DON'T PEEL"), 0, 1, `${lang === 'ja' ? 17 : 15}px ${FH}`, '#3a2a22')
  },
  flower(c, s) {
    const r = s.shape.r
    shapeFill(c, s, '#ff9a3d'); c.beginPath(); c.arc(0, 0, r * 0.66, 0, Math.PI * 2); c.fillStyle = '#fff3b0'; c.fill()
    txt(c, tx('よく', 'GOOD'), 0, -6, `900 ${lang === 'ja' ? 10 : 11}px ${FG}`, '#c2410c')
    txt(c, tx('できました', 'JOB'), 0, 7, `900 ${lang === 'ja' ? 8.5 : 11}px ${FG}`, '#c2410c')
  },
  rocket(c, s) {
    shapeFill(c, s, '#bfe3ff'); c.strokeStyle = '#6aa8d8'; c.lineWidth = 1.2; c.stroke(shapePath(s))
    c.save(); c.rotate(-0.5)
    c.fillStyle = '#f5f5f5'; c.beginPath(); c.moveTo(0, -30); c.quadraticCurveTo(12, -12, 10, 14); c.lineTo(-10, 14); c.quadraticCurveTo(-12, -12, 0, -30); c.fill(); c.strokeStyle = '#555'; c.lineWidth = 1.2; c.stroke()
    c.fillStyle = '#e8402a'; c.beginPath(); c.moveTo(-10, 6); c.lineTo(-18, 20); c.lineTo(-10, 16); c.fill(); c.beginPath(); c.moveTo(10, 6); c.lineTo(18, 20); c.lineTo(10, 16); c.fill()
    c.fillStyle = '#4aa3ff'; c.beginPath(); c.arc(0, -8, 5, 0, Math.PI * 2); c.fill(); c.stroke()
    c.fillStyle = '#ffb02e'; c.beginPath(); c.moveTo(-6, 16); c.lineTo(0, 30); c.lineTo(6, 16); c.fill()
    c.restore()
  },
  film(c, s) {
    const w = s.shape.w, h = s.shape.h
    shapeFill(c, s, 'rgba(225,238,255,.13)')
    const g = c.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.42, 'rgba(255,255,255,.16)'); g.addColorStop(0.5, 'rgba(255,255,255,.03)'); g.addColorStop(0.62, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(255,255,255,0)')
    c.fillStyle = g; c.fillRect(-w / 2, -h / 2, w, h)
    c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 1; c.strokeRect(-w / 2 + 0.5, -h / 2 + 0.5, w - 1, h - 1)
    // 気泡
    const r = vr(s.shape.label === '1' ? 3 : 5); c.strokeStyle = 'rgba(255,255,255,.5)'
    for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(-w / 2 + 20 + r() * (w - 40), -h / 2 + 14 + r() * (h - 28), 2 + r() * 4, 0, Math.PI * 2); c.stroke() }
    const tx0 = s.shape.tab > 0 ? w / 2 - 44 : -w / 2 + 8
    c.fillStyle = '#2f78d6'; rrectFill(c, tx0, h / 2 - 6, 36, 24, 4)
    txt(c, s.shape.label, tx0 + 18, h / 2 + 7, `900 13px ${FG}`, '#fff')
  },
  mem(c, s) { shapeFill(c, s, '#1e1f22'); txt(c, 'MEMORY', 0, -6, `900 9px ${FG}`, '#cfd3da'); txt(c, '16GB', 0, 7, `900 12px ${FG}`, '#fff') },
  eco(c, s) {
    shapeFill(c, s, '#2e9e4f'); c.fillStyle = '#c9f2c7'; c.beginPath(); c.ellipse(-14, 0, 9, 5, -0.7, 0, Math.PI * 2); c.fill()
    txt(c, tx('省エネ', 'ECO'), 8, 0, `900 12px ${FG}`, '#fff')
  },
  letter(c, s) {
    c.save(); c.translate(1.2, 1.6); shapeFill(c, s, 'rgba(0,0,0,.28)'); c.restore()
    shapeFill(c, s, '#fbf7ec')
  },
  teikyu(c, s) { shapeFill(c, s, '#c8281e'); txt(c, tx('定休日 月', 'CLOSED MON'), 0, 1, `900 ${lang === 'ja' ? 12 : 10}px ${FG}`, '#fff') },
  moonfilm(c, s) {
    const r = s.shape.r
    shapeFill(c, s, 'rgba(70,74,86,.42)')
    const g = c.createLinearGradient(-r, -r, r, r); g.addColorStop(0, 'rgba(255,255,255,.18)'); g.addColorStop(0.5, 'rgba(255,255,255,.02)'); g.addColorStop(1, 'rgba(255,255,255,.12)')
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill()
    c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 1.2; c.stroke()
    txt(c, tx('保護フィルム', 'PROTECTIVE FILM'), 0, -r * 0.52, `900 ${lang === 'ja' ? 13 : 11}px ${FG}`, 'rgba(255,255,255,.55)')
    c.fillStyle = '#2f78d6'; rrectFill(c, r * 0.62, r * 0.62, 34, 34, 6); txt(c, '1', r * 0.62 + 17, r * 0.62 + 17, `900 14px ${FG}`, '#fff')
  },
  upside(c, s) {
    shapeFill(c, s, '#f4efe2'); c.strokeStyle = '#2a2a2a'; c.lineWidth = 1; c.stroke(shapePath(s))
    c.fillStyle = '#2a2a2a'; c.beginPath(); c.moveTo(-28, -2); c.lineTo(-20, -16); c.lineTo(-12, -2); c.fill(); c.fillRect(-22, -3, 4, 14)
    txt(c, tx('この面を', 'THIS SIDE'), 10, -8, `900 10px ${FG}`, '#2a2a2a'); txt(c, tx('上に', 'UP'), 10, 8, `900 13px ${FG}`, '#2a2a2a')
  },
  fragile(c, s) {
    shapeFill(c, s, '#e8402a'); c.strokeStyle = '#fff'; c.lineWidth = 1.2; c.strokeRect(-s.shape.w / 2 + 3, -s.shape.h / 2 + 3, s.shape.w - 6, s.shape.h - 6)
    txt(c, tx('われもの注意', 'FRAGILE'), 0, 1, `900 ${lang === 'ja' ? 13 : 15}px ${FG}`, '#fff')
  },
  kenpin(c, s) {
    const r = s.shape.r
    shapeFill(c, s, '#27a35a'); c.beginPath(); c.arc(0, 0, r - 3, 0, Math.PI * 2); c.strokeStyle = '#fff'; c.lineWidth = 1.2; c.stroke()
    txt(c, tx('検品済', 'OK'), 0, 1, `900 ${lang === 'ja' ? 12 : 15}px ${FG}`, '#fff')
  },
}
function rrectFill(c, x, y, w, h, r) { const p = new Path2D(); rrect(p, x, y, w, h, r); c.fill(p) }

// ---------------------------------------------------------------- 場面ごとのシール
function mk(o) {
  const s = Object.assign({ rot: 0, z: 0, vs: 220, back: '#f2eee4', ghost: null, cuts: [], done: false, pg: null, fresh: true, torn: 0 }, o)
  buildMask(s); return s
}
function buildStage(k) {
  const [cx, cy] = objC(k), out = []
  let id = 0
  const add = (o, dx, dy) => { const s = mk(Object.assign({ id: id++, x: cx + dx, y: cy + dy, z: id }, o)); out.push(s); return s }
  if (k === 0) {
    add({ kind: 'label', shape: { t: 'rect', w: 120, h: 68, r: 4 }, rot: -0.05, vs: 200, hint: 'bl', col: '#fbfaf5' }, -42, -16)
    add({ kind: 'disc', shape: { t: 'rect', w: 80, h: 40, r: 6 }, rot: 0.16, vs: 230, hint: 'bl', col: '#ffd51e' }, 26, -36)
    add({ kind: 'half', shape: { t: 'circle', r: 30 }, vs: 230, hint: 'c45', col: '#e8402a' }, 50, 8)
    if (G.rare.half2) add({ kind: 'half', shape: { t: 'circle', r: 27 }, rot: 0.3, vs: 230, hint: 'c45', col: '#e8402a' }, 66, -8)
  } else if (k === 1) {
    const fy = fridgeH() / 440
    add({ kind: 'heart', shape: { t: 'heart', z: 70 }, vs: 220, hint: 'heart', ghost: '#fbf8ee', col: '#f27aa6' }, -80, -150 * fy)
    add({ kind: 'star', shape: { t: 'star', r: 34 }, rot: 0.2, vs: 165, hint: 'star', ghost: '#fbf8ee', col: '#f2c230' }, -40, -122 * fy)
    add({ kind: 'gas', shape: { t: 'rect', w: 112, h: 48, r: 2 }, rot: 0.06, vs: 240, hint: 'br', ghost: '#fbf8ee', col: '#fdfdfb' }, 62, -162 * fy)
    add({ kind: 'water', shape: { t: 'rect', w: 124, h: 74, r: 5 }, rot: -0.07, vs: 260, hint: 'bl', ghost: '#fbf8ee', col: '#ffe23d' }, 56, -50 * fy)
    add({ kind: 'point', shape: { t: 'circle', r: 27 }, vs: 230, hint: 'c45', ghost: '#fbf8ee', col: '#ff7a1a' }, 104, -18 * fy)
    add({ kind: 'dont', shape: { t: 'tape', w: 134, h: 30 }, rot: -0.09, vs: 195, hint: 'br', ghost: '#fbf8ee', col: '#ecdfbe', back: '#e6dcc2', gag: 'hora' }, -64, 6 * fy)
    add({ kind: 'flower', shape: { t: 'flower', r: 34 }, vs: 210, hint: 'c45', ghost: '#fbf8ee', col: '#ff9a3d' }, -76, 118 * fy)
    add({ kind: 'rocket', shape: { t: 'rect', w: 70, h: 92, r: 12 }, rot: 0.1, vs: 220, hint: 'br', ghost: '#fbf8ee', col: '#bfe3ff' }, 50, 108 * fy)
  } else if (k === 2) {
    add({ kind: 'film', shape: { t: 'film', w: 262, h: 158, tab: -1, label: '2' }, vs: 330, back: 'rgba(236,244,255,.5)', hint: 'tabL', col: '#cfe4ff' }, 0, -70)
    add({ kind: 'film', shape: { t: 'film', w: 262, h: 158, tab: 1, label: '1' }, vs: 330, back: 'rgba(236,244,255,.5)', hint: 'tabR', col: '#cfe4ff' }, 0, -70)
    add({ kind: 'mem', shape: { t: 'rect', w: 66, h: 30, r: 3 }, rot: 0.03, vs: 200, hint: 'bl', ghost: '#cfd2d8', col: '#1e1f22' }, -86, 138)
    add({ kind: 'eco', shape: { t: 'rect', w: 62, h: 38, r: 6 }, rot: -0.05, vs: 200, hint: 'br', ghost: '#cfd2d8', col: '#2e9e4f' }, 86, 136)
  } else if (k === 3) {
    const chars = ['は', 'な', 'ま', 'る', '湯']
    chars.forEach((ch, i) => add({ kind: 'letter', shape: { t: 'text', ch, size: 60, dy: 3 }, vs: 230, back: '#d9d6cf', ghost: '#1c2a5e', hint: 'text', col: '#fbf7ec' }, -128 + i * 64, 4))
    add({ kind: 'teikyu', shape: { t: 'rect', w: 66, h: 26, r: 3 }, rot: 0.08, vs: 220, hint: 'br', ghost: '#1c2a5e', col: '#c8281e' }, 114, -36)
  } else if (k === 4) {
    add({ kind: 'moonfilm', shape: { t: 'circle', r: 128, tab: 1 }, vs: 300, back: 'rgba(225,230,240,.55)', hint: 'tabC', col: '#a9b0c0' }, 0, 0)
    add({ kind: 'kenpin', shape: { t: 'circle', r: 25 }, vs: 230, hint: 'c45', col: '#27a35a' }, 62, -66)
    add({ kind: 'upside', shape: { t: 'rect', w: 84, h: 52, r: 4 }, rot: -0.12, vs: 230, hint: 'bl', col: '#f4efe2' }, -56, -40)
    add({ kind: 'fragile', shape: { t: 'rect', w: 96, h: 40, r: 4 }, rot: 0.07, vs: 220, hint: 'br', col: '#e8402a' }, -18, 64)
  }
  return out
}
// つまみやすい角（ローカル）。p=角, a/b=折り目の両端
function hintGeo(s) {
  const sh = s.shape, h = s.hint
  if (h === 'bl' || h === 'br') { const sx = h === 'br' ? 1 : -1, px = sx * sh.w / 2, py = sh.h / 2, d = Math.min(12, sh.h * 0.3); return { p: [px, py], a: [px - sx * d, py], b: [px, py - d] } }
  if (h === 'c45') { const r = sh.r, a0 = Math.PI / 4, d = 0.32; return { p: [Math.cos(a0) * r, Math.sin(a0) * r], a: [Math.cos(a0 - d) * r, Math.sin(a0 - d) * r], b: [Math.cos(a0 + d) * r, Math.sin(a0 + d) * r] } }
  if (h === 'star') { const a0 = -Math.PI / 2 + 2 * Math.PI / 5 * 2, r = sh.r; return { p: [Math.cos(a0) * r, Math.sin(a0) * r], a: [Math.cos(a0) * r * 0.62 + Math.cos(a0 + 1.2) * 4, Math.sin(a0) * r * 0.62 + Math.sin(a0 + 1.2) * 4], b: [Math.cos(a0) * r * 0.62 - Math.cos(a0 + 1.2) * 4, Math.sin(a0) * r * 0.62 - Math.sin(a0 + 1.2) * 4] } }
  if (h === 'heart') { const z = sh.z; return { p: [0, z * 0.42], a: [-z * 0.12, z * 0.3], b: [z * 0.12, z * 0.3] } }
  if (h === 'tabR' || h === 'tabL') { const x0 = h === 'tabR' ? sh.w / 2 - 8 : -sh.w / 2 + 8, y0 = sh.h / 2 + 18, sx = h === 'tabR' ? 1 : -1; return { p: [x0, y0], a: [x0 - sx * 10, y0], b: [x0, y0 - 10] } }
  if (h === 'tabC') { const x0 = sh.r * 0.62 + 34, y0 = x0; return { p: [x0, y0], a: [x0 - 12, y0], b: [x0, y0 - 12] } }
  return null
}
const toWorld = (s, lx, ly) => { const cs = Math.cos(s.rot), sn = Math.sin(s.rot); return [s.x + lx * cs - ly * sn, s.y + lx * sn + ly * cs] }
function shiftWorld(dx, dy) {
  for (const s of G.stickers) { s.x += dx; s.y += dy; for (const p of s.pts) { p.x += dx; p.y += dy } for (const c of s.cuts) c.f += dx * c.nx + dy * c.ny }
  const seen = new Set()
  for (const s of G.stickers) { const g = s.pg; if (!g || seen.has(g)) continue; seen.add(g); const d = dx * g.u[0] + dy * g.u[1]; g.f += d; g.c0 += d; g.c1 += d; for (const it of g.list) it.p += d }
}

// ---------------------------------------------------------------- 剥がす仕組み
const R_GRAB = 24
function vSafeBase(g) { let v = Infinity; for (const m of g.members) v = Math.min(v, m.vs); return v / (1 + 0.38 * (g.members.length - 1)) }
function vSafe(g) { return vSafeBase(g) * (G.jolt && G.jolt.phase === 'hit' ? 0.38 : 1) }
function groupFrom(s0) {
  const set = [s0]
  let added = true
  while (added) {
    added = false
    for (const o of G.stickers) {
      if (o.done || set.includes(o)) continue
      if (set.some(m => o.z > m.z && alivePts(o).some(p => worldIn(m, p.x, p.y)))) { set.push(o); added = true }
    }
  }
  return set
}
// 端の近く＝外側なら24以内、内側なら端から12以内（真ん中ではつまめない）
const R_IN = 12
function nearInfo(s, x, y) {
  let n = 0, nIn = 0, inside = false
  const R2 = R_GRAB * R_GRAB, r2 = R_IN * R_IN, gi = (s.g * 0.8) ** 2
  for (const p of s.pts) { if (!p.alive) continue; const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < R2) { n++; if (d < r2) nIn++; if (d < gi) inside = true } }
  const expIn = Math.PI * r2 / (s.g * s.g)
  return { n, inside, edge: n > 0 && (!inside || nIn < expIn * 0.86) }
}
function flapPts(g) { const out = []; for (const it of g.list) { if (it.p > g.f) break; const d = 2 * (g.f - it.p); out.push([it.pt.x + g.u[0] * d, it.pt.y + g.u[1] * d]) } return out }
// 指の下にあるつまめる物
function pickAt(x, y) {
  // めくれている途中のシール（めくれた側）が一番上
  const pend = pendings()
  for (const g of pend) { for (const q of flapPts(g)) if ((q[0] - x) ** 2 + (q[1] - y) ** 2 < (R_GRAB + 6) ** 2) return { resume: g } }
  const order = G.stickers.filter(s => !s.done).sort((a, b) => b.z - a.z)
  for (const s of order) {
    const ni = nearInfo(s, x, y)
    if (!ni.n) continue
    if (s.pg) return { resume: s.pg }
    if (ni.edge) {
      const mem = groupFrom(s), p = mem.find(m => m.pg)
      if (p) return { resume: p.pg }
      return { members: mem }
    }
    if (ni.inside) return { blocked: s }
  }
  return null
}
function pendings() { const set = new Set(); for (const s of G.stickers) if (s.pg && s.pg !== G.active) set.add(s.pg); return [...set] }
function startPeel(members, x, y) {
  let sx = 0, sy = 0, n = 0
  for (const m of members) for (const p of m.pts) if (p.alive) { sx += p.x; sy += p.y; n++ }
  let ux = sx / n - x, uy = sy / n - y; const l = Math.hypot(ux, uy) || 1; ux /= l; uy /= l
  if (l < 2) { ux = 0; uy = 1 }
  const list = []
  for (const m of members) for (const p of m.pts) if (p.alive) list.push({ p: p.x * ux + p.y * uy, w: m.w, m, pt: p })
  list.sort((a, b) => a.p - b.p)
  const c0 = list[0].p - members[0].g * 0.5, c1 = list[list.length - 1].p + members[0].g * 0.5
  const g = { members, u: [ux, uy], c0, c1, f: c0, list, idx: 0, v: 0, stress: 0, oneGo: members.every(m => m.fresh && !m.cuts.length), grabOff: 0, peeled: 0, total: members.reduce((a, m) => a + alivePts(m).length * m.w, 0), whiten: 0 }
  g.grabOff = Math.max(0, (c0 + x * ux + y * uy) / 2 - c0)
  // 大きいシールほど気持ちいい（面積の平方根）
  g.size = members.reduce((t, m) => t + clamp(Math.sqrt(m.area) / 90, 0.7, 2.2), 0) / members.length
  for (const m of members) { m.pg = g; m.fresh = false }
  return g
}
function inputDown(x, y) {
  G.finger = { x, y, down: true }
  if (G.mode !== 'play') return
  const h = pickAt(x, y)
  if (!h) return
  if (h.blocked) { if (G.t - (G.flags.edgeHint || -9) > 4) { G.flags.edgeHint = G.t; say('cap', T().tutEdge, 1.3, x, y - 30) } return }
  let g
  if (h.resume) { g = h.resume; g.oneGo = false; g.grabOff = Math.max(0, (g.c0 + x * g.u[0] + y * g.u[1]) / 2 - g.f) }
  else g = startPeel(h.members, x, y)
  g.touch = true; g.v = 0; G.active = g; G.firstGrab = true
  if (G.tut === 1) G.tut = 2
  sfx('pull', { vol: 0.25, rate: 1.3, jitter: 0.08 })
}
function inputMove(x, y) { G.finger.x = x; G.finger.y = y }
function inputUp() {
  G.finger.down = false
  const g = G.active
  if (g) { g.touch = false; g.oneGo = false; G.active = null }
}

function peelStep(dt) {
  const g = G.active
  if (!g || !G.finger.down) { Snd.droneSet(0, 1); return }
  const F = G.finger, u = g.u
  const target = (g.c0 + F.x * u[0] + F.y * u[1]) / 2 - g.grabOff
  const nf = clamp(Math.max(g.f, target), g.c0, g.c1 + 1)
  const vi = (nf - g.f) / dt
  g.v += (vi - g.v) * Math.min(1, dt * 30)
  const vs = vSafe(g), ratio = g.v / vs
  if (ratio > 1) g.stress += Math.pow(ratio - 1, 1.1) * 9 * dt * (G.jolt && G.jolt.phase === 'hit' ? 1.6 : 1)
  // ぐいっと引っぱると一気に破れる（小さいシールを弾くように剥がす抜け道を止める）
  if (ratio > 2.4) g.stress += (ratio - 2.4) * 21 * dt
  else g.stress = Math.max(0, g.stress - 1.4 * dt)
  g.whiten = clamp((ratio - 0.8) / 0.35, 0, 1) * 0.6 + clamp(g.stress, 0, 1) * 0.4
  g.ratio = ratio
  // 剥がれた量
  let dW = 0
  while (g.idx < g.list.length && g.list[g.idx].p <= nf) { dW += g.list[g.idx].w; g.idx++ }
  g.f = nf; g.peeled += dW
  if (dW > 0) {
    const n = g.members.length
    const gain = dW * 0.11 * g.size * (0.25 + 0.95 * clamp(ratio, 0, 1.05)) * (1 + 0.15 * (n - 1))
    G.focus = Math.min(1, G.focus + gain)
    G.stagePeel += dW
  }
  Snd.droneSet(clamp(ratio, 0, 1.3) * 0.75, 0.72 + 0.55 * clamp(ratio, 0, 1.4))
  if (g.stress >= 1) return tear(g)
  if (g.idx >= g.list.length || g.f >= g.c1) complete(g)
}
function snapshotFlap(g) {
  // めくれた部分を小さい絵にして飛ばす
  const pts = flapPts(g); if (!pts.length) return
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const q of pts) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]) }
  x0 -= 10; y0 -= 10; x1 += 10; y1 += 10
  const c = document.createElement('canvas'), k = Math.min(2, DPR); c.width = Math.ceil((x1 - x0) * k); c.height = Math.ceil((y1 - y0) * k)
  const cc = c.getContext('2d')
  drawFlapInto(cc, g, k, -x0 * k, -y0 * k, false)
  G.fly.push({ c, x: x0, y: y0, w: x1 - x0, h: y1 - y0, t: 0, dur: 0.75, rot: rr(-1, 1) })
}
function tear(g) {
  snapshotFlap(g)
  for (const m of g.members) {
    m.cuts.push({ nx: g.u[0], ny: g.u[1], f: g.f })
    for (const p of m.pts) if (p.alive && p.x * g.u[0] + p.y * g.u[1] <= g.f) p.alive = false
    m.torn++; m.pg = null
    if (alivePts(m).length * m.w < 0.035) { m.done = true; for (const p of m.pts) p.alive = false }
  }
  G.stats.torn++
  G.focus = Math.max(0, G.focus - 0.1)
  addBall(g.members, true)
  sfx('tear', { vol: 1, jitter: 0.06 }); sfx('pull', { vol: 0.4, rate: 1.4 })
  say('pop', T().tear, 0.9, null, null, 'red')
  G.shake = Math.max(G.shake, 0.25)
  G.active = null
  G.flags.tooFast = (G.flags.tooFast || 0) + 1
  if (G.st === 0 && G.flags.tooFast === 1) say('cap', T().tutFast, 1.6, G.finger.x, G.finger.y - 40)
  checkStageDone()
}
function complete(g) {
  snapshotFlap(g)
  const n = g.members.length
  for (const m of g.members) { m.done = true; m.pg = null; for (const p of m.pts) p.alive = false }
  G.stats.n += n; G.stats.maxStack = Math.max(G.stats.maxStack, n)
  addBall(g.members, false)
  if (g.oneGo) {
    G.stats.tsurun++
    G.focus = Math.min(1, G.focus + 0.065 * Math.pow(n, 1.3))
    say('pop', n > 1 ? T().stack(n) : T().tsurun, 1.0, null, null, 'gold')
    sfx('pull', { vol: 0.9 }); sfx('pop', { vol: 0.55, delay: 0.05, rate: n > 1 ? 0.85 : 1 })
  } else sfx('pull', { vol: 0.7 })
  // 小ネタ: 保護フィルムの下にもう1枚
  if (g.members.some(m => m.kind === 'film' && m.shape.label === '1') && G.stickers.some(s => s.kind === 'film' && !s.done)) say('pop', tx('2枚目がある', 'There is a second one'), 1.4, null, null, 'hand')
  G.active = null
  checkStageDone()
}
function addBall(members, torn) { for (const m of members) G.ball.push({ col: m.col, torn, a: rnd() * Math.PI * 2, r: rnd(), s: 0.6 + rnd() * 0.6 }) }
function checkStageDone() {
  if (G.stickers.every(s => s.done)) {
    G.mode = G.st >= 4 ? 'clear' : 'trans'; G.transT = 0
    Snd.droneSet(0, 1)
    if (G.mode === 'clear') { sfx('jStage', { vol: 0.8, jitter: 0 }); say('pop', T().clear, 2.6, null, null, 'gold') }
    else { sfx('swish', { vol: 0.6 }); say('pop', T().next[G.st + 1], 1.5, null, null, 'hand') }
    G.jolt = null
  }
}

// ---------------------------------------------------------------- 画面の文字（同時に2つまで）
const SAY_PRI = { pop: 3, toast: 2, cap: 1 }
function say(kind, text, sec, x, y, cls) {
  if (!text) return
  const min = 0.9 + 0.09 * String(text).length
  G.says = G.says.filter(s => s.kind !== kind)
  G.says.push({ kind, text, t: Math.max(sec, kind === 'pop' ? 0.7 : min), x, y, cls: cls || '', who: null, fresh: true })
}
function toast(who, msg, x, y, sec) { say('toast', msg, sec || 2.6, x, y); G.says[G.says.length - 1].who = who }
function updateSays(dt) {
  for (const s of G.says) s.t -= dt
  G.says = G.says.filter(s => s.t > 0)
  const vis = G.says.slice().sort((a, b) => SAY_PRI[b.kind] - SAY_PRI[a.kind]).slice(0, 2)
  for (const k of ['pop', 'cap', 'toast']) {
    const el = $('#' + k), s = vis.find(v => v.kind === k)
    if (!s) { if (!el.hidden) el.hidden = true; continue }
    if (s.fresh || el.hidden) {
      s.fresh = false; el.hidden = false
      if (k === 'toast') { el.querySelector('b').textContent = s.who || ''; el.querySelector('span').textContent = s.text }
      else el.textContent = s.text
      el.className = 'say ' + s.cls + (k === 'pop' ? ' show' : '')
      if (k === 'pop') { void el.offsetWidth }
    }
    if (s.x != null) {
      let px = s.x * S, py = s.y * S
      if (k === 'toast') { px = clamp(px, Math.min(innerWidth - 8, el.offsetWidth + 8), innerWidth - 8); py = clamp(py, 120, innerHeight - 10); el.style.left = 'auto'; el.style.top = 'auto'; el.style.right = (innerWidth - px) + 'px'; el.style.bottom = (innerHeight - py) + 'px' }
      else { px = clamp(px, 70, innerWidth - 70); py = clamp(py, 70, innerHeight - 20); el.style.left = px + 'px'; el.style.top = py + 'px' }
    } else if (k === 'pop') { el.style.left = '50%'; el.style.top = '36%' }
  }
}
const sayCount = () => ['pop', 'cap', 'toast'].filter(k => !$('#' + k).hidden).length

// ---------------------------------------------------------------- 時計・出来事・揺れ
const BASE = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d })()
function dateAt(min) { const d = new Date(BASE.getTime()); d.setMinutes(d.getMinutes() + Math.floor(min)); return d }
const DIG = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', ' ': '' }
function segSvg(str, color) {
  const segs = { a: [2, 0, 12, 3], b: [13, 2, 3, 12], c: [13, 16, 3, 12], d: [2, 27, 12, 3], e: [0, 16, 3, 12], f: [0, 2, 3, 12], g: [2, 13.5, 12, 3] }
  let x = 0, out = ''
  for (const ch of str) {
    if (ch === ':') { out += `<rect x="${x + 1}" y="8" width="3" height="3" fill="${color}"/><rect x="${x + 1}" y="19" width="3" height="3" fill="${color}"/>`; x += 7; continue }
    const on = DIG[ch] || ''
    for (const k in segs) { const r = segs[k]; out += `<rect x="${x + r[0]}" y="${r[1]}" width="${r[2]}" height="${r[3]}" rx="1" fill="${color}" opacity="${on.includes(k) ? 1 : 0.08}"/>` }
    x += 20
  }
  return `<svg viewBox="-1 -1 ${x + 1} 32">${out}</svg>`
}
let lastClockStr = '', lastDateStr = ''
function updateHud() {
  const d = dateAt(G.clock), hh = d.getHours(), mm = d.getMinutes()
  const str = (hh < 10 ? ' ' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm
  const over = G.clock >= 1980
  if (str + over !== lastClockStr) { lastClockStr = str + over; $('#clock').innerHTML = segSvg(str, over ? '#ff5a45' : '#ff9a3d') }
  const u = T(), dm = G.clock - 1980
  let rest
  if (!over) { const left = Math.ceil(1980 - G.clock); rest = `${u.deadline} <b>${u.hrs(Math.floor(left / 60), left % 60)}</b>` }
  else if (dm < 1440) rest = `${u.over} <b>${u.hrs(Math.floor(dm / 60), Math.floor(dm % 60))}</b>`
  else if (dm < 365 * 1440) rest = `${u.over} <b>${u.days(Math.floor(dm / 1440))}</b>`
  else rest = `${u.over} <b>${u.years(Math.floor(dm / 525600))}</b>`
  const ds = (d.getFullYear() !== BASE.getFullYear() ? d.getFullYear() + '/' : '') + (d.getMonth() + 1) + '/' + d.getDate() + '　' + rest
  if (ds !== lastDateStr) { lastDateStr = ds; $('#date').innerHTML = ds }
  $('#clock').classList.toggle('ring', !!(G.jolt && G.jolt.type === 'alarm' && G.jolt.phase === 'hit'))
}
function logIt(who, msg, src) { G.log.push({ at: G.clock, who, msg, src }) }
function updateClock(dt) {
  const st = DATA.stages[G.st], n = G.stickers.length || 1
  const p = clamp(G.stagePeel / n, 0, 1)
  G.clockT = st.t0 + (st.t1 - st.t0) * p * 0.985 + Math.min(G.stageT * (G.st < 3 ? 0.4 : 0), (st.t1 - st.t0) * 0.012)
  const prev = G.clock
  G.clock += (Math.max(G.clockT, G.clock) - G.clock) * Math.min(1, dt * 3.2)
  G.rate = G.rate * 0.9 + ((G.clock - prev) / dt) * 0.1
  // 時計で起きる出来事
  while (G.story < DATA.story.length && DATA.story[G.story].at <= G.clock) fireStory(DATA.story[G.story++])
}
function srcXY(src) {
  if (src === 'phone') return phonePos()
  if (src === 'door') return [W - 30, H * 0.3]
  if (src === 'window') return [80, 150]
  if (src === 'screen') { const c = objC(2); return [c[0] + 90, c[1] - 120] }
  if (src === 'earth') return [70, 110]
  return [W / 2, 120]
}
function fireStory(e) {
  logIt(e.who, e.msg, e.src)
  if (G.mode !== 'play' && G.mode !== 'trans') return
  if (e.snd) sfx(e.snd, { vol: 0.5, dest: 'world', jitter: 0 })
  if (e.jolt) { startJolt(e.jolt, true); if (e.jolt === 'bell') toast(L(e.who), L(e.msg), W - 8, H * 0.2, 2.4); return }
  if (e.src === 'phone' || e.src === 'screen' || e.src === 'door' || e.src === 'sign' || e.src === 'window') {
    const [x, y] = e.src === 'phone' ? phonePos() : e.src === 'sign' ? [W - 12, H - 150] : srcXY(e.src)
    if (e.src === 'phone') { G.phoneLit = 2.4; sfx('sms', { vol: 0.45, dest: 'world', jitter: 0 }) }
    toast(L(e.who), L(e.msg), e.src === 'phone' ? x + 30 : x, e.src === 'phone' ? y - 64 : y, e.open ? 3.4 : 2.4)
  }
}
function startJolt(type, forced) {
  const st = DATA.stages[G.st]
  G.jolt = { type, phase: 'warn', t: type === 'alarm' ? 1.2 : st.warn, forced }
  G.lastJolt = type
  const J = DATA.jolt[type]
  if (type === 'phone') {
    // 着信の主（画面が光るのが予告）
    const ord = DATA.sayOrder.phone[G.st] || [0], i = G.sayIdx.phone || 0; G.sayIdx.phone = i + 1
    const line = DATA.says.phone[ord[i % ord.length]]
    G.jolt.line = line; G.phoneLit = st.warn + J.dur
    const [x, y] = phonePos(); toast(L(line[0]), L(line[1]), x + 30, y - 64, st.warn + 1.2)
    sfx('sms', { vol: 0.35, dest: 'world', jitter: 0 })
  } else if (L(J.warn)) { const [x, y] = joltXY(type); say('cap', L(J.warn), st.warn, x, y) }
}
function joltXY(type) {
  if (type === 'door' || type === 'bell') return [W - 50, H * 0.26]
  if (type === 'fridge') { const c = objC(1); return [c[0] + 90, c[1] - fridgeH() / 2 + 20] }
  if (type === 'alarm') return [70, 96]
  if (type === 'drill') return [70, H * 0.55]
  if (type === 'truck') return [W / 2, H - 120]
  if (type === 'rocket') return earthPos()
  return [W / 2, 100]
}
function joltHit() {
  const j = G.jolt, J = DATA.jolt[j.type]
  j.phase = 'hit'; j.t = J.dur
  G.shake = Math.max(G.shake, 0.5)
  const [x, y] = joltXY(j.type)
  if (j.type !== 'phone') say('cap', L(J.hit), J.dur, x, y, 'hit')
  else say('cap', L(J.hit), J.dur, phonePos()[0] - 10, phonePos()[1] - 20, 'hit')
  const w = { dest: 'world' }
  if (J.snd === 'knock') sfx('knock', { vol: 1, ...w })
  else if (J.snd === 'buzz') { sfx('buzz', { vol: 0.9, ...w }); sfx('buzz', { vol: 0.9, delay: 0.75, ...w }) }
  else if (J.snd === 'fridge') { const s = sfx('fridgeHit', { vol: 1, offset: 3, ...w, jitter: 0 }); if (s) s.stop(Snd.now() + J.dur) }
  else if (J.snd === 'alarm') { const s = sfx('alarm', { vol: 0.75, ...w, jitter: 0 }); if (s) s.stop(Snd.now() + J.dur) }
  else if (J.snd === 'doorbell') sfx('doorbell', { vol: 0.8, ...w, jitter: 0 })
  else if (J.snd === 'drill') { const s = sfx('drill', { vol: 0.8, ...w }); if (s) s.stop(Snd.now() + J.dur) }
  else if (J.snd === 'truck') { const s = sfx('drill', { vol: 0.9, rate: 0.42, ...w, jitter: 0.02 }); if (s) s.stop(Snd.now() + J.dur) }
  else if (J.snd === 'quake') { const s = sfx('drill', { vol: 1, rate: 0.33, ...w, jitter: 0.02 }); if (s) s.stop(Snd.now() + J.dur) }
  // 揺れの主のひとこと（結果に残る）
  let line = j.line
  if (!line && DATA.sayOrder[j.type]) { const ord = DATA.sayOrder[j.type][G.st] || [], i = G.sayIdx[j.type] || 0; G.sayIdx[j.type] = i + 1; if (ord.length) line = DATA.says[j.type][ord[i % ord.length]] }
  if (!line && DATA.says[j.type] && !j.forced) line = DATA.says[j.type][0]
  if (line) {
    if (j.type === 'door' || j.type === 'drill') { const [tx0, ty0] = j.type === 'door' || j.type === 'bell' ? [W - 8, H * 0.2] : [W - 8, H - 150]; toast(L(line[0]), L(line[1]), tx0, ty0, 2.2) }
    if (!j.forced && !['fridge', 'truck', 'rocket'].includes(j.type)) logIt(line[0], line[1], j.type)
  }
}
function updateJolt(dt) {
  const st = DATA.stages[G.st]
  if (!G.jolt) {
    if (G.stageT >= G.nextJolt && G.mode === 'play') {
      let types = st.jolts.filter(t => t !== G.lastJolt); if (!types.length) types = st.jolts
      startJolt(pick(types))
    }
    return
  }
  const j = G.jolt
  j.t -= dt
  if (j.phase === 'warn' && j.t <= 0) joltHit()
  else if (j.phase === 'hit') {
    G.shake = Math.max(G.shake, 0.35)
    if (j.t <= 0) { G.jolt = null; G.nextJolt = G.stageT + rr(st.gap[0], st.gap[1]) }
  }
}

// ---------------------------------------------------------------- 進行
function setupStage(k) {
  G.st = k; G.stickers = buildStage(k); G.active = null; G.stagePeel = 0; G.stageT = 0
  const st = DATA.stages[k]
  G.nextJolt = st.first + rr(0, 1.5); G.jolt = null; G.bgKey = ''
  G.clock = Math.max(G.clock, st.t0); G.clockT = G.clock
  for (const [slot, url, vol] of AMB[k]) Snd.loop(slot, url || null, vol || 0, 1.2)
}
function startGame() {
  G.rare = { half2: rnd() < 0.2, ufo: rnd() < 0.25 ? rr(0.2, 0.8) : -1 }
  G.mode = 'play'; G.focus = 0.72; G.clock = 1380; G.clockT = 1380; G.story = 0; G.log = []; G.fly = []; G.ball = []
  G.stats = { n: 0, tsurun: 0, torn: 0, maxStack: 1 }; G.says = []; G.flags = {}; G.sayIdx = {}; G.t = 0; G.firstGrab = false; G.ended = null; G.phoneLit = 0
  G.plays++
  let seen = false; try { seen = localStorage.getItem('dpl_tut') === '1' } catch (e) {}
  G.tut = seen && !G.forceTut ? 0 : 1
  setupStage(0)
  show('vPlay')
  Snd.init(); Snd.drone('snd/peel_loop.mp3')
  Snd.loop('bgm', 'snd/bgm_lofi.mp3', 0.2, 1.5, 'music')
  if (window.TM) TM.start()
}
function update(dt) {
  G.t += dt
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 1.4)
  if (G.phoneLit > 0) G.phoneLit -= dt
  for (const f of G.fly) f.t += dt
  G.fly = G.fly.filter(f => f.t < f.dur)
  updateSays(dt)
  if (G.mode === 'play') {
    G.stageT += dt
    peelStep(dt)
    updateJolt(dt)
    updateClock(dt)
    // 集中が減る。最初の場面は、つまむまで、あるいは4秒までは減らない
    const st = DATA.stages[G.st]
    const grace = G.st === 0 && !G.firstGrab && G.stageT < 4
    if (!grace) G.focus -= st.drain * dt * (G.active ? 0.55 : 1)
    if (G.focus < 0.3 && !G.flags.hmm) { G.flags.hmm = 1; say('cap', T().hmm, 1.4, W / 2, H * 0.2) }
    if (G.focus < 0.13 && !G.flags.what) { G.flags.what = 1; say('cap', T().what, 1.6, W / 2, H * 0.2) }
    if (G.focus > 0.45) { G.flags.hmm = 0; G.flags.what = 0 }
    if (G.focus <= 0) { G.focus = 0; snap(false) }
    Snd.setWorld(500 + Math.pow(1 - G.focus, 2) * 16000)
    if (G.tut === 1 && G.stageT > 0.6 && !G.active) tutHand()
    else hideHand()
    if (G.tut === 2 && G.stickers.some(s => s.done)) { G.tut = 3; try { localStorage.setItem('dpl_tut', '1') } catch (e) {} }
    // 重なりの案内（最初の場面で、重なりが残っている時に1回）
    if (G.st === 0 && !G.flags.stackHint && G.stats.n >= 1 && !G.active) {
      const bot = G.stickers.find(s => !s.done && !s.pg && groupFrom(s).length >= 2)
      if (bot) { G.flags.stackHint = 1; const hg = hintGeo(bot), p = toWorld(bot, hg.p[0], hg.p[1]); say('cap', T().tutStack, 2.6, p[0], p[1] + 30) }
    }
  } else if (G.mode === 'trans') {
    G.transT += dt; updateClock(dt)
    if (G.transT > 1.4) { G.focus = Math.min(1, G.focus + 0.2); setupStage(G.st + 1); G.mode = 'play' }
  } else if (G.mode === 'clear') {
    G.transT += dt
    if (G.transT > 2.6) snap(true)
  } else if (G.mode === 'snap') {
    G.snapT += dt
    if (G.snapT > 2.3) finish()
  }
  if (bot.on) botStep(dt)
}
function snap(clear) {
  G.mode = 'snap'; G.snapT = 0; G.ended = { clear }; G.active = null; G.jolt = null
  hideHand(); Snd.droneSet(0, 1)
  Snd.stopMusic('bgm', 1.1)
  Snd.setWorld(18000)
  if (!clear) {
    say('pop', T().snap, 1.6, null, null, 'hand')
    sfx('ring', { vol: 0.6, dest: 'world', jitter: 0, delay: 0.2 }); sfx('knock', { vol: 0.8, dest: 'world', delay: 0.5 }); sfx('sms', { vol: 0.5, dest: 'world', delay: 0.9, jitter: 0 })
    G.shake = 0.6
  }
}

// ---------------------------------------------------------------- 結果（ロック画面）
function rankOf() { return G.ended && G.ended.clear ? 5 : G.st }
function whenText(min) {
  const u = T(), m = Math.max(0, min)
  if (m < 1440) return u.hrs(Math.floor(m / 60), Math.floor(m % 60))
  if (m < 365 * 1440) return u.days(Math.floor(m / 1440))
  return u.years(Math.floor(m / 525600))
}
function agoText(d) {
  if (lang === 'ja') { if (d < 60) return `${Math.max(1, Math.floor(d))}分前`; if (d < 1440) return `${Math.floor(d / 60)}時間前`; if (d < 525600) return `${Math.floor(d / 1440)}日前`; return `${Math.floor(d / 525600)}年前` }
  if (d < 60) return `${Math.max(1, Math.floor(d))}m ago`; if (d < 1440) return `${Math.floor(d / 60)}h ago`; if (d < 525600) return `${Math.floor(d / 1440)}d ago`; return `${Math.floor(d / 525600)}y ago`
}
const IC = { phone: ['#3d8bfd', ''], door: ['#c27a3a', ''], window: ['#5aa36b', ''], screen: ['#d1453b', ''], sign: ['#7a5bd0', ''], earth: ['#2e7fb8', ''], fridge: ['#8a9aa8', ''], alarm: ['#e0901f', ''], bell: ['#c27a3a', ''], drill: ['#7a5bd0', ''], truck: ['#7a5bd0', ''], rocket: ['#2e7fb8', ''] }
const WHO_COL = { '上司': '#3d6fd8', '母': '#d9577a', '同僚': '#2f9d8a', '人事部': '#5b5f6b', '友だち': '#e08a1f', '玄関': '#a5683a', '企画書': '#d1453b', '目覚まし': '#c9881a', '猫': '#7a5a3a', '大家': '#6b4fb8', '同窓会': '#2e7fb8', '隣の家': '#7f8a3a', '銭湯のご主人': '#1f3a8a', '空': '#5aa0c8', '桜': '#d8789a', '窓の外': '#5aa36b', 'リマインダー': '#e2412b', '道路': '#666', '地球': '#2e7fb8' }
const whoCol = w => WHO_COL[w.ja] || '#666'
function groupedLog() {
  const out = []
  for (let i = G.log.length - 1; i >= 0; i--) {
    const e = G.log[i], key = L(e.who) + '|' + L(e.msg), f = out.find(o => o.key === key)
    if (f) f.n++; else out.push({ key, e, n: 1 })
  }
  return out
}
function finish() {
  G.mode = 'end'
  // 全部剥がした時は、上司のひとことが一番新しい通知になる
  if (G.ended && G.ended.clear) { const boss = DATA.story[DATA.story.length - 1]; G.log = G.log.filter(e => e.msg !== boss.msg); G.log.push({ at: G.clock, who: boss.who, msg: boss.msg, src: 'phone' }) }
  const R = G.R = { rank: rankOf(), clock: G.clock, missed: G.log.length, ...G.stats }
  show('vEnd')
  renderEnd()
  sfx('jEnd', { vol: 0.6, jitter: 0 })
  for (const s of ['a1', 'a2']) Snd.loop(s, null)
  if (window.TM) TM.end(Math.round(G.clock - 1380), R.rank === 5)
}
function renderEnd() {
  const R = G.R, u = T(), d = dateAt(R.clock)
  $('#lkH').textContent = R.rank === 5 ? u.endClear : u.endH
  $('#lkDate').textContent = u.lockDate(d.getFullYear(), d.getMonth() + 1, d.getDate(), u.wd[d.getDay()])
  $('#lkTime').textContent = d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0')
  $('#rankSt').textContent = L(DATA.ranks[R.rank])
  $('#stats').textContent = u.stats(R.n, R.tsurun, R.torn)
  const box = $('#notes'); box.innerHTML = ''
  const items = groupedLog()
  const rows = items.map(it => {
    const e = it.e, ic = [whoCol(e.who)], who = L(e.who)
    const el = document.createElement('div'); el.className = 'nt'
    el.innerHTML = `<span class="ic" style="background:${ic[0]}">${esc(who.slice(0, 1))}</span><span class="tx"><b>${esc(who)}${it.n > 1 ? ' ×' + it.n : ''}</b><span>${esc(L(e.msg))}</span></span><span class="tm">${esc(agoText(R.clock - e.at))}</span>`
    return el
  })
  // 入るだけ並べ、入らない分は「ほか N件」
  let shown = 0
  for (const el of rows) { box.appendChild(el); if (box.scrollHeight > box.clientHeight + 1) { el.remove(); break } shown++ }
  if (shown < rows.length) {
    const more = document.createElement('div'); more.className = 'nt more'; more.textContent = u.more(rows.length - shown); box.appendChild(more)
    while (box.scrollHeight > box.clientHeight + 1 && shown > 0) { box.removeChild(box.children[shown - 1]); shown--; more.textContent = u.more(rows.length - shown) }
  }
  $('#bAgain').textContent = u.again; $('#bSave').textContent = u.save; $('#bPost').textContent = u.post
  drawWall($('#endWall'))
}
function drawBall(c, x, y, r, n) {
  const balls = G.ball
  c.save(); c.translate(x, y)
  const g = c.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r); g.addColorStop(0, '#f6efe0'); g.addColorStop(1, '#bfb4a0')
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill()
  c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.clip()
  const r0 = vr(11)
  for (let i = 0; i < Math.min(balls.length, 80); i++) {
    const b = balls[i], a = b.a, dd = r * (0.15 + 0.8 * b.r)
    c.save(); c.translate(Math.cos(a) * dd, Math.sin(a) * dd * 0.9); c.rotate(a * 2.3)
    c.fillStyle = b.col; c.globalAlpha = 0.95
    const s = r * 0.34 * b.s
    if (i % 3 === 0) { c.beginPath(); c.arc(0, 0, s * 0.6, 0, Math.PI * 2); c.fill() } else c.fillRect(-s * 0.7, -s * 0.4, s * 1.4, s * 0.8)
    if (b.torn) { c.fillStyle = '#fff'; c.fillRect(s * 0.5, -s * 0.4, 2, s * 0.8) }
    c.restore(); r0()
  }
  c.restore()
  c.save(); c.translate(x, y)
  const hl = c.createRadialGradient(-r * 0.35, -r * 0.4, 0, -r * 0.2, -r * 0.2, r * 1.1); hl.addColorStop(0, 'rgba(255,255,255,.35)'); hl.addColorStop(0.5, 'rgba(255,255,255,0)'); hl.addColorStop(1, 'rgba(0,0,0,.35)')
  c.fillStyle = hl; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill(); c.restore()
}
function drawWall(c) {
  const w = c.clientWidth || innerWidth, h = c.clientHeight || innerHeight, d = Math.min(2, devicePixelRatio || 1)
  c.width = w * d; c.height = h * d
  const x = c.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0)
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2a1d36'); g.addColorStop(0.55, '#3a2b3e'); g.addColorStop(1, '#1a1220'); x.fillStyle = g; x.fillRect(0, 0, w, h)
  const n = G.ball.length, r = Math.min(w * 0.42, h * 0.28) * (0.55 + 0.45 * Math.min(1, n / 22))
  x.globalAlpha = 0.5; drawBall(x, w * 0.5, h * 0.62, r, n); x.globalAlpha = 1
  const v = x.createLinearGradient(0, 0, 0, h); v.addColorStop(0, 'rgba(10,8,14,.15)'); v.addColorStop(0.6, 'rgba(10,8,14,.45)'); v.addColorStop(1, 'rgba(10,8,14,.7)'); x.fillStyle = v; x.fillRect(0, 0, w, h)
}
function drawCard() {
  const c = $('#card'), x = c.getContext('2d'), R = G.R, u = T(), d = dateAt(R.clock), W0 = 1080, H0 = 1350
  const g = x.createLinearGradient(0, 0, 0, H0); g.addColorStop(0, '#2a1d36'); g.addColorStop(1, '#140e18'); x.fillStyle = g; x.fillRect(0, 0, W0, H0)
  x.globalAlpha = 0.55; drawBall(x, W0 / 2, 900, 330, G.ball.length); x.globalAlpha = 1
  x.fillStyle = 'rgba(12,9,16,.35)'; x.fillRect(0, 0, W0, H0)
  x.textAlign = 'center'; x.textBaseline = 'alphabetic'
  x.fillStyle = '#ffd9c9'; x.font = `700 38px ${FG}`; x.fillText(R.rank === 5 ? u.endClear : u.endH, W0 / 2, 110)
  x.fillStyle = '#f1ece6'; x.font = '600 40px -apple-system,"Hiragino Sans",sans-serif'; x.fillText(u.lockDate(d.getFullYear(), d.getMonth() + 1, d.getDate(), u.wd[d.getDay()]), W0 / 2, 190)
  x.fillStyle = '#fff'; x.font = '200 210px -apple-system,"Helvetica Neue",sans-serif'; x.fillText(d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'), W0 / 2, 390)
  // 称号のシール
  x.save(); x.translate(W0 / 2, 470); x.rotate(-0.045)
  x.font = `900 52px ${FG}`; const rk = L(DATA.ranks[R.rank]), tw = Math.min(980, x.measureText(rk).width + 70)
  x.fillStyle = 'rgba(0,0,0,.3)'; rrectFill(x, -tw / 2 + 6, -48 + 10, tw, 96, 14); x.fillStyle = '#ffd84a'; rrectFill(x, -tw / 2, -48, tw, 96, 14)
  x.fillStyle = '#2a1a08'; x.textBaseline = 'middle'; x.fillText(rk, 0, 2, tw - 50); x.restore()
  x.textBaseline = 'alphabetic'; x.fillStyle = '#dcd5cc'; x.font = '600 34px -apple-system,"Hiragino Sans",sans-serif'; x.fillText(u.stats(R.n, R.tsurun, R.torn), W0 / 2, 590)
  const items = groupedLog().slice(0, 5); let y = 640
  for (const it of items) {
    x.fillStyle = 'rgba(240,236,232,.88)'; rrectFill(x, 70, y, W0 - 140, 112, 30)
    x.fillStyle = whoCol(it.e.who); rrectFill(x, 96, y + 26, 60, 60, 14)
    x.fillStyle = '#fff'; x.font = `700 30px ${FG}`; x.textAlign = 'center'; x.fillText(L(it.e.who).slice(0, 1), 126, y + 67)
    x.textAlign = 'left'; x.fillStyle = '#16151a'; x.font = '700 30px -apple-system,"Hiragino Sans",sans-serif'; x.fillText(L(it.e.who) + (it.n > 1 ? ' ×' + it.n : ''), 180, y + 46, 640)
    x.font = '500 32px -apple-system,"Hiragino Sans",sans-serif'; x.fillText(L(it.e.msg), 180, y + 88, 760)
    x.textAlign = 'right'; x.fillStyle = '#6b6770'; x.font = '500 26px -apple-system,sans-serif'; x.fillText(agoText(R.clock - it.e.at), W0 - 100, y + 46)
    x.textAlign = 'center'; y += 126
  }
  x.fillStyle = 'rgba(244,240,234,.8)'; x.font = `400 34px ${FH}`; x.fillText(tx('明日締切なのに、シール剥がしが止まらない', 'Deadline Tomorrow. Can\'t Stop Peeling.'), W0 / 2, H0 - 70)
  x.font = '500 26px -apple-system,sans-serif'; x.fillStyle = 'rgba(244,240,234,.55)'; x.fillText('tom3games.com/play/deadline-peel/', W0 / 2, H0 - 30)
  return c
}
async function saveCard() {
  const c = drawCard()
  if (window.TM) TM.share('save')
  const blob = await new Promise(r => c.toBlob(r, 'image/png'))
  if (!blob) return
  const file = new File([blob], 'deadline-peel.png', { type: 'image/png' })
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return } } catch (e) { if (e && e.name === 'AbortError') return }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'deadline-peel.png'; document.body.appendChild(a); a.click(); a.remove()
}
function postX() {
  const R = G.R, u = T()
  if (window.TM) TM.share('x')
  const text = u.share(L(DATA.ranks[R.rank]), R.missed, whenText(R.clock - 1380)) + u.shareTag
  window.open('https://x.com/intent/post?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent('https://tom3games.com/play/deadline-peel/'), '_blank', 'noopener')
}

// ---------------------------------------------------------------- 背景（場面）
function skyAt(min) {
  const h = ((min / 60) % 24 + 24) % 24
  const K0 = [[0, '#070b1e', '#18213f'], [4.3, '#0d1430', '#2a2c52'], [5.4, '#3a3f74', '#e09a72'], [6.5, '#7da7d9', '#f4c99a'], [9, '#5f9be0', '#bcd9f2'], [15.5, '#5f9be0', '#c6dcef'], [17.4, '#4a5d9c', '#f09a5e'], [18.6, '#1d2350', '#7a4a6a'], [20, '#0a0f28', '#1f2546'], [24, '#070b1e', '#18213f']]
  let i = 0; while (i < K0.length - 2 && K0[i + 1][0] <= h) i++
  const a = K0[i], b = K0[i + 1], t = (h - a[0]) / (b[0] - a[0])
  let top = mix(a[1], b[1], t), bot = mix(a[2], b[2], t)
  // 一日が1秒より速く過ぎる時は点滅させず、ならした色にする
  const blur = clamp((Math.abs(G.rate) - 300) / 1200, 0, 1)
  if (blur > 0) { top = mix(top, '#33466f', blur); bot = mix(bot, '#7f8fb3', blur) }
  return { top, bot, dark: clamp(1 - (lum(top) - 0.05) / 0.35, 0, 1) * (1 - blur * 0.5), h }
}
function hex(c) { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255] }
function mix(a, b, t) { const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('') }
function lum(c) { const [r, g, b] = hex(c); return (0.3 * r + 0.59 * g + 0.11 * b) / 255 }
const seasonAt = min => { const d = dateAt(min); return d.getMonth() + 1 }
function phonePos() { return [W - 52, H - 82] }
function earthPos() { return [70, 118] }
const fridgeH = () => Math.min(H * 0.66, 520)

const bgC = document.createElement('canvas'), bgx = bgC.getContext('2d')
function ensureBg() {
  const key = G.st + ':' + W.toFixed(1) + ':' + H.toFixed(1) + ':' + K.toFixed(3)
  if (G.bgKey === key) return
  G.bgKey = key; bgC.width = cv.width; bgC.height = cv.height
  bgx.setTransform(K, 0, 0, K, 0, 0); bgx.clearRect(0, 0, W, H)
  STATIC[G.st](bgx)
}
function woodDesk(c, y0) {
  const g = c.createLinearGradient(0, y0, 0, H); g.addColorStop(0, '#5a3d29'); g.addColorStop(1, '#3a2619'); c.fillStyle = g; c.fillRect(0, y0, W, H - y0)
  const r = vr(3); c.strokeStyle = 'rgba(30,18,10,.28)'; c.lineWidth = 1
  for (let i = 0; i < 26; i++) { const y = y0 + r() * (H - y0); c.beginPath(); c.moveTo(0, y); for (let x = 0; x <= W; x += 30) c.lineTo(x, y + Math.sin(x / 40 + i) * 2 + r() * 1.5); c.stroke() }
  c.fillStyle = 'rgba(255,255,255,.05)'; c.fillRect(0, y0, W, 3)
}
function roomWall(c, y1) {
  const g = c.createLinearGradient(0, 0, 0, y1); g.addColorStop(0, '#2c2433'); g.addColorStop(1, '#3a2f3a'); c.fillStyle = g; c.fillRect(0, 0, W, y1)
  // 窓の穴（空は動くので抜く）
  c.save(); c.globalCompositeOperation = 'destination-out'; c.fillRect(22, 62, 132, 112); c.restore()
  c.strokeStyle = '#5b4636'; c.lineWidth = 7; c.strokeRect(19, 59, 138, 118); c.lineWidth = 3; c.beginPath(); c.moveTo(88, 62); c.lineTo(88, 174); c.stroke()
  c.fillStyle = '#6a5240'; c.fillRect(12, 176, 152, 7)
  // 扉
  const dx = W - 46; c.fillStyle = '#3b2c22'; c.fillRect(dx, 40, 60, y1 - 30); c.strokeStyle = '#2a1f18'; c.lineWidth = 3; c.strokeRect(dx + 6, 52, 54, y1 - 50)
  c.fillStyle = '#c8a46a'; c.beginPath(); c.arc(dx + 12, y1 * 0.6, 4, 0, Math.PI * 2); c.fill()
  // カレンダー（締切に赤丸）
  const cx0 = 176, cy0 = 70; c.fillStyle = '#f3efe6'; c.fillRect(cx0, cy0, 64, 74); c.fillStyle = '#c0392b'; c.fillRect(cx0, cy0, 64, 14)
  c.fillStyle = '#333'; for (let i = 0; i < 20; i++) c.fillRect(cx0 + 6 + (i % 5) * 11.5, cy0 + 22 + Math.floor(i / 5) * 12, 5, 3)
  c.strokeStyle = '#e02a1a'; c.lineWidth = 2; c.beginPath(); c.ellipse(cx0 + 43, cy0 + 47, 8, 6, 0, 0, Math.PI * 2); c.stroke()
}
function lampLight(c, x, y, r, a) { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(255,214,150,${a})`); g.addColorStop(1, 'rgba(255,214,150,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H) }
function drawBento(c) {
  const [x, y] = objC(0)
  c.save(); c.translate(x, y)
  c.fillStyle = 'rgba(0,0,0,.35)'; rrectFill(c, -126, -78, 258, 168, 14)
  c.fillStyle = '#16151a'; rrectFill(c, -128, -84, 256, 166, 12)
  c.fillStyle = '#26242b'; rrectFill(c, -120, -76, 240, 150, 9)
  // ごはん・のり・おかず
  c.fillStyle = '#f2efe6'; rrectFill(c, -114, -70, 136, 138, 6)
  c.fillStyle = '#20311f'; rrectFill(c, -110, -62, 128, 96, 4)
  const r = vr(9)
  for (let i = 0; i < 4; i++) { c.fillStyle = ['#b7742e', '#a6642a', '#c08038', '#9b5b22'][i]; c.beginPath(); c.ellipse(52 + (i % 2) * 30, -40 + Math.floor(i / 2) * 36, 18 + r() * 3, 14 + r() * 3, r(), 0, Math.PI * 2); c.fill() }
  c.fillStyle = '#e8e2a0'; c.beginPath(); c.ellipse(66, 46, 26, 12, -0.1, 0, Math.PI * 2); c.fill()
  c.fillStyle = '#e46a8a'; c.beginPath(); c.ellipse(-30, 50, 14, 9, 0.2, 0, Math.PI * 2); c.fill()
  c.fillStyle = '#3f7d3a'; c.beginPath(); c.moveTo(30, 60); c.lineTo(46, 30); c.lineTo(40, 64); c.fill()
  // ふた
  const g = c.createLinearGradient(-120, -80, 120, 80); g.addColorStop(0, 'rgba(255,255,255,.2)'); g.addColorStop(0.35, 'rgba(255,255,255,.05)'); g.addColorStop(0.55, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(255,255,255,.03)')
  c.fillStyle = g; rrectFill(c, -128, -84, 256, 166, 12); c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1.5; const p = new Path2D(); rrect(p, -124, -80, 248, 158, 10); c.stroke(p)
  c.restore()
}
function drawPaper(c, x, y, rot, title) {
  c.save(); c.translate(x, y); c.rotate(rot)
  c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(-58, -76, 120, 160); c.fillStyle = '#efebe1'; c.fillRect(-62, -80, 120, 160)
  txt(c, title, -50, -62, `900 11px ${FG}`, '#222', 'left')
  c.fillStyle = '#c9c4b8'; for (let i = 0; i < 3; i++) c.fillRect(-50, -46 + i * 9, 70 - i * 18, 3)
  c.strokeStyle = '#d0281a'; c.lineWidth = 2; c.strokeRect(10, 40, 40, 26); txt(c, tx('締切', 'DUE'), 30, 53, `900 12px ${FG}`, '#d0281a')
  c.restore()
}
const STATIC = [
  c => { roomWall(c, H * 0.3); woodDesk(c, H * 0.3); drawPaper(c, 58, H * 0.3 + 64, -0.18, tx('企画書（未）', 'PROPOSAL (todo)')); drawBento(c) },
  c => {
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#3a3a40'); g.addColorStop(1, '#26262b'); c.fillStyle = g; c.fillRect(0, 0, W, H)
    c.strokeStyle = 'rgba(255,255,255,.05)'; c.lineWidth = 1; for (let y = 0; y < H; y += 22) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke() } for (let x = 0; x < W; x += 22) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke() }
    const [x, y] = objC(1), fh = fridgeH(), fw = 280
    c.fillStyle = 'rgba(0,0,0,.4)'; rrectFill(c, x - fw / 2 + 8, y - fh / 2 + 10, fw, fh, 14)
    const fg = c.createLinearGradient(x - fw / 2, 0, x + fw / 2, 0); fg.addColorStop(0, '#d9cfb6'); fg.addColorStop(0.15, '#efe6cf'); fg.addColorStop(0.85, '#e9dfc6'); fg.addColorStop(1, '#cfc4aa')
    c.fillStyle = fg; rrectFill(c, x - fw / 2, y - fh / 2, fw, fh, 14)
    c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(x - fw / 2 + 6, y - fh / 2 + fh * 0.3, fw - 12, 3)
    c.fillStyle = '#b9ae94'; rrectFill(c, x - fw / 2 + 10, y - fh / 2 + fh * 0.08, 8, fh * 0.16, 4); rrectFill(c, x - fw / 2 + 10, y - fh / 2 + fh * 0.36, 8, fh * 0.26, 4)
    // 黄ばみのむら
    const r = vr(4); for (let i = 0; i < 18; i++) { c.fillStyle = `rgba(160,130,60,${0.03 + r() * 0.04})`; c.beginPath(); c.ellipse(x - fw / 2 + r() * fw, y - fh / 2 + r() * fh, 20 + r() * 40, 10 + r() * 30, r(), 0, Math.PI * 2); c.fill() }
    c.fillStyle = '#4a3a2c'; c.fillRect(0, H - 70, W, 70); c.fillStyle = '#5c4836'; c.fillRect(0, H - 70, W, 6)
  },
  c => {
    roomWall(c, H * 0.22); woodDesk(c, H * 0.22)
    const [x, y] = objC(2)
    c.fillStyle = 'rgba(0,0,0,.4)'; c.beginPath(); c.moveTo(x - 160, y + 26); c.lineTo(x + 160, y + 26); c.lineTo(x + 186, y + 182); c.lineTo(x - 186, y + 182); c.fill()
    c.fillStyle = '#b8bcc4'; c.beginPath(); c.moveTo(x - 150, y + 20); c.lineTo(x + 150, y + 20); c.lineTo(x + 176, y + 172); c.lineTo(x - 176, y + 172); c.closePath(); c.fill()
    c.fillStyle = '#a3a8b1'; c.fillRect(x - 176, y + 168, 352, 8)
    for (let row = 0; row < 4; row++) for (let i = 0; i < 12; i++) { const w0 = 280 + row * 8, kx = x - w0 / 2 + i * w0 / 12, ky = y + 32 + row * 18; c.fillStyle = '#2b2d33'; rrectFill(c, kx + 1.5, ky, w0 / 12 - 3, 14, 2) }
    c.fillStyle = '#9da2ab'; rrectFill(c, x - 50, y + 110, 100, 52, 6)
    c.fillStyle = '#1b1c20'; rrectFill(c, x - 146, y - 166, 292, 190, 10)
  },
  c => {
    const [x, y] = objC(3)
    // 銭湯の建物（空は抜いてある）。煙突は屋根の奥
    c.fillStyle = '#6d625a'; c.fillRect(W - 92, y - 230, 26, 150); c.fillStyle = '#5a504a'; c.fillRect(W - 92, y - 230, 7, 150); c.fillStyle = '#3a3330'; c.fillRect(W - 96, y - 236, 34, 8)
    txt(c, 'ゆ', W - 79, y - 190, `18px ${FA}`, '#f3ece0')
    c.fillStyle = '#4b3b30'; c.fillRect(0, y - 100, W, H - (y - 100))
    const pr = vr(13); for (let px = 0; px < W; px += 16) { c.fillStyle = `rgba(0,0,0,${0.08 + pr() * 0.12})`; c.fillRect(px, y - 100, 1.5, H); c.fillStyle = `rgba(255,220,180,${pr() * 0.04})`; c.fillRect(px + 2, y - 100, 12, H) }
    c.fillStyle = '#3b2e26'; c.beginPath(); c.moveTo(-10, y - 92); c.lineTo(W / 2, y - 150); c.lineTo(W + 10, y - 92); c.closePath(); c.fill()
    c.fillStyle = '#2a201b'; for (let i = 0; i < 12; i++) c.fillRect(i * W / 12, y - 98, 2, 8)
    c.fillStyle = '#1a1512'; c.fillRect(x - 170, y - 66, 340, 132)
    c.fillStyle = '#2a3b78'; c.fillRect(x - 162, y - 58, 324, 116)
    const g = c.createLinearGradient(0, y - 58, 0, y + 58); g.addColorStop(0, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(0,0,0,.18)'); c.fillStyle = g; c.fillRect(x - 162, y - 58, 324, 116)
    // 入り口とのれん
    const ny = y + 92; c.fillStyle = '#20180f'; c.fillRect(x - 80, ny, 160, H - ny)
    c.fillStyle = '#1f3a8a'; for (let i = 0; i < 4; i++) c.fillRect(x - 76 + i * 38.5, ny + 4, 36, 66)
    txt(c, 'ゆ', x, ny + 36, `52px ${FA}`, '#f6f1e4')
    // 提灯
    for (const lx of [x - 112, x + 112]) { c.fillStyle = '#2a201b'; c.fillRect(lx - 1, ny - 8, 2, 10); const lg = c.createRadialGradient(lx, ny + 20, 2, lx, ny + 20, 26); lg.addColorStop(0, '#ffe7b0'); lg.addColorStop(1, '#d2462e'); c.fillStyle = lg; c.beginPath(); c.ellipse(lx, ny + 20, 13, 18, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#2a201b'; c.fillRect(lx - 8, ny + 1, 16, 3); c.fillRect(lx - 8, ny + 37, 16, 3) }
    c.fillStyle = '#5a5048'; c.fillRect(0, H - 58, W, 58); c.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < W; i += 40) c.fillRect(i, H - 58, 1.5, 58)
  },
  c => {
    c.fillStyle = '#05060c'; c.fillRect(0, 0, W, H)
    const r = vr(21); for (let i = 0; i < 140; i++) { c.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.7})`; const s = r() < 0.08 ? 1.6 : 0.9; c.fillRect(r() * W, r() * H, s, s) }
    const [x, y] = objC(4), R0 = 128
    const g = c.createRadialGradient(x - 40, y - 40, 20, x, y, R0); g.addColorStop(0, '#d9d6cc'); g.addColorStop(1, '#8d8a82'); c.fillStyle = g; c.beginPath(); c.arc(x, y, R0, 0, Math.PI * 2); c.fill()
    const q = vr(8); for (let i = 0; i < 22; i++) { const a = q() * Math.PI * 2, d = q() * R0 * 0.85, cr = 4 + q() * 16; c.fillStyle = 'rgba(90,86,78,.45)'; c.beginPath(); c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, cr, 0, Math.PI * 2); c.fill(); c.fillStyle = 'rgba(255,255,255,.18)'; c.beginPath(); c.arc(x + Math.cos(a) * d - cr * 0.2, y + Math.sin(a) * d - cr * 0.2, cr * 0.7, 0, Math.PI * 2); c.fill() }
    const sh = c.createRadialGradient(x - 60, y - 60, R0 * 0.5, x, y, R0 * 1.05); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.45)'); c.fillStyle = sh; c.beginPath(); c.arc(x, y, R0, 0, Math.PI * 2); c.fill()
    c.fillStyle = '#6b6860'; c.beginPath(); c.ellipse(W / 2, H + 40, W * 0.9, 120, 0, 0, Math.PI * 2); c.fill()
  },
]
function drawWindow(c, x, y, w, h) {
  const sk = skyAt(G.clock)
  const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, sk.top); g.addColorStop(1, sk.bot); c.fillStyle = g; c.fillRect(x, y, w, h)
  if (sk.dark > 0.2) { const r = vr(5); c.fillStyle = `rgba(255,255,255,${0.6 * sk.dark})`; for (let i = 0; i < 16; i++) c.fillRect(x + r() * w, y + r() * h * 0.7, 1.2, 1.2) }
  // 月か太陽
  const hr = sk.h, day = hr > 5.5 && hr < 18.5
  const t = day ? (hr - 5.5) / 13 : ((hr + 24 - 18.5) % 24) / 11
  c.fillStyle = day ? '#fff2c0' : '#f4f0dc'; c.beginPath(); c.arc(x + w * (0.1 + 0.8 * t), y + h * (0.65 - Math.sin(t * Math.PI) * 0.45), day ? 9 : 7, 0, Math.PI * 2); c.fill()
  // 向かいの家と季節の木
  c.fillStyle = mix('#1a1c2a', '#4f5566', 1 - sk.dark); c.fillRect(x, y + h * 0.66, w * 0.55, h * 0.34)
  const mo = seasonAt(G.clock), leaf = mo >= 3 && mo <= 4 ? '#f2b8c8' : mo >= 5 && mo <= 9 ? '#3f7a3a' : mo >= 10 && mo <= 11 ? '#c8752a' : '#5a4a3c'
  c.fillStyle = mix('#0c0e14', '#3a2a20', 1 - sk.dark * 0.8); c.fillRect(x + w * 0.8 - 2, y + h * 0.6, 4, h * 0.4); c.fillStyle = mix('#0c0e14', leaf, 1 - sk.dark * 0.8); for (const [dx, dy, r] of [[-10, -4, 12], [8, -8, 13], [0, -18, 11], [12, 4, 9]]) { c.beginPath(); c.arc(x + w * 0.8 + dx, y + h * 0.6 + dy, r, 0, Math.PI * 2); c.fill() }
  if (G.rare && G.rare.ufo > 0 && G.mode === 'play' && G.st <= 2) {
    const p = (G.t * 0.12 + G.rare.ufo) % 1; if (p < 0.25) { const ux = x + w * (p / 0.25), uy = y + h * 0.3 + Math.sin(G.t * 6) * 3; c.fillStyle = '#c6d3e0'; c.beginPath(); c.ellipse(ux, uy, 9, 3, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = 'rgba(160,255,200,.8)'; c.beginPath(); c.arc(ux, uy - 2, 3, Math.PI, 0); c.fill() }
  }
}
function drawCat(c, x, y, s, flip) {
  c.save(); c.translate(x, y); c.scale(flip ? -s : s, s)
  c.fillStyle = '#16121a'
  c.beginPath(); c.moveTo(-16, 0); c.quadraticCurveTo(-18, -14, -2, -15); c.quadraticCurveTo(12, -16, 14, -6); c.lineTo(15, 0); c.closePath(); c.fill()
  c.beginPath(); c.arc(12, -14, 6.5, 0, Math.PI * 2); c.fill()
  c.beginPath(); c.moveTo(7, -18); c.lineTo(8.5, -25); c.lineTo(12, -19); c.fill(); c.beginPath(); c.moveTo(13, -19); c.lineTo(17, -24); c.lineTo(17.5, -16); c.fill()
  c.lineWidth = 3; c.strokeStyle = '#16121a'; c.lineCap = 'round'; c.beginPath(); c.moveTo(-15, -2); c.quadraticCurveTo(-26, -2, -24, -12); c.stroke()
  c.restore()
}
function drawPhone(c) {
  const [x, y] = phonePos(), lit = G.phoneLit > 0
  const buzz = G.jolt && G.jolt.type === 'phone' && G.jolt.phase === 'hit' ? Math.sin(G.t * 90) * 1.5 : 0
  c.save(); c.translate(x + buzz, y); c.rotate(-0.14)
  c.fillStyle = 'rgba(0,0,0,.4)'; rrectFill(c, -30, -56, 66, 120, 11)
  c.fillStyle = '#1b1b20'; rrectFill(c, -33, -60, 66, 120, 11)
  const sg = c.createLinearGradient(0, -54, 0, 54); sg.addColorStop(0, lit ? '#4b6fb0' : '#0c0d11'); sg.addColorStop(1, lit ? '#a07ab8' : '#0a0a0e'); c.fillStyle = sg; rrectFill(c, -29, -55, 58, 110, 8)
  if (lit) { c.fillStyle = 'rgba(255,255,255,.85)'; rrectFill(c, -24, -30, 48, 16, 4); c.fillStyle = 'rgba(255,255,255,.5)'; rrectFill(c, -24, -10, 48, 12, 4); txt(c, dateAt(G.clock).getHours() + ':' + String(dateAt(G.clock).getMinutes()).padStart(2, '0'), 0, -44, `600 10px -apple-system,sans-serif`, '#fff') }
  c.restore()
  if (lit) { c.save(); const g = c.createRadialGradient(x, y, 10, x, y, 90); g.addColorStop(0, 'rgba(140,170,255,.25)'); g.addColorStop(1, 'rgba(140,170,255,0)'); c.fillStyle = g; c.fillRect(x - 100, y - 100, 200, 200); c.restore() }
}
function drawDoorFx(c) {
  const j = G.jolt, dx = W - 46, y1 = H * (G.st === 2 ? 0.22 : 0.3)
  c.fillStyle = 'rgba(255,214,150,.5)'; c.fillRect(dx + 4, y1 - 3, 56, 3)
  if (j && (j.type === 'door' || j.type === 'bell')) {
    c.fillStyle = 'rgba(0,0,0,.85)'; const sx = dx + 18 + (j.phase === 'warn' ? (1 - j.t / 1.5) * 8 : 8); c.fillRect(sx, y1 - 3, 9, 3); c.fillRect(sx + 16, y1 - 3, 9, 3)
  }
}
function drawDynamic(c) {
  const k = G.st, sk = skyAt(G.clock)
  if (k === 0 || k === 2) {
    const kit = G.log.some(e => e.src === 'window' && e.who.ja === '猫')
    drawCat(c, 120, 176, 0.9, false)
    if (kit) for (let i = 0; i < 5; i++) drawCat(c, 40 + i * 16, 176, 0.35, i % 2)
    drawDoorFx(c)
    const deskY = H * (k === 0 ? 0.3 : 0.22)
    lampLight(c, W * 0.55, deskY + 160, 260, 0.22)
    // 日がたつほど増える空のカップ
    const days = Math.floor((G.clock - 1380) / 1440)
    for (let i = 0; i < Math.min(days, 7); i++) { const px = 22 + (i % 4) * 22, py = H - 40 - Math.floor(i / 4) * 30; c.fillStyle = '#e9e4d8'; c.fillRect(px, py, 16, 22); c.fillStyle = '#7a4a2a'; c.fillRect(px, py, 16, 4) }
  } else if (k === 1) {
    const lg = c.createLinearGradient(W, 0, W * 0.4, H * 0.5); lg.addColorStop(0, sk.bot); lg.addColorStop(1, 'rgba(0,0,0,0)')
    c.save(); c.globalAlpha = 0.28 + 0.3 * (1 - sk.dark); c.fillStyle = lg; c.beginPath(); c.moveTo(W, 0); c.lineTo(W * 0.55, 0); c.lineTo(W * 0.2, H * 0.55); c.lineTo(W, H * 0.7); c.closePath(); c.fill(); c.restore()
    const j = G.jolt
    if (j && j.type === 'fridge') { c.fillStyle = `rgba(200,230,255,${j.phase === 'hit' ? 0.12 : 0.05})`; c.fillRect(0, 0, W, H) }
  } else if (k === 3) {
    const dd = (G.clock - (3 * 1440 + 1080)) / 1440, mo = seasonAt(G.clock)
    // 集まってくる人（影）
    const crowd = Math.min(9, Math.floor(dd / 12))
    for (let i = 0; i < crowd; i++) { const px = 24 + ((i * 53) % (W - 60)), py = H - 34; c.fillStyle = 'rgba(20,16,14,.85)'; c.beginPath(); c.arc(px, py - 30, 7, 0, Math.PI * 2); c.fill(); rrectFill(c, px - 9, py - 22, 18, 30, 6) }
    // 冬は雪・春は花びら
    const isWinter = mo === 12 || mo <= 2, isSpring = mo >= 3 && mo <= 4
    if (isWinter || isSpring) { const r = vr(17); c.fillStyle = isWinter ? 'rgba(255,255,255,.8)' : 'rgba(255,190,210,.85)'; for (let i = 0; i < 40; i++) { const px = (r() * W + G.t * 12 * (isSpring ? 1.5 : 0.4)) % W, py = (r() * H + G.t * (isWinter ? 30 : 22)) % H; c.fillRect(px, py, 2.2, 2.2) } }
    const j = G.jolt
    if (j && j.type === 'truck') { const p = j.phase === 'warn' ? 1 - j.t / 1.15 : 1; c.fillStyle = `rgba(255,240,180,${0.25 * p})`; c.beginPath(); c.moveTo(0, H - 60); c.lineTo(W * p, H - 40); c.lineTo(0, H - 20); c.fill() }
    if (j && j.type === 'drill') { c.fillStyle = j.phase === 'hit' ? '#ffb020' : 'rgba(255,176,32,.5)'; c.beginPath(); c.arc(40, objC(3)[1] - 210, 4 + (j.phase === 'hit' ? Math.sin(G.t * 40) * 2 : 0), 0, Math.PI * 2); c.fill() }
  } else if (k === 4) {
    // 地球（昼と夜が回る）
    const [ex, ey] = earthPos(), er = 40
    c.fillStyle = '#1e5fa8'; c.beginPath(); c.arc(ex, ey, er, 0, Math.PI * 2); c.fill()
    c.fillStyle = '#3d9a4a'; c.beginPath(); c.ellipse(ex - 10, ey - 6, 16, 11, 0.6, 0, Math.PI * 2); c.fill(); c.beginPath(); c.ellipse(ex + 16, ey + 12, 10, 14, -0.4, 0, Math.PI * 2); c.fill()
    const ph = ((G.clock / 1440) % 1) * Math.PI * 2, blur = clamp((Math.abs(G.rate) - 300) / 1200, 0, 1)
    c.save(); c.beginPath(); c.arc(ex, ey, er, 0, Math.PI * 2); c.clip()
    c.fillStyle = `rgba(0,0,20,${0.55 * (1 - blur * 0.6)})`; c.beginPath(); c.ellipse(ex + Math.cos(ph) * er * 0.6, ey, er, er * 1.2, 0, 0, Math.PI * 2); c.fill(); c.restore()
    c.strokeStyle = 'rgba(140,190,255,.5)'; c.lineWidth = 3; c.beginPath(); c.arc(ex, ey, er + 2, 0, Math.PI * 2); c.stroke()
    const j = G.jolt
    if (j && j.type === 'rocket') { const p = j.phase === 'warn' ? 1 - j.t / 1.05 : 1; const rx = ex + 26 + p * 40, ry = ey - 30 - p * 40; c.fillStyle = '#eee'; c.fillRect(rx - 2, ry - 8, 4, 10); c.fillStyle = '#ffb02e'; c.beginPath(); c.moveTo(rx - 3, ry + 2); c.lineTo(rx, ry + 12 + Math.random() * 4); c.lineTo(rx + 3, ry + 2); c.fill() }
    // 新品の月
    if (G.mode === 'clear') { const [x, y] = objC(4), a = 0.5 + 0.5 * Math.sin(G.transT * 5); const gg = c.createRadialGradient(x, y, 100, x, y, 190); gg.addColorStop(0, `rgba(255,250,220,${0.5 * a})`); gg.addColorStop(1, 'rgba(255,250,220,0)'); c.fillStyle = gg; c.fillRect(0, 0, W, H) }
  }
}
function drawStreetBack(c) {
  const sk = skyAt(G.clock), [x, y] = objC(3), g0 = c.createLinearGradient(0, 0, 0, y - 100); g0.addColorStop(0, sk.top); g0.addColorStop(1, sk.bot); c.fillStyle = g0; c.fillRect(0, 0, W, y - 90)
    // 隣の家（古い家→足場→新しい家）
    const dd = (G.clock - (3 * 1440 + 1080)) / 1440
    const hx = 6, hy = y - 100
    if (dd < 7) { c.fillStyle = '#3a3330'; c.fillRect(hx, hy - 60, 70, 60); c.fillStyle = '#2a2420'; c.beginPath(); c.moveTo(hx - 6, hy - 60); c.lineTo(hx + 35, hy - 90); c.lineTo(hx + 76, hy - 60); c.fill() }
    else if (dd < 95) { c.strokeStyle = '#8a8070'; c.lineWidth = 2; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(hx + i * 18, hy); c.lineTo(hx + i * 18, hy - 110); c.stroke() } for (let j = 0; j < 6; j++) { c.beginPath(); c.moveTo(hx, hy - j * 20); c.lineTo(hx + 72, hy - j * 20); c.stroke() } c.fillStyle = 'rgba(70,110,170,.5)'; c.fillRect(hx, hy - 110, 72, 110); c.strokeStyle = '#e0b020'; c.lineWidth = 3; c.beginPath(); c.moveTo(hx + 60, hy - 110); c.lineTo(hx + 60, hy - 170); c.lineTo(hx + 140, hy - 170); c.stroke() }
    else { c.fillStyle = '#d9d4ca'; c.fillRect(hx, hy - 90, 76, 90); c.fillStyle = '#4b5a6e'; c.fillRect(hx + 10, hy - 74, 22, 18); c.fillRect(hx + 44, hy - 74, 22, 18); c.fillStyle = '#5b6470'; c.fillRect(hx - 4, hy - 96, 84, 8) }
    // 季節の木（右）
    const mo = seasonAt(G.clock), leaf = mo >= 3 && mo <= 4 ? '#f6c2d2' : mo >= 5 && mo <= 9 ? '#3f7a3a' : mo >= 10 && mo <= 11 ? '#c8752a' : null
    c.fillStyle = '#3a2a20'; c.fillRect(W - 40, hy - 70, 6, 70)
    if (leaf) { c.fillStyle = leaf; c.beginPath(); c.arc(W - 37, hy - 80, 30, 0, Math.PI * 2); c.fill() } else { c.strokeStyle = '#3a2a20'; c.lineWidth = 2; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(W - 37, hy - 60); c.lineTo(W - 60 + i * 12, hy - 104); c.stroke() } }
}
function drawScreen(c) {
  // ノートPCの画面の中身（フィルムの下）
  const [x, y] = objC(2), sx = x - 136, sy = y - 160, w = 272, h = 172
  c.fillStyle = '#f4f5f8'; c.fillRect(sx, sy, w, h)
  c.fillStyle = '#2f5fb3'; c.fillRect(sx, sy, w, 14); txt(c, tx('企画書_最終_v2', 'proposal_final_v2'), sx + 8, sy + 7, `700 8px ${FG}`, '#fff', 'left')
  txt(c, tx('1. はじめに', '1. Intro'), sx + 14, sy + 30, `700 11px ${FG}`, '#222', 'left')
  if ((G.t * 2 | 0) % 2) { c.fillStyle = '#222'; c.fillRect(sx + 14, sy + 40, 1.5, 12) }
  const over = G.clock >= 1980
  const unread = G.log.filter(e => e.src === 'phone' || e.src === 'door').length
  if (unread) { c.fillStyle = '#e0352b'; rrectFill(c, sx + w - 62, sy + 20, 54, 16, 8); txt(c, tx(`未読 ${unread}`, `${unread} unread`), sx + w - 35, sy + 28, `700 9px ${FG}`, '#fff') }
  if (over) { c.fillStyle = '#d1453b'; c.fillRect(sx, sy + h - 40, w, 26); txt(c, tx('提出期限を過ぎました', 'The deadline has passed'), sx + w / 2, sy + h - 27, `900 13px ${FG}`, '#fff') }
}

// ---------------------------------------------------------------- シールを描く
function clipHalf(c, nx, ny, f, keepGreater) {
  const B = 3000, s = keepGreater ? 1 : -1
  const bx = nx * f, by = ny * f, tx0 = -ny, ty0 = nx
  c.beginPath(); c.moveTo(bx + tx0 * B, by + ty0 * B); c.lineTo(bx - tx0 * B, by - ty0 * B); c.lineTo(bx - tx0 * B + nx * B * s, by - ty0 * B + ny * B * s); c.lineTo(bx + tx0 * B + nx * B * s, by + ty0 * B + ny * B * s); c.closePath(); c.clip()
}
function local(c, s) { c.translate(s.x, s.y); c.rotate(s.rot) }
function drawStickers(c, base) {
  const list = G.stickers.slice().sort((a, b) => a.z - b.z)
  // 剥がれた跡（日焼けしていない所）
  for (const s of list) if (s.ghost) {
    c.save(); local(c, s); shapeFill(c, s, s.ghost)
    if (s.gag === 'hora' && (s.done || s.pg)) txt(c, tx('ほらね', 'told you'), 0, 0, `16px ${FH}`, 'rgba(60,40,30,.75)')
    c.restore()
  }
  for (const s of list) {
    if (s.done) continue
    const g = s.pg
    c.save()
    for (const cu of s.cuts) clipHalf(c, cu.nx, cu.ny, cu.f, true)
    if (g) clipHalf(c, g.u[0], g.u[1], g.f, true)
    c.save(); local(c, s); ART[s.kind](c, s); c.restore()
    // 破れたふち
    if (s.cuts.length && s.shape.t !== 'text') {
      c.save(); local(c, s); c.clip(shapePath(s)); c.setTransform(base[0], 0, 0, base[0], base[1], base[2])
      c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 1.6
      for (const cu of s.cuts) { const B = 400, bx = cu.nx * (cu.f + 1.5), by = cu.ny * (cu.f + 1.5), t0 = -cu.ny, t1 = cu.nx; c.beginPath(); for (let i = -B; i <= B; i += 3) { const j = (i / 3) % 2 ? 1.6 : -0.6; const px = bx + t0 * i + cu.nx * j, py = by + t1 * i + cu.ny * j; i === -B ? c.moveTo(px, py) : c.lineTo(px, py) } c.stroke() }
      c.restore()
    }
    c.restore()
    // つまめる角
    if (s.fresh && !s.cuts.length && G.mode !== 'title') {
      const hg = hintGeo(s); if (!hg) continue
      const lift = 0.85 + 0.15 * Math.sin(G.t * 3 + s.id)
      const mx = (hg.a[0] + hg.b[0]) / 2, my = (hg.a[1] + hg.b[1]) / 2, px = mx + (mx - hg.p[0]) * lift, py = my + (my - hg.p[1]) * lift
      c.save(); local(c, s)
      c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.moveTo(hg.a[0], hg.a[1]); c.lineTo(hg.b[0], hg.b[1]); c.lineTo(px + 1.5, py + 2); c.closePath(); c.fill()
      c.fillStyle = s.back.startsWith('rgba') ? 'rgba(240,246,255,.85)' : s.back; c.beginPath(); c.moveTo(hg.a[0], hg.a[1]); c.lineTo(hg.b[0], hg.b[1]); c.lineTo(px, py); c.closePath(); c.fill()
      c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = 0.8; c.stroke()
      c.restore()
    }
  }
}
// めくれた側を描く（反転して重ねる）。k=拡大率, ox/oy=ずらし
function drawFlapInto(c, g, k, ox, oy, fx) {
  const u = g.u, f = g.f
  const refl = () => { c.setTransform(k, 0, 0, k, ox, oy); c.transform(1 - 2 * u[0] * u[0], -2 * u[0] * u[1], -2 * u[0] * u[1], 1 - 2 * u[1] * u[1], 2 * f * u[0], 2 * f * u[1]) }
  for (const s of g.members.slice().sort((a, b) => b.z - a.z)) {
    c.save(); refl()
    for (const cu of s.cuts) clipHalf(c, cu.nx, cu.ny, cu.f, true)
    clipHalf(c, u[0], u[1], f, false)
    local(c, s)
    if (s.shape.t === 'text') shapeFill(c, s, s.back)
    else { shapeFill(c, s, s.back); c.strokeStyle = 'rgba(0,0,0,.12)'; c.lineWidth = 1; c.stroke(shapePath(s)) }
    c.restore()
  }
  // 折り目の光と、速すぎる時の白い伸び
  c.save(); c.globalCompositeOperation = 'source-atop'; c.setTransform(k, 0, 0, k, ox, oy)
  const bx = u[0] * f, by = u[1] * f
  const lg = c.createLinearGradient(bx, by, bx + u[0] * 18, by + u[1] * 18)
  lg.addColorStop(0, 'rgba(255,255,255,.75)'); lg.addColorStop(1, 'rgba(255,255,255,0)')
  c.fillStyle = lg; c.fillRect(-50, -50, W + 100, H + 100)
  const sg = c.createLinearGradient(bx + u[0] * 10, by + u[1] * 10, bx - u[0] * 4, by - u[1] * 4)
  sg.addColorStop(0, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,.16)'); c.fillStyle = sg; c.fillRect(-50, -50, W + 100, H + 100)
  if (fx && g.whiten > 0.02) { const wg = c.createLinearGradient(bx, by, bx + u[0] * 40, by + u[1] * 40); wg.addColorStop(0, `rgba(255,255,255,${0.9 * g.whiten})`); wg.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = wg; c.fillRect(-50, -50, W + 100, H + 100) }
  if (fx && g.ratio > 0.62 && g.ratio <= 1 && g.touch) { const gg = c.createLinearGradient(bx, by, bx + u[0] * 10, by + u[1] * 10); gg.addColorStop(0, 'rgba(255,205,70,.55)'); gg.addColorStop(1, 'rgba(255,205,70,0)'); c.fillStyle = gg; c.fillRect(-50, -50, W + 100, H + 100) }
  c.restore()
}
function drawFlaps(base) {
  const gs = pendings(); if (G.active) gs.push(G.active)
  if (!gs.length) return
  fctx.setTransform(1, 0, 0, 1, 0, 0); fctx.clearRect(0, 0, fl.width, fl.height)
  for (const g of gs) drawFlapInto(fctx, g, base[0], base[1], base[2], true)
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.shadowColor = 'rgba(0,0,0,.42)'; ctx.shadowBlur = 7 * DPR; ctx.shadowOffsetX = 2 * DPR * S; ctx.shadowOffsetY = 5 * DPR * S
  ctx.drawImage(fl, 0, 0)
  ctx.restore()
  // 剥がれる境目の白い筋（伸び）
  const g = G.active
  if (g && g.whiten > 0.3) {
    ctx.save(); ctx.setTransform(base[0], 0, 0, base[0], base[1], base[2])
    const bx = g.u[0] * g.f, by = g.u[1] * g.f, t0 = -g.u[1], t1 = g.u[0]
    ctx.strokeStyle = `rgba(255,255,255,${0.7 * g.whiten})`; ctx.lineWidth = 0.8
    const ps = flapPts(g); let lo = 1e9, hi = -1e9; for (const q of ps.slice(-60)) { const d = (q[0] - bx) * t0 + (q[1] - by) * t1; lo = Math.min(lo, d); hi = Math.max(hi, d) }
    if (lo < hi) for (let d = lo; d < hi; d += 4) { const l = 2 + Math.random() * 5 * g.whiten; ctx.beginPath(); ctx.moveTo(bx + t0 * d, by + t1 * d); ctx.lineTo(bx + t0 * d + g.u[0] * l, by + t1 * d + g.u[1] * l); ctx.stroke() }
    ctx.restore()
  }
}

// ---------------------------------------------------------------- 描画
function render() {
  const sh = G.shake > 0 ? G.shake * 4 : 0
  const ox = (Math.random() - 0.5) * sh * K, oy = (Math.random() - 0.5) * sh * K
  const base = [K, ox, oy]
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#0d0b10'; ctx.fillRect(0, 0, cv.width, cv.height)
  if (G.mode === 'end') return
  ctx.setTransform(K, 0, 0, K, ox, oy)
  // 空（窓の向こう）は静的な層より先に描く
  const k = G.st
  if (k === 0 || k === 2) drawWindow(ctx, 22, 62, 132, 112)
  if (k === 3) drawStreetBack(ctx)
  ensureBg()
  ctx.save(); ctx.setTransform(1, 0, 0, 1, ox, oy); ctx.drawImage(bgC, 0, 0); ctx.restore()
  ctx.setTransform(K, 0, 0, K, ox, oy)
  drawDynamic(ctx)
  if (k === 2) drawScreen(ctx)
  drawStickers(ctx, base)
  drawFlaps(base)
  ctx.setTransform(K, 0, 0, K, ox, oy)
  drawPhone(ctx)
  // 飛んでいくシール → 玉
  const [bx, by] = ballPos()
  for (const f of G.fly) {
    const t = f.t / f.dur, e = t * t * (3 - 2 * t), cx0 = f.x + f.w / 2, cy0 = f.y + f.h / 2
    const x = lerp(cx0, bx, e), y = lerp(cy0, by, e) - Math.sin(t * Math.PI) * 60, s = lerp(1, 0.15, e)
    ctx.save(); ctx.translate(x, y); ctx.rotate(f.rot * e * 3); ctx.scale(s, s); ctx.drawImage(f.c, -f.w / 2, -f.h / 2, f.w, f.h); ctx.restore()
  }
  if (G.mode !== 'title') drawBall(ctx, bx, by, 13 + Math.sqrt(G.ball.length) * 2.6, G.ball.length)
  // 集中（まわりが暗くなる）
  if (G.mode !== 'title') {
    const fo = G.mode === 'snap' ? Math.max(0, 1 - G.snapT * 2) * G.focus : G.focus
    const pulse = G.focus < 0.3 && G.mode === 'play' ? 0.5 + 0.5 * Math.sin(G.t * 7) : 1
    const [cx, cy] = objC(k), r0 = 110 + (1 - fo) * 140
    const vg = ctx.createRadialGradient(cx, cy, r0, cx, cy, r0 + 260)
    vg.addColorStop(0, 'rgba(8,6,12,0)'); vg.addColorStop(1, `rgba(8,6,12,${(0.12 + 0.62 * fo) * pulse})`)
    ctx.fillStyle = vg; ctx.fillRect(-20, -20, W + 40, H + 40)
  } else { ctx.fillStyle = 'rgba(10,8,14,.5)'; ctx.fillRect(0, 0, W, H) }
  if (G.mode === 'trans') { ctx.fillStyle = `rgba(8,6,12,${clamp(G.transT / 1.4, 0, 1) * 0.9})`; ctx.fillRect(-20, -20, W + 40, H + 40) }
  // 指
  if (G.finger.down && G.mode === 'play' && (G.active || bot.on)) { ctx.fillStyle = 'rgba(255,240,220,.28)'; ctx.beginPath(); ctx.arc(G.finger.x, G.finger.y, 13, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1.5; ctx.stroke() }
  if (G.mode === 'play' || G.mode === 'trans' || G.mode === 'clear' || G.mode === 'snap') updateHud()
}
const ballPos = () => [30, H - 34]

// ---------------------------------------------------------------- チュートリアルの指
let handT = 0
function tutHand() {
  const s = G.stickers.filter(s => !s.done && s.fresh).sort((a, b) => b.z - a.z)[0]; if (!s) return hideHand()
  const hg = hintGeo(s), p = toWorld(s, hg.p[0], hg.p[1])
  const c0 = toWorld(s, 0, 0); let ux = c0[0] - p[0], uy = c0[1] - p[1]; const l = Math.hypot(ux, uy) || 1; ux /= l; uy /= l
  handT = (handT + STEP) % 1.8
  const t = clamp((handT - 0.3) / 1.1, 0, 1), d = t * 120
  const el = $('#hand'); el.hidden = false; el.style.left = (p[0] + ux * d) * S + 'px'; el.style.top = (p[1] + uy * d) * S + 'px'; el.style.opacity = handT < 1.5 ? 1 : 0
  if (!G.flags.tutSaid) { G.flags.tutSaid = 1; say('cap', T().tutGrab, 3.2, p[0], p[1] + 46) }
}
function hideHand() { const el = $('#hand'); if (!el.hidden) el.hidden = true }

// ---------------------------------------------------------------- bot（検証と動画用。人の速さで遊ぶ）
const bot = { on: false, style: 'human', st: 'think', t: 0.6, x: 0, y: 0, k: 0.8, plan: null, react: 0.7 }
function botTarget() {
  const pend = pendings()
  if (pend.length) { const g = pend[0], ps = flapPts(g); const q = ps[0] || [g.list[0].pt.x, g.list[0].pt.y]; return { x: q[0], y: q[1] } }
  const live = G.stickers.filter(s => !s.done)
  if (!live.length) return null
  // まとめて剥がす（上手い bot は、揺れが近くない時に）
  if (bot.style === 'expert' || (bot.style === 'human' && rnd() < 0.35)) {
    const stackable = live.filter(s => s.fresh && !s.cuts.length && groupFrom(s).length >= 2)
    if (stackable.length && !(G.jolt)) { const s = stackable[0], hg = hintGeo(s); if (hg) { const p = toWorld(s, hg.p[0], hg.p[1]); const c = toWorld(s, 0, 0); return { x: p[0] + (p[0] - c[0]) * 0.03, y: p[1] + (p[1] - c[1]) * 0.03 } } }
  }
  // 上にあるものから
  const s = live.sort((a, b) => b.z - a.z).find(s => !G.stickers.some(o => !o.done && o.z > s.z && alivePts(o).some(p => worldIn(s, p.x, p.y)))) || live[0]
  if (!s.cuts.length && s.hint && s.hint !== 'text') { const hg = hintGeo(s), p = toWorld(s, hg.p[0], hg.p[1]); return { x: p[0], y: p[1] } }
  // 破れた所・文字: 端の点
  const pts = alivePts(s); let best = pts[0], cu = s.cuts[s.cuts.length - 1], bd = Infinity
  for (const p of pts) { const d = cu ? p.x * cu.nx + p.y * cu.ny : p.y * 1 + p.x * 0.2; if (d < bd) { bd = d; best = p } }
  if (!cu) { let mx = -Infinity; for (const p of pts) { const d = p.y + p.x * 0.3; if (d > mx) { mx = d; best = p } } }
  return { x: best.x, y: best.y }
}
function botStep(dt) {
  if (G.mode !== 'play' || bot.style === 'idle') { if (G.finger.down && G.mode !== 'play') inputUp(); return }
  const j = G.jolt
  const sees = j && (bot.style === 'expert' || bot.style === 'slow' ? (j.phase === 'warn' && j.t < DATA.stages[G.st].warn - 0.2) || j.phase === 'hit' : bot.style === 'human' ? bot.notice && ((j.phase === 'warn' && j.t < DATA.stages[G.st].warn - bot.react) || j.phase === 'hit') : false)
  if (j && j.phase === 'warn' && bot.lastJ !== j) { bot.lastJ = j; bot.notice = rnd() < 0.75; bot.react = rr(0.5, 1.0) }
  bot.t -= dt
  if (bot.st === 'think') {
    if (bot.t > 0) return
    const tg = botTarget(); if (!tg) return
    bot.tx = tg.x; bot.ty = tg.y; bot.st = 'move'; bot.t = Math.hypot(tg.x - bot.x, tg.y - bot.y) / 900 + (bot.style === 'human' ? rr(0.15, 0.35) : 0.1)
  } else if (bot.st === 'move') {
    if (bot.t > 0) return
    bot.x = bot.tx; bot.y = bot.ty
    if (sees && bot.style !== 'reckless') { bot.t = 0.2; return }
    inputDown(bot.x, bot.y)
    if (!G.active) { bot.st = 'think'; bot.t = 0.3; bot.x += rr(-6, 6); return }
    bot.st = 'pull'; bot.k = bot.style === 'expert' ? 0.9 : bot.style === 'reckless' ? 1.8 : bot.style === 'slow' ? 0.45 : rr(0.55, 1.15); bot.noise = 0
  } else if (bot.st === 'pull') {
    const g = G.active
    if (!g) { inputUp(); bot.st = 'think'; bot.t = bot.style === 'human' ? rr(0.35, 0.8) : 0.25; return }
    if (sees && bot.style !== 'reckless') { bot.hold = true } else if (bot.hold && !j) bot.hold = false
    if (bot.hold) return
    // 白く伸びたら少しゆるめる（人は0.4秒遅れて気づく）
    if (bot.style !== 'reckless' && g.whiten > 0.5) { bot.slowT = (bot.slowT || 0) + dt; if (bot.slowT > (bot.style === 'expert' ? 0.12 : 0.4)) { bot.k *= 0.8; bot.slowT = 0 } }
    bot.noise += dt; if (bot.noise > 0.3) { bot.noise = 0; if (bot.style === 'human') bot.k = clamp(bot.k * rr(0.86, 1.14), 0.4, 1.3) }
    const v = vSafeBase(g) * 2 * bot.k
    bot.x += g.u[0] * v * dt; bot.y += g.u[1] * v * dt
    inputMove(bot.x, bot.y)
  }
}

// ---------------------------------------------------------------- 画面の切り替え・タイトル
function show(id) {
  for (const v of ['vTitle', 'vPlay', 'vEnd']) $('#' + v).hidden = v !== id
  $('#bLang').hidden = id === 'vPlay'
  if (id !== 'vPlay') { for (const k of ['pop', 'cap', 'toast']) $('#' + k).hidden = true; hideHand() }
}
function buildTitle() {
  const u = T()
  $('#t1').textContent = u.title1; $('#t2').textContent = u.title2; $('#t3').innerHTML = `<em>${esc(u.title3)}</em>`
  $('#bStart').textContent = u.start; $('#bHow').textContent = u.how; $('#bLang').textContent = u.lang
  document.documentElement.lang = lang
}
function buildHow() {
  const u = T()
  $('#howH').textContent = u.howH
  $('#howBody').innerHTML = u.howList.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('')
  $('#howCtl').textContent = matchMedia('(pointer:coarse)').matches ? u.howSp : u.howPc
  $('#howCr').textContent = u.credit
  $('#howClose').textContent = u.close
}
function setMuteIcons() { for (const b of document.querySelectorAll('.wv')) b.style.opacity = Snd.muted ? '0' : '1' }
function toggleMute() { Snd.setMute(!Snd.muted); try { localStorage.setItem('dpl_mute', Snd.muted ? '1' : '0') } catch (e) {} setMuteIcons() }
try { if (localStorage.getItem('dpl_mute') === '1') Snd.muted = true } catch (e) {}

// ---------------------------------------------------------------- 入力
const toW = e => [e.clientX / S, e.clientY / S]
let pid = null
cv.addEventListener('pointerdown', e => { if (pid !== null && e.pointerId !== pid) return; pid = e.pointerId; e.preventDefault(); try { cv.setPointerCapture(e.pointerId) } catch (er) {} const [x, y] = toW(e); bot.on = false; inputDown(x, y) })
cv.addEventListener('pointermove', e => { if (e.pointerId !== pid) return; const [x, y] = toW(e); inputMove(x, y) })
const up = e => { if (e.pointerId !== pid) return; pid = null; inputUp() }
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('lostpointercapture', up)
cv.addEventListener('contextmenu', e => e.preventDefault())
$('#bStart').addEventListener('click', () => {
  Snd.init(); sfx('pull', { vol: 0.8 })
  const b = $('#bStart'); b.classList.add('peel')
  setTimeout(() => { b.classList.remove('peel'); startGame() }, 330)
})
$('#bHow').addEventListener('click', () => { buildHow(); $('#how').hidden = false })
$('#howClose').addEventListener('click', () => { $('#how').hidden = true })
$('#bLang').addEventListener('click', () => { lang = lang === 'ja' ? 'en' : 'ja'; try { localStorage.setItem('dpl_lang', lang) } catch (e) {} buildTitle(); buildHow(); if (G.mode === 'end') renderEnd(); else { G.stickers = G.mode === 'title' ? buildStage(0) : G.stickers } })
$('#bMute').addEventListener('click', () => { Snd.init(); toggleMute() })
$('#bAgain').addEventListener('click', () => { Snd.init(); sfx('pull', { vol: 0.7 }); startGame() })
$('#bSave').addEventListener('click', saveCard)
$('#bPost').addEventListener('click', postX)
addEventListener('resize', () => { layout(); if (G.mode === 'end') renderEnd() })
document.addEventListener('visibilitychange', () => { if (!document.hidden) last = performance.now() })

// ---------------------------------------------------------------- 時計（固定60Hz）
let acc = 0, last = performance.now(), paused = false
function frame() {
  const now = performance.now()
  let d = (now - last) / 1000; last = now
  if (d > 0.25) d = 0.25
  if (!paused) { acc += d; while (acc >= STEP) { update(STEP); acc -= STEP } }
  render()
  requestAnimationFrame(frame)
}

// ---------------------------------------------------------------- 検証用の窓口
window.dpl = {
  G, DATA, bot, inputDown, inputMove, inputUp, startGame, setupStage, finish: () => finish(), snap, drawCard: () => drawCard(), groupFrom, pickAt, hintGeo, toWorld,
  seed: n => { seed = n % 2147483646 + 1 },
  // 画面座標（CSS px）
  toScreen: (x, y) => [x * S, y * S],
  hintXY: () => G.stickers.filter(s => !s.done && s.fresh && !s.pg).map(s => { const hg = hintGeo(s); if (!hg) return null; const p = toWorld(s, hg.p[0], hg.p[1]), c = toWorld(s, 0, 0), q = toWorld(s, hg.p[0] * 0.92, hg.p[1] * 0.92); return { id: s.id, kind: s.kind, z: s.z, x: p[0] * S, y: p[1] * S, cx: c[0] * S, cy: c[1] * S, stack: groupFrom(s).length, covered: G.stickers.some(o => !o.done && o.z > s.z && worldIn(o, q[0], q[1])) } }).filter(Boolean),
  state: () => ({ mode: G.mode, st: G.st, focus: +G.focus.toFixed(3), clock: Math.round(G.clock), left: G.stickers.filter(s => !s.done).length, active: !!G.active, jolt: G.jolt && { type: G.jolt.type, phase: G.jolt.phase }, stats: { ...G.stats }, log: G.log.length, says: sayCount(), ratio: G.active ? +(G.active.ratio || 0).toFixed(2) : 0, stress: G.active ? +G.active.stress.toFixed(2) : 0 }),
  layout,
  dbg: { pause: on => { paused = !!on; last = performance.now(); acc = 0 }, step: n => { for (let i = 0; i < (n || 1); i++) update(STEP); render() } },
}

// ---------------------------------------------------------------- 起動（ロード画面は本物の読み込み数で進む。12秒で必ず消す）
G.rare = { half2: false, ufo: -1 }
layout()
buildTitle(); buildHow(); setMuteIcons()
show('vTitle')
requestAnimationFrame(frame)
// 実機・シミュレーターで通しを見るための口（?autoplay=human&mute=1）。音は出さない
function autoplay() {
  const q = new URLSearchParams(location.search)
  if (q.get('mute') === '1') Snd.setMute(true)
  const st = q.get('autoplay'); if (!st) return
  Snd.setMute(true); startGame(); Object.assign(bot, { on: true, style: st, st: 'think', t: 0.8, x: W / 2, y: H * 0.8 })
}
;(function boot() {
  const jobs = []
  if (document.fonts && document.fonts.load) {
    jobs.push(document.fonts.load('20px "Yusei Magic"', '明日締切なのにはがさないでほらねシールをめくっています'))
    jobs.push(document.fonts.load('900 20px "Zen Kaku Gothic New"', 'シール剥がしが止まらない半額2割引498円ガス点検済'))
    jobs.push(document.fonts.load('700 20px "Zen Kaku Gothic New"', '企画書'))
    jobs.push(document.fonts.load('60px "Zen Antique"', 'はなまる湯ゆ'))
  }
  let done = 0
  const bar = $('#loadBar i'), total = jobs.length + 1
  const step = () => { done++; bar.style.width = Math.round(done / total * 100) + '%' }
  step()
  $('#loadTx').textContent = T().loading
  const cap = new Promise(r => setTimeout(r, 4000))
  Promise.race([Promise.all(jobs.map(j => j.then(step, step))), cap]).then(() => {
    bar.style.width = '100%'
    G.stickers = buildStage(0)   // 文字の形はフォントが来てから作る
    const l = $('#loading'); l.style.opacity = '0'
    setTimeout(() => { l.hidden = true; window.__dplReady = true; autoplay() }, 250)
  })
  setTimeout(() => { const l = $('#loading'); if (!l.hidden) { l.hidden = true; if (!G.stickers.length) G.stickers = buildStage(0); window.__dplReady = true } }, 12000)
})()
