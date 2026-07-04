/**
 * Monophonic pitch detection via autocorrelation (ACF2+ style:
 * trim low-amplitude edges, autocorrelate, skip the zero-lag hump,
 * refine the peak with parabolic interpolation).
 *
 * Returns { freq, rms } — freq is -1 when no confident pitch is found.
 * Handles the guitar range (low E2 ≈ 82 Hz and up) with a 2048-sample
 * buffer at typical 44.1/48 kHz sample rates.
 */
(function () {
  'use strict';

  const MIN_RMS = 0.008;        // gate: ignore room noise / silence
  const CLARITY_MIN = 0.5;      // normalized peak height required

  function detectPitch(buf, sampleRate) {
    let size = buf.length;

    let rms = 0;
    for (let i = 0; i < size; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / size);
    if (rms < MIN_RMS) return { freq: -1, rms };

    // Trim leading/trailing low-signal edges to sharpen the correlation.
    const thres = 0.2;
    let r1 = 0, r2 = size - 1;
    for (let i = 0; i < size / 2; i++) {
      if (Math.abs(buf[i]) < thres) { r1 = i; break; }
    }
    for (let i = 1; i < size / 2; i++) {
      if (Math.abs(buf[size - i]) < thres) { r2 = size - i; break; }
    }
    buf = buf.slice(r1, r2);
    size = buf.length;
    if (size < 128) return { freq: -1, rms };

    const c = new Float32Array(size);
    for (let lag = 0; lag < size; lag++) {
      let sum = 0;
      for (let i = 0; i < size - lag; i++) sum += buf[i] * buf[i + lag];
      c[lag] = sum;
    }

    // Walk past the zero-lag peak, then find the global max after it.
    let d = 0;
    while (d + 1 < size && c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < size; i++) {
      if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
    }
    if (maxpos <= 0 || c[0] === 0 || maxval / c[0] < CLARITY_MIN) {
      return { freq: -1, rms };
    }

    let T0 = maxpos;
    const x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1] || x2;
    const a = (x1 + x3 - 2 * x2) / 2;
    const b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);

    const freq = sampleRate / T0;
    if (freq < 60 || freq > 2000) return { freq: -1, rms };
    return { freq, rms };
  }

  window.detectPitch = detectPitch;
})();
