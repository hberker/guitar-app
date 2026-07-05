---
name: verify
description: Build/launch/drive recipe for verifying changes to this static guitar-trainer web app at its real surface (browser + mic).
---

# Verifying guitar-app changes

Static site, no build step. Serve the repo root and drive it in headless
Chromium with a fake mic.

## Launch

```bash
python3 -m http.server 8788 &        # from the repo root
```

Playwright (`executablePath: '/opt/pw-browsers/chromium'` if the npm browser
download is skipped) with these flags — they grant mic permission and provide
a fake audio device so `getUserMedia` succeeds headlessly:

```
--use-fake-ui-for-media-stream
--use-fake-device-for-media-stream
--autoplay-policy=no-user-gesture-required
```

Also pass `permissions: ['microphone']` on the browser context.

## Simulating pitch input

The fake mic device won't produce guitar notes. `app.js` reads pitch via
`window.detectPitch(buf, sampleRate)` (defined in `pitch.js`), called every
animation frame — override it after page load to feed any pitch you want:

```js
await page.evaluate(() => { window.detectPitch = () => ({ freq: 440, rms: 0.3 }); });
```

## Driving

- Mode tabs: `#tab-note`, `#tab-scale`, `#tab-ear`, `#tab-phrase`, `#tab-bend`.
- `#startBtn` starts the session (this is what requests the mic and starts `tick()`).
- `#repeatBtn` replays the current prompt/cue; `#hintBtn`, `#skipBtn`, `#stopBtn`.
- Tuner readout to observe: `#heardNote`, `#heardCents`, `#centsNeedle` (`.hidden`).
- Ear-mode cue (easy level) takes ~3s + 250ms ring-out + 400ms grace before
  scoring/readout go live — sample the DOM on an interval to see phases.

## Gotchas

- `tick()` runs on requestAnimationFrame; a DOM sample taken in the same
  event-loop turn as a click sees the previous frame's state.
- Voice prompts use `speechSynthesis`; headless Linux has no TTS engine, so
  uncheck `#voiceOn` when testing note/scale/bend flows.
