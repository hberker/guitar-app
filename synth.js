/**
 * Plucked-string synthesis (Karplus-Strong): a noise burst circulates
 * through a delay line with averaging, which decays it into a convincingly
 * guitar-like tone. Used for ear-training cues so the player matches
 * timbre-to-timbre rather than hunting a sine beep.
 *
 * window.GuitarSynth.playNotes([{midi, at, dur}, ...]) schedules a phrase
 * and returns its total length in milliseconds so callers can suppress
 * mic matching until the cue (plus speaker ring-out) has finished.
 */
(function () {
  'use strict';

  const A4 = 440;
  const midiToFreq = (m) => A4 * Math.pow(2, (m - 69) / 12);

  let ctx = null;
  function ensureCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function pluckBuffer(ac, freq, seconds) {
    const sr = ac.sampleRate;
    const n = Math.max(2, Math.round(sr / freq));
    const len = Math.floor(sr * seconds);
    const buf = ac.createBuffer(1, len, sr);
    const out = buf.getChannelData(0);
    const ring = new Float32Array(n);
    for (let i = 0; i < n; i++) ring[i] = Math.random() * 2 - 1;
    let idx = 0;
    for (let i = 0; i < len; i++) {
      const cur = ring[idx];
      const nxt = ring[(idx + 1) % n];
      out[i] = cur;
      ring[idx] = 0.996 * 0.5 * (cur + nxt);
      idx = (idx + 1) % n;
    }
    return buf;
  }

  function playNotes(notes) {
    const ac = ensureCtx();
    const t0 = ac.currentTime + 0.05;
    let end = 0;
    notes.forEach(({ midi, at = 0, dur = 1.2 }) => {
      const src = ac.createBufferSource();
      src.buffer = pluckBuffer(ac, midiToFreq(midi), dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.55, t0 + at);
      g.gain.setTargetAtTime(0, t0 + at + dur - 0.15, 0.05);
      src.connect(g).connect(ac.destination);
      src.start(t0 + at);
      end = Math.max(end, at + dur);
    });
    return end * 1000 + 150;
  }

  // ---- metronome ----
  // Clicks are scheduled on the AudioContext clock (sample-accurate); a
  // parallel performance.now() anchor lets the app measure how far each
  // played note lands from the beat grid.
  let clickTimer = null;
  let clickState = null;

  function clickSound(ac, t, accent) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.frequency.value = accent ? 1800 : 1200;
    g.gain.setValueAtTime(accent ? 0.4 : 0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    osc.connect(g).connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  function startClick(bpm) {
    const ac = ensureCtx();
    stopClick();
    const interval = 60 / bpm;
    let nextBeat = ac.currentTime + 0.15;
    let beat = 0;
    clickState = {
      bpm,
      intervalMs: interval * 1000,
      t0Perf: performance.now() + (nextBeat - ac.currentTime) * 1000,
    };
    clickTimer = setInterval(() => {
      while (nextBeat < ac.currentTime + 0.2) {
        clickSound(ac, nextBeat, beat % 4 === 0);
        beat++;
        nextBeat += interval;
      }
    }, 40);
  }

  function stopClick() {
    if (clickTimer) clearInterval(clickTimer);
    clickTimer = null;
    clickState = null;
  }

  function clickInfo() {
    return clickState ? { ...clickState } : null;
  }

  window.GuitarSynth = { playNotes, midiToFreq, startClick, stopClick, clickInfo };
})();
