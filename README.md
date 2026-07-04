# 🎸 Fretboard Trainer

A zero-dependency web app for practicing guitar *through the guitar*: every
drill shows or plays a prompt, listens through your microphone, and advances
automatically when it hears you play the right thing. Five modes.

## Modes

### 1 · Single notes
The app shows **and speaks** a string + note (e.g. *String 5 · A — play C4*).
Find it, play it, hold it for a fraction of a second, and it logs your time
and moves on. **Focus mode** weights prompts toward the notes you're
historically slowest at or skip most.

### 2 · Scale runs
You get a scale, a starting string + fret, and **which finger plays the
root** (1st/2nd/4th — this forces the different positions of each shape).
Play up to the octave; progress chips light as notes land. Wrong notes count
as mistakes but never reset the run. Scales: major, natural minor,
major/minor pentatonic, blues, plus **major/minor/dom7 arpeggios**.
**Descending runs** (start at the octave, walk down) mix in via a settings
toggle.

**Rhythm layer:** turn on the metronome in settings and every run is scored
against the click — each note's onset is measured against the nearest beat,
the run gets an **on-beat %**, and with auto-ramp enabled a perfect run
(every note on the beat, no mistakes, no skips) bumps the tempo +5 BPM.
Call & response gets the same treatment, with the cue itself played one
note per beat.

### 3 · Ear training
The app **plays** a note (Karplus-Strong plucked-string synthesis, so it
sounds like a guitar, not a beep) and you hunt it down by ear. Difficulty
ladder: **Easy** plays your open string as a reference first and names the
string (you're judging the interval); **Medium** names the string only;
**Hard** is any string, exact octave. Every stably-heard wrong pitch counts
as an attempt, and the history builds a **miss-pattern table by interval**
("you overshoot 4ths to 5ths") — the actionable ear-training stat.
**Use headphones** so the mic doesn't hear the cue.

### 4 · Call & response
The app plays a short phrase (2–5 notes, configurable) drawn from a scale,
anchored at a named string/fret — you play it back note for note. Mistakes
are counted, never resetting the phrase. This is transcription muscle:
single notes → intervals → phrases.

### 5 · Bends & holds
The most guitar-native drill. **Bend** prompts: fret the start note, then
bend up a half or whole step and *hold* the target pitch — wobbling through
it doesn't count, and the meter is the game. **Hold** prompts: keep a note
within ±20¢ for 3 seconds (re-pick as it decays). Trains bend intonation
and finger stability in a way no theory app can.

### 6 · Daily workout
One button chains the drills into a fixed circuit (8 notes → 2 runs → 5 ear
prompts → 2 phrases → 3 bends) with a **summary at the end comparing your
averages against your previous workout**, and a day-streak counter on the
home screen. Skips advance the circuit too, so a prompt the mic can't hear
never strands you.

## Shared machinery

- **Pitch detection** in pure JavaScript: autocorrelation with parabolic
  interpolation, accurate to ~1 cent across the guitar range. No libraries,
  no build step, no server.
- Tuner-style **cents meter** + signal bar showing exactly what the mic hears.
- **Skip** (`S`/`→`) everywhere, logged separately, never counts against
  times. **Hint** (`H`) reveals answers. **Repeat** (`R`) re-speaks or
  re-plays the cue. **New run/phrase** (`N`).
- Cue **speaker-leak suppression**: matching pauses while the app itself is
  playing audio, so it can't hear its own cues and self-validate.
- Metrics per mode (times, mistakes, attempts, miss patterns, on-beat %,
  per-string averages) persisted in `localStorage`.
- **Fretboard heatmap**: the neck drawn as a grid, each position colored by
  your average find-time — weak zones at a glance (single-notes history).
- Fret range up to **22** (default 15), string and scale selection,
  octave-strict toggle, light/dark themes.

## Running it

Microphone access requires a **secure context** (HTTPS or `localhost`), so
`file://` won't work. From the repo directory run any static server:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Or enable **GitHub Pages** for this repo (Settings → Pages → deploy from
`main`, root) and practice from any device at the published URL.

## Tips for good detection

- Guitar volume up, room noise down. A direct signal (interface/amp mic'd
  close) locks on faster than an unplugged electric.
- Headphones for ear-training and call-&-response modes.
- Let notes ring cleanly — mutes and dead notes read as noise.
- The app expects **standard tuning E-A-D-G-B-E at A4 = 440 Hz**. If you're
  tuned down, everything will read flat.

## Project layout

| File | Purpose |
|---|---|
| `index.html` | Markup: mode tabs, prompt blocks, tuner meter, stats, settings |
| `style.css`  | Styling, light/dark themes |
| `pitch.js`   | Autocorrelation pitch detector (`window.detectPitch`) |
| `synth.js`   | Karplus-Strong plucked-string synth + metronome (`window.GuitarSynth`) |
| `app.js`     | Game loop, all modes, workout circuit, matching, metrics, heatmap |
