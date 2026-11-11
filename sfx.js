// 音のエンジン（録音素材を鳴らす）。効果音・環境音・BGM は全部ファイル。合成音で効果音を作らない
// 素材は ~/Desktop/claudecode/_assets/audio/CATALOG.md から選び、ゲームの snd/ に mp3 でコピーする（node ~/Desktop/claudecode/_assets/_tools/pick.mjs）
// 使い方:
//   Snd.def({ door: ['snd/door1.mp3','snd/door2.mp3'], ding: 'snd/ding.mp3', ... })  起動時に1回
//   最初のタップで Snd.init()  （iOS は操作の中でしか鳴らない）
//   Snd.play('door', { vol: 0.8, rate: 1, jitter: 0.06, dest: 'muf' })  差分からランダム・同じ物を連続で選ばない・ピッチを少し揺らす
//   Snd.loop('amb', 'snd/elevator_hum.mp3', 0.25)  環境音・BGM（同じ名前で呼ぶと差し替え、null で止める）
//   Snd.duck(0.4, 1.2)  見せ場の間だけ BGM と環境音を下げる
//   検証は Snd.played（鳴らした回数）と Snd.level()、ページを離れた時は Snd.away と Snd.life（止めた/戻した回数）
// ページを離れる・裏に回る（pagehide / visibilitychange hidden / freeze）と、BGM と環境音を止めて AudioContext を suspend する。
// 戻ってきても（bfcache の pageshow を含む）勝手に鳴らさない。次に本人が画面に触った時だけ鳴らし直す
// （2026-11-11 練り消し: 横丁に戻っても iPhone で BGM が鳴り続けた。止める処理が無かった）
const Snd = {
  ctx: null, muted: false, files: {}, bufs: {}, last: {}, played: {}, loops: {}, away: false, life: { hide: 0, wake: 0 },
  def(map) { for (const k in map) this.files[k] = [].concat(map[k]); if (this.ctx) this.load() },
  init() {
    if (this.ctx) { if (this.away) this.wake(); else if (this.ctx.state === 'suspended') this.ctx.resume(); return }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return
    try {
      const c = this.ctx = new AC()
      this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.9
      this.an = c.createAnalyser(); this.an.fftSize = 2048; this.master.connect(this.an); this.an.connect(c.destination)
      this.sfxBus = c.createGain(); this.sfxBus.connect(this.master)
      this.world = c.createBiquadFilter(); this.world.type = 'lowpass'; this.world.frequency.value = 18000; this.world.Q.value = 0.5; this.world.connect(this.master)   // 外の世界の音（集中しているほどこもる）
      this.bed = c.createGain(); this.bed.gain.value = 1; this.bed.connect(this.world)   // 環境音（duck で下げる）
      this.music = c.createGain(); this.music.gain.value = 1; this.music.connect(this.master)   // BGM（こもらせない）
      // こもらせる道（壁の向こう・ほかの音にかき消された時）
      this.muf = c.createBiquadFilter(); this.muf.type = 'lowpass'; this.muf.frequency.value = 420; this.muf.connect(this.sfxBus)
      // 部屋の響き（短い残響。部屋の広さで秒数を変える）
      this.room = c.createConvolver(); this.room.buffer = this.ir(0.35); const rw = c.createGain(); rw.gain.value = 0.5; this.room.connect(rw); rw.connect(this.sfxBus)
      this.load()
    } catch (e) { this.ctx = null }
  },
  ir(sec) { const c = this.ctx, n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3) } return b },
  async load() {
    const urls = new Set(Object.values(this.files).flat().concat(Object.values(this.loops).filter(Boolean).map(l => l.url)))
    await Promise.all([...urls].filter(u => u && !this.bufs[u]).map(async u => {
      this.bufs[u] = 'loading'
      try { const ab = await (await fetch(u)).arrayBuffer(); this.bufs[u] = await new Promise((ok, ng) => this.ctx.decodeAudioData(ab, ok, ng)) } catch (e) { delete this.bufs[u] }   // 古い Safari はコールバック形しか無い
    }))
  },
  setMute(m) { this.muted = m; if (this.master) this.master.gain.value = m || this.away ? 0 : 0.9 },
  // ページを離れる時: ループを全部止め（何を鳴らしていたかは覚える）、スピーカー手前を0にして suspend
  sleep() {
    if (this.away) return; this.away = true; this.life.hide++
    const c = this.ctx; if (!c) return
    try { this.master.gain.cancelScheduledValues(c.currentTime); this.master.gain.value = 0 } catch (e) {}
    for (const k in this.loops) { const l = this.loops[k]; if (l && l.node) { try { l.node.stop() } catch (e) {} this.loops[k] = { url: l.url, vol: l.g ? Math.max(0.0001, l.g.gain.value) : l.vol, bus: l.bus } } }
    const d = this.dr; if (d && d.s) { try { d.s.stop() } catch (e) {} d.s = null }   // 剥がす音も止める
    try { c.suspend() } catch (e) {}
  },
  // 戻ってきて本人が触った時だけ: 覚えていたループを鳴らし直す
  wake() {
    if (!this.away) return; this.away = false; this.life.wake++
    const c = this.ctx; if (!c) return
    if (c.state !== 'running') { try { c.resume() } catch (e) {} }
    this.master.gain.value = this.muted ? 0 : 0.9
    for (const k in this.loops) { const l = this.loops[k]; if (l && !l.node) { this.loops[k] = null; this.loop(k, l.url, l.vol, 0.4, l.bus) } }
    if (this.dr && !this.dr.s) this.dr.start()
  },
  playing() { return Object.keys(this.loops).filter(k => this.loops[k] && this.loops[k].node) },
  now() { return this.ctx ? this.ctx.currentTime : 0 },
  pick(name) { const a = this.files[name]; if (!a || !a.length) return null; if (a.length === 1) return a[0]; let i; do { i = Math.floor(Math.random() * a.length) } while (a.length > 1 && a[i] === this.last[name]); this.last[name] = a[i]; return a[i] },
  play(name, o = {}) {
    this.played[name] = (this.played[name] || 0) + 1
    if (!this.ctx || this.away) return null; const url = o.url || this.pick(name), buf = this.bufs[url]
    if (!buf || buf === 'loading') { if (!this.bufs[url]) this.load(); return null }
    const c = this.ctx, s = c.createBufferSource(), g = c.createGain(), t = c.currentTime + (o.delay || 0)
    s.buffer = buf; const j = o.jitter == null ? 0.05 : o.jitter; s.playbackRate.value = (o.rate || 1) * (1 + (Math.random() * 2 - 1) * j)
    g.gain.value = o.vol == null ? 1 : o.vol
    s.connect(g); const d = o.dest === 'muf' ? this.muf : o.dest === 'world' ? this.world : this.sfxBus; g.connect(d); if (o.room) { const rg = c.createGain(); rg.gain.value = o.room; g.connect(rg); rg.connect(this.room) }
    s.start(t, o.offset || 0); return s
  },
  loop(slot, url, vol = 0.3, fade = 0.6, bus) {
    if (url) this.played['loop:' + slot + ':req'] = (this.played['loop:' + slot + ':req'] || 0) + 1
    const old = this.loops[slot]; this.loops[slot] = url ? { url, vol, bus } : null
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime
    if (old && old.node) { old.g.gain.cancelScheduledValues(t); old.g.gain.setValueAtTime(old.g.gain.value, t); old.g.gain.linearRampToValueAtTime(0.0001, t + fade); old.node.stop(t + fade + 0.05) }
    if (!url || this.away) return   // 離れている間は覚えるだけ。wake で鳴らす
    const start = () => {
      const buf = this.bufs[url]; if (!buf || buf === 'loading') return setTimeout(start, 120)
      if (this.away || !this.loops[slot] || this.loops[slot].url !== url || this.loops[slot].node) return
      const s = c.createBufferSource(), g = c.createGain(); s.buffer = buf; s.loop = true; g.gain.setValueAtTime(0.0001, c.currentTime); g.gain.linearRampToValueAtTime(vol, c.currentTime + fade)
      s.connect(g); g.connect(bus === 'music' ? this.music : this.bed); s.start(); this.loops[slot] = { url, vol, bus, node: s, g }; this.played['loop:' + slot] = (this.played['loop:' + slot] || 0) + 1
    }
    if (!this.bufs[url]) this.load(); start()
  },
  // 剥がしているあいだ鳴り続ける音（音量と速さを毎コマ変える）
  drone(url) {
    if (!this.ctx) return null
    if (this.dr && this.dr.url === url) return this.dr
    const c = this.ctx, g = c.createGain(); g.gain.value = 0; g.connect(this.sfxBus)
    const d = this.dr = { url, g, s: null, rate: 1 }
    const start = d.start = () => { if (this.away || this.dr !== d || d.s) return; const b = this.bufs[url]; if (!b || b === 'loading') { if (!this.bufs[url]) this.load(); return setTimeout(start, 150) } const s = c.createBufferSource(); s.buffer = b; s.loop = true; s.connect(g); s.start(); d.s = s }
    if (!this.bufs[url]) { this.files['_drone'] = [url]; this.load() } start()
    return d
  },
  droneSet(vol, rate) { const d = this.dr; if (!d || !this.ctx) return; const t = this.ctx.currentTime; d.g.gain.setTargetAtTime(vol, t, 0.03); if (d.s) d.s.playbackRate.setTargetAtTime(rate, t, 0.05); this.droneVol = vol },
  setWorld(freq) { if (this.world) this.world.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.12) },
  // テープが止まるように BGM を落とす
  stopMusic(slot, sec = 0.9) { const l = this.loops[slot]; if (!l || !l.node || !this.ctx) { this.loops[slot] = null; return } const t = this.ctx.currentTime; l.node.playbackRate.setValueAtTime(1, t); l.node.playbackRate.linearRampToValueAtTime(0.25, t + sec); l.g.gain.setValueAtTime(l.g.gain.value, t); l.g.gain.linearRampToValueAtTime(0.0001, t + sec); l.node.stop(t + sec + 0.05); this.loops[slot] = null },
  duck(to = 0.4, sec = 1) { if (!this.ctx) return; const g = this.bed.gain, t = this.ctx.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(to, t + 0.08); g.linearRampToValueAtTime(1, t + sec) },
  level() { if (!this.an) return 0; const d = new Float32Array(this.an.fftSize); this.an.getFloatTimeDomainData(d); let m = 0; for (const v of d) m = Math.max(m, Math.abs(v)); return m },
}
;(() => {
  const hide = () => Snd.sleep()
  addEventListener('pagehide', hide)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') hide() })
  document.addEventListener('freeze', hide)
  const touch = () => { if (Snd.away && document.visibilityState === 'visible') Snd.wake() }
  for (const n of ['pointerdown', 'touchend', 'keydown']) addEventListener(n, touch, true)
})()
