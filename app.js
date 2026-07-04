(function () {
  'use strict';

  // ===================== Music theory =====================
  const A4 = 440;
  const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  const NOTE_SPEECH = ['C', 'C sharp', 'D', 'D sharp', 'E', 'F', 'F sharp', 'G',
                       'G sharp', 'A', 'A sharp', 'B'];
  const INTERVAL_NAMES = ['octave', 'minor 2nd', 'major 2nd', 'minor 3rd', 'major 3rd',
                          'perfect 4th', 'tritone', 'perfect 5th', 'minor 6th',
                          'major 6th', 'minor 7th', 'major 7th'];
  // Standard tuning, string number -> open-string MIDI note.
  const STRINGS = {
    6: { label: 'Low E', speech: 'six, the low E string', midi: 40 },
    5: { label: 'A',     speech: 'five, the A string',    midi: 45 },
    4: { label: 'D',     speech: 'four, the D string',    midi: 50 },
    3: { label: 'G',     speech: 'three, the G string',   midi: 55 },
    2: { label: 'B',     speech: 'two, the B string',     midi: 59 },
    1: { label: 'High E', speech: 'one, the high E string', midi: 64 },
  };

  // Scale steps in semitones from the root, up to and including the octave.
  const SCALES = {
    minPent: { label: 'Minor Pentatonic', speech: 'minor pentatonic', steps: [0, 3, 5, 7, 10, 12] },
    majPent: { label: 'Major Pentatonic', speech: 'major pentatonic', steps: [0, 2, 4, 7, 9, 12] },
    major:   { label: 'Major',            speech: 'major',            steps: [0, 2, 4, 5, 7, 9, 11, 12] },
    minor:   { label: 'Natural Minor',    speech: 'natural minor',    steps: [0, 2, 3, 5, 7, 8, 10, 12] },
    blues:   { label: 'Blues',            speech: 'blues',            steps: [0, 3, 5, 6, 7, 10, 12] },
    majArp:  { label: 'Major Arpeggio',   speech: 'major arpeggio',   steps: [0, 4, 7, 12] },
    minArp:  { label: 'Minor Arpeggio',   speech: 'minor arpeggio',   steps: [0, 3, 7, 12] },
    dom7Arp: { label: 'Dom7 Arpeggio',    speech: 'dominant seven arpeggio', steps: [0, 4, 7, 10, 12] },
  };

  // Which finger frets the root note in scale runs; the finger dictates the
  // position/shape the player has to use.
  const FINGERS = [
    { label: '1st finger', speech: 'first finger', offset: 0 },
    { label: '2nd finger', speech: 'second finger', offset: 1 },
    { label: '4th finger', speech: 'fourth finger', offset: 3 },
  ];

  const midiToName = (m) => NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
  const freqToMidiFloat = (f) => 69 + 12 * Math.log2(f / A4);

  // ===================== Matching rules =====================
  const CENTS_TOLERANCE = 25;     // how far off a frame can be and still count
  const FRAMES_TO_CONFIRM = 5;    // consecutive matching frames required (~80ms)
  const GRACE_MS = 400;           // ignore audio right after a prompt (ring-over)
  const BEND_HOLD_MS = 400;       // how long a bend must sit on the target pitch
  const SUSTAIN_HOLD_MS = 3000;   // how long a sustain prompt must stay in tune
  const HOLD_CENTS = 20;          // tighter window for bend targets / sustains
  // "On the beat" = within this of the click, but never more than 30% of the
  // beat interval (150ms is meaningless at 200 BPM where beats are 300ms apart).
  const beatWindow = (intervalMs) => Math.min(150, intervalMs * 0.3);

  // ===================== DOM =====================
  const els = {};
  ['idleView', 'activeView', 'startBtn', 'stopBtn', 'skipBtn', 'newBtn', 'hintBtn',
   'repeatBtn', 'idleText', 'heardNote', 'heardCents', 'centsNeedle', 'signalFill',
   'flash', 'resetStatsBtn', 'maxFret', 'maxFretVal', 'voiceOn', 'adaptiveOn',
   'octaveStrict', 'earLevel', 'phraseLen', 'phraseLenVal', 'tilesLabel', 'tilesRow',
   'historyContainer', 'workoutBtn', 'streakLine', 'workoutLine', 'beatDot',
   'workoutSummary', 'summaryBody', 'summaryClose', 'descendOn', 'timedOn', 'rampOn',
   'bpm', 'bpmVal',
   'noteBlock', 'promptString', 'promptNote', 'promptHint', 'noteTimer',
   'scaleBlock', 'scaleWhere', 'scaleName', 'scaleTimer', 'runDots',
   'earBlock', 'earWhere', 'earNote', 'earHint', 'earTimer', 'earStatus',
   'phraseBlock', 'phraseWhere', 'phraseName', 'phraseTimer', 'phraseDots', 'phraseStatus',
   'bendBlock', 'bendWhere', 'bendTask', 'bendPhase', 'bendTimer', 'bendProgress']
    .forEach((id) => { els[id] = document.getElementById(id); });
  const stringChecks = Array.from(document.querySelectorAll('[data-string]'));
  const scaleChecks = Array.from(document.querySelectorAll('[data-scale]'));

  const MODE_UI = {
    note: {
      block: 'noteBlock', hint: true, newLabel: null, skipLabel: '⏭ Skip',
      idle: 'Plug in or mic up your guitar, then start a session.<br>Your browser will ask for microphone access.',
    },
    scale: {
      block: 'scaleBlock', hint: false, newLabel: '⏭⏭ New run', skipLabel: '⏭ Skip note',
      idle: 'Scale runs: you get a scale, a starting string, a fret, and which finger<br>plays the root — then play the scale up to the octave, note by note.',
    },
    ear: {
      block: 'earBlock', hint: true, newLabel: null, skipLabel: '⏭ Skip',
      idle: 'Ear training: the app <em>plays</em> a note — find it on your guitar by ear.<br>Use headphones so the mic doesn\'t hear the cue.',
    },
    phrase: {
      block: 'phraseBlock', hint: false, newLabel: '⏭⏭ New phrase', skipLabel: '⏭ Skip note',
      idle: 'Call &amp; response: the app plays a short phrase — play it back note for note.<br>Use headphones so the mic doesn\'t hear the cue.',
    },
    bend: {
      block: 'bendBlock', hint: false, newLabel: null, skipLabel: '⏭ Skip',
      idle: 'Bends &amp; holds: bend up to a target pitch and hold it, or sustain a<br>note dead in tune. The cents meter is the game.',
    },
  };

  // ===================== State =====================
  let audioCtx = null;
  let analyser = null;
  let micStream = null;
  let rafId = null;
  let lastTickAt = 0;

  let mode = 'note';
  let running = false;
  let advancing = false;      // true while flashing success before next prompt
  let cueUntil = 0;           // suppress matching while a synth cue is audible

  let prompt = null;          // note mode: { string, fret, midi }
  let promptStartedAt = 0;
  let matchStreak = 0;

  let run = null;             // scale mode
  let ear = null;             // ear mode: { string|null, fret, midi, refMidi|null, attempts, offsets[], hinted }
  let phrase = null;          // phrase mode: { scaleKey, rootMidi, startString, startFret, notes[], idx, mistakes }
  let bend = null;            // bend mode: { kind:'bend'|'hold', string, fret, startMidi, targetMidi, amount, phase, holdMs }
  let stable = { midi: null, count: 0 };

  // Daily workout: a fixed circuit through the modes with an end-of-session
  // summary compared against the previous workout.
  const DEFAULT_WORKOUT_PLAN = [
    { mode: 'note', count: 8, label: 'Single notes' },
    { mode: 'scale', count: 2, label: 'Scale runs' },
    { mode: 'ear', count: 5, label: 'Ear training' },
    { mode: 'phrase', count: 2, label: 'Call & response' },
    { mode: 'bend', count: 3, label: 'Bends & holds' },
  ];
  let workoutPlan = DEFAULT_WORKOUT_PLAN;
  let workout = null;          // { step, remaining, finished, results: {mode: [{ms}]} }

  const session = {
    note: { hits: 0, skips: 0, times: [] },
    scale: { runs: 0, times: [], mistakes: 0 },
    ear: { found: 0, skips: 0, times: [], attempts: 0 },
    phrase: { done: 0, times: [], mistakes: 0 },
    bend: { done: 0, times: [] },
  };

  // ===================== Persistence =====================
  const SETTINGS_KEY = 'fretboard-trainer-settings';
  const KEYS = {
    note: 'fretboard-trainer-history',
    scale: 'fretboard-trainer-scale-history',
    ear: 'fretboard-trainer-ear-history',
    phrase: 'fretboard-trainer-phrase-history',
    bend: 'fretboard-trainer-bend-history',
  };
  const WORKOUTS_KEY = 'fretboard-trainer-workouts';

  function loadSettings() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (e) { /* fresh start */ }
    if (s.maxFret) els.maxFret.value = s.maxFret;
    if (s.earLevel) els.earLevel.value = s.earLevel;
    if (s.phraseLen) els.phraseLen.value = s.phraseLen;
    if (s.bpm) els.bpm.value = s.bpm;
    if (typeof s.voiceOn === 'boolean') els.voiceOn.checked = s.voiceOn;
    if (typeof s.adaptiveOn === 'boolean') els.adaptiveOn.checked = s.adaptiveOn;
    if (typeof s.octaveStrict === 'boolean') els.octaveStrict.checked = s.octaveStrict;
    if (typeof s.descendOn === 'boolean') els.descendOn.checked = s.descendOn;
    if (typeof s.timedOn === 'boolean') els.timedOn.checked = s.timedOn;
    if (typeof s.rampOn === 'boolean') els.rampOn.checked = s.rampOn;
    if (Array.isArray(s.strings)) {
      stringChecks.forEach((c) => { c.checked = s.strings.includes(+c.dataset.string); });
    }
    if (Array.isArray(s.scales)) {
      scaleChecks.forEach((c) => { c.checked = s.scales.includes(c.dataset.scale); });
    }
    els.maxFretVal.textContent = els.maxFret.value;
    els.phraseLenVal.textContent = els.phraseLen.value;
    els.bpmVal.textContent = els.bpm.value;
    setMode(MODE_UI[s.mode] ? s.mode : 'note');
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      mode,
      maxFret: +els.maxFret.value,
      earLevel: els.earLevel.value,
      phraseLen: +els.phraseLen.value,
      bpm: +els.bpm.value,
      voiceOn: els.voiceOn.checked,
      adaptiveOn: els.adaptiveOn.checked,
      octaveStrict: els.octaveStrict.checked,
      descendOn: els.descendOn.checked,
      timedOn: els.timedOn.checked,
      rampOn: els.rampOn.checked,
      strings: stringChecks.filter((c) => c.checked).map((c) => +c.dataset.string),
      scales: scaleChecks.filter((c) => c.checked).map((c) => c.dataset.scale),
    }));
  }

  function loadJson(key) {
    try { return JSON.parse(localStorage.getItem(key)) || []; } catch (e) { return []; }
  }
  function pushJson(key, entry) {
    const h = loadJson(key);
    h.push(entry);
    if (h.length > 500) h.splice(0, h.length - 500);
    localStorage.setItem(key, JSON.stringify(h));
  }

  // ===================== Mode switching =====================
  function setMode(m, deferPrompt) {
    mode = m;
    Object.keys(MODE_UI).forEach((k) => {
      document.getElementById('tab-' + k).classList.toggle('active', k === m);
      els[MODE_UI[k].block].hidden = k !== m;
    });
    const ui = MODE_UI[m];
    els.skipBtn.textContent = ui.skipLabel;
    els.newBtn.hidden = !ui.newLabel;
    if (ui.newLabel) els.newBtn.textContent = ui.newLabel;
    els.hintBtn.hidden = !ui.hint;
    els.idleText.innerHTML = ui.idle;
    if (m !== 'scale' && m !== 'phrase') window.GuitarSynth.stopClick();
    renderStats();
    if (running && !deferPrompt) nextForMode();
    saveSettings();
  }

  // Any freshly generated prompt invalidates pending auto-advance timeouts
  // (see successFlash) — otherwise a stale timeout from a completion right
  // before stop/start or a tab switch would generate a duplicate prompt.
  let advanceSeq = 0;

  function nextForMode() {
    advanceSeq++;
    ({ note: nextPrompt, scale: nextRun, ear: nextEar, phrase: nextPhrase, bend: nextBend })[mode]();
  }

  // ===================== Generation helpers =====================
  function enabledStrings() {
    const on = stringChecks.filter((c) => c.checked).map((c) => +c.dataset.string);
    return on.length ? on : [6, 5, 4, 3, 2, 1];
  }
  function enabledScales() {
    const on = scaleChecks.filter((c) => c.checked).map((c) => c.dataset.scale);
    return on.length ? on : Object.keys(SCALES);
  }
  const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // Focus mode: weight each (string, note) by how slow / skip-prone it has
  // been historically, so weak spots come up more often.
  function adaptiveWeights(candidates) {
    const h = loadJson(KEYS.note);
    const byKey = {};
    h.forEach((e) => {
      const k = e.string + '|' + e.note;
      const b = (byKey[k] = byKey[k] || { ms: [], skips: 0 });
      if (e.skipped) b.skips++; else b.ms.push(e.ms);
    });
    return candidates.map((c) => {
      const b = byKey[c.string + '|' + c.note];
      if (!b) return 3;                      // unseen notes stay well in the mix
      const avg = b.ms.length ? b.ms.reduce((a, x) => a + x, 0) / b.ms.length : 4000;
      return 1 + Math.min(avg, 10000) / 2500 + b.skips;
    });
  }

  function weightedPick(items, weights) {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  function resetMatchState() {
    matchStreak = 0;
    stable = { midi: null, count: 0 };
    advancing = false;
    promptStartedAt = performance.now();
  }

  function playCue(notes) {
    const ms = window.GuitarSynth.playNotes(notes);
    cueUntil = performance.now() + ms + 250;   // + speaker ring-out margin
    return ms;
  }

  // ===================== Single-note mode =====================
  function nextPrompt() {
    const strings = enabledStrings();
    const maxFret = +els.maxFret.value;
    const candidates = [];
    strings.forEach((string) => {
      for (let fret = 0; fret <= maxFret; fret++) {
        const midi = STRINGS[string].midi + fret;
        candidates.push({ string, fret, midi, note: midiToName(midi) });
      }
    });
    let pool = candidates.filter((c) =>
      !(prompt && (c.midi === prompt.midi ||
                   (c.string === prompt.string && c.fret === prompt.fret))));
    if (!pool.length) pool = candidates;

    prompt = els.adaptiveOn.checked
      ? weightedPick(pool, adaptiveWeights(pool))
      : rand(pool);
    resetMatchState();

    els.promptString.textContent = `String ${prompt.string} · ${STRINGS[prompt.string].label}`;
    els.promptNote.textContent = midiToName(prompt.midi);
    els.promptHint.hidden = true;
    els.promptHint.textContent = prompt.fret === 0 ? 'Open string' : `Fret ${prompt.fret}`;
    speakPrompt();
  }

  function matchNote(nearest, inTune) {
    // The 12th-fret harmonic often dominates on electrics, so the octave
    // above is accepted unless strict mode is on.
    const octaveOk = els.octaveStrict.checked
      ? nearest === prompt.midi
      : nearest === prompt.midi || nearest === prompt.midi + 12;
    const isMatch = octaveOk && inTune && !advancing;
    markMatch(octaveOk && inTune);
    if (isMatch) {
      matchStreak++;
      if (matchStreak >= FRAMES_TO_CONFIRM) {
        const ms = performance.now() - promptStartedAt;
        session.note.hits++;
        session.note.times.push(ms);
        pushJson(KEYS.note, {
          string: prompt.string, note: midiToName(prompt.midi), fret: prompt.fret,
          ms: Math.round(ms), skipped: false, ts: Date.now(),
        });
        if (workout) recordWorkout('note', ms);
        renderStats();
        successFlash();
      }
    } else {
      matchStreak = 0;
    }
  }

  // ===================== Scale-run mode =====================
  function nextRun() {
    const scaleKey = rand(enabledScales());
    const scale = SCALES[scaleKey];
    const maxFret = +els.maxFret.value;
    const highestPitch = STRINGS[1].midi + maxFret;
    const fingerIdx = Math.floor(Math.random() * FINGERS.length);
    const fingerOffset = FINGERS[fingerIdx].offset;

    const candidates = [];
    enabledStrings().forEach((string) => {
      const lo = Math.max(1, fingerOffset);      // no open-string roots in runs
      for (let fret = lo; fret <= Math.min(maxFret, 14); fret++) {
        const midi = STRINGS[string].midi + fret;
        if (midi + 12 <= highestPitch) candidates.push({ string, fret, midi });
      }
    });
    const root = rand(candidates);
    const descending = els.descendOn.checked && Math.random() < 0.5;
    let notes = scale.steps.map((s) => root.midi + s);
    if (descending) notes = notes.slice().reverse();

    run = {
      scaleKey, string: root.string, rootFret: root.fret, finger: fingerIdx,
      notes, descending,
      idx: 0, startedAt: performance.now(), mistakes: 0, lastWrongMidi: null,
      offsets: [], skips: 0,
    };
    resetMatchState();
    run.startedAt = promptStartedAt;

    const timed = els.timedOn.checked;
    if (timed) window.GuitarSynth.startClick(+els.bpm.value);
    else window.GuitarSynth.stopClick();

    els.scaleWhere.textContent =
      `String ${run.string} · Fret ${run.rootFret} · ${FINGERS[fingerIdx].label} on the root` +
      (timed ? ` · ♩ ${els.bpm.value}` : '');
    els.scaleName.textContent =
      `${NOTE_NAMES[root.midi % 12]} ${scale.label}` + (descending ? ' ↓' : '');
    renderDots(els.runDots, run.notes.map((m) => NOTE_NAMES[m % 12]), run.idx);
    speakPrompt();
  }

  function matchScale(nearest, inTune) {
    if (advancing) return;
    const expected = run.notes[run.idx];
    const prev = run.idx > 0 ? run.notes[run.idx - 1] : null;
    markMatch(nearest === expected && inTune);

    if (!trackStable(nearest, inTune)) return;

    if (stable.midi === expected) {
      const off = beatOffset(stable.startTs);
      if (off != null) run.offsets.push(off);
      run.idx++;
      run.lastWrongMidi = null;
      stable = { midi: null, count: 0 };
      if (run.idx >= run.notes.length) completeRun();
      else renderDots(els.runDots, run.notes.map((m) => NOTE_NAMES[m % 12]), run.idx);
    } else if (stable.midi !== prev && stable.midi !== run.lastWrongMidi) {
      // Wrong note: count it once per distinct pitch, keep the run going.
      // The previous scale note is exempt — it's still ringing.
      run.mistakes++;
      run.lastWrongMidi = stable.midi;
      session.scale.mistakes++;
      renderStats();
    }
  }

  function completeRun() {
    const ms = performance.now() - run.startedAt;
    session.scale.runs++;
    session.scale.times.push(ms);
    run.idx = run.notes.length;
    renderDots(els.runDots, run.notes.map((m) => NOTE_NAMES[m % 12]), run.idx);

    // Timing score, when the metronome was on for this run.
    const click = window.GuitarSynth.clickInfo();
    let onBeatPct = null;
    if (click && run.offsets.length) {
      const w = beatWindow(click.intervalMs);
      onBeatPct = Math.round(100 * run.offsets.filter((o) => Math.abs(o) <= w).length / run.offsets.length);
      session.scale.lastOnBeat = onBeatPct;
      // Perfect timed run (every note, all on beat, no mistakes) → speed up.
      if (els.rampOn.checked && run.mistakes === 0 && run.skips === 0 &&
          onBeatPct === 100 && run.offsets.length === run.notes.length) {
        els.bpm.value = Math.min(200, +els.bpm.value + 5);
        els.bpmVal.textContent = els.bpm.value;
        saveSettings();
      }
    }

    pushJson(KEYS.scale, {
      scale: run.scaleKey, root: midiToName(run.descending ? run.notes.at(-1) : run.notes[0]),
      string: run.string, fret: run.rootFret, finger: FINGERS[run.finger].label,
      descending: !!run.descending, ms: Math.round(ms), mistakes: run.mistakes,
      onBeatPct, bpm: click ? click.bpm : null, ts: Date.now(),
    });
    if (workout) recordWorkout('scale', ms);
    renderStats();
    successFlash();
  }

  // ===================== Ear-training mode =====================
  function nextEar() {
    const level = els.earLevel.value;
    const maxFret = +els.maxFret.value;
    const strings = enabledStrings();
    const string = rand(strings);
    const lo = level === 'easy' ? 1 : 0;       // easy compares against the open string
    const fret = lo + Math.floor(Math.random() * (maxFret - lo + 1));
    const midi = STRINGS[string].midi + fret;

    ear = {
      level, string, fret, midi,
      refMidi: level === 'easy' ? STRINGS[string].midi : null,
      attempts: 0, offsets: [], lastWrongMidi: null, hinted: false,
    };
    resetMatchState();

    els.earWhere.textContent = level === 'hard'
      ? 'Any string · exact octave'
      : `String ${string} · ${STRINGS[string].label}`;
    els.earNote.textContent = '?';
    els.earHint.hidden = true;
    els.earHint.textContent = `${midiToName(midi)} — fret ${fret}`;
    playEarCue();
  }

  function playEarCue() {
    if (!ear) return;
    els.earStatus.textContent = ear.refMidi != null
      ? '🔈 Open string… then the mystery note'
      : '🔈 Listen…';
    const notes = ear.refMidi != null
      ? [{ midi: ear.refMidi, at: 0, dur: 1.1 }, { midi: ear.midi, at: 1.3, dur: 1.4 }]
      : [{ midi: ear.midi, at: 0, dur: 1.4 }];
    const ms = playCue(notes);
    // The clock starts when the cue ends — search time, not listening time.
    setTimeout(() => {
      if (ear) { promptStartedAt = performance.now(); els.earStatus.textContent = '🎸 Find it!'; }
    }, ms + 250);
  }

  function matchEar(nearest, inTune) {
    if (advancing) return;
    const octaveOk = ear.level === 'hard'
      ? nearest === ear.midi
      : nearest === ear.midi || nearest === ear.midi + 12;
    markMatch(octaveOk && inTune);

    if (!trackStable(nearest, inTune)) return;

    if (ear.level !== 'hard' ? (stable.midi === ear.midi || stable.midi === ear.midi + 12)
                             : stable.midi === ear.midi) {
      const ms = performance.now() - promptStartedAt;
      session.ear.found++;
      session.ear.times.push(ms);
      session.ear.attempts += ear.attempts;
      els.earNote.textContent = midiToName(ear.midi);   // reveal the answer
      pushJson(KEYS.ear, {
        note: midiToName(ear.midi), string: ear.string, fret: ear.fret,
        level: ear.level, ms: Math.round(ms), attempts: ear.attempts,
        offsets: ear.offsets, hinted: ear.hinted, skipped: false, ts: Date.now(),
      });
      ear.attempts = 0;   // rolled into the session total just above
      if (workout) recordWorkout('ear', ms);
      renderStats();
      successFlash();
    } else if (stable.midi !== ear.refMidi && stable.midi !== ear.lastWrongMidi) {
      ear.attempts++;
      ear.lastWrongMidi = stable.midi;
      // Interval-class offset for the confusion table (sign = direction,
      // 12 = pure octave error).
      const raw = stable.midi - ear.midi;
      const cls = Math.abs(raw) % 12;
      ear.offsets.push(Math.sign(raw) * (cls === 0 ? 12 : cls));
      renderStats();
    }
  }

  // ===================== Call & response mode =====================
  function nextPhrase() {
    const scaleKey = rand(enabledScales());
    const scale = SCALES[scaleKey];
    const maxFret = +els.maxFret.value;
    const highestPitch = STRINGS[1].midi + maxFret;
    const len = +els.phraseLen.value;

    const candidates = [];
    enabledStrings().forEach((string) => {
      for (let fret = 1; fret <= Math.min(maxFret, 14); fret++) {
        const midi = STRINGS[string].midi + fret;
        if (midi + 12 <= highestPitch) candidates.push({ string, fret, midi });
      }
    });
    const root = rand(candidates);
    const pool = scale.steps.map((s) => root.midi + s);

    // Random walk over scale degrees: melodic, never repeating a note —
    // a repeat would self-confirm from the previous note still ringing.
    let idx = Math.floor(Math.random() * pool.length);
    const notes = [pool[idx]];
    for (let i = 1; i < len; i++) {
      let next = Math.max(0, Math.min(pool.length - 1, idx + rand([-2, -1, 1, 2])));
      if (next === idx) next = next === 0 ? 1 : next - 1;
      idx = next;
      notes.push(pool[idx]);
    }

    phrase = {
      scaleKey, rootMidi: root.midi, startString: root.string, startFret: root.fret,
      notes, idx: 0, startedAt: 0, mistakes: 0, lastWrongMidi: null, offsets: [],
    };
    resetMatchState();

    const timed = els.timedOn.checked;
    if (timed) window.GuitarSynth.startClick(+els.bpm.value);
    else window.GuitarSynth.stopClick();

    els.phraseWhere.textContent =
      `Around string ${root.string}, fret ${root.fret} · phrase starts on ${midiToName(notes[0])}` +
      (timed ? ` · ♩ ${els.bpm.value}` : '');
    els.phraseName.textContent = `${NOTE_NAMES[root.midi % 12]} ${scale.label}`;
    renderDots(els.phraseDots, phrase.notes.map(() => '?'), 0);
    playPhraseCue();
  }

  function playPhraseCue() {
    if (!phrase) return;
    els.phraseStatus.textContent = '🔈 Listen…';
    // With the metronome on, the cue itself is spaced one note per beat.
    const click = window.GuitarSynth.clickInfo();
    const step = click ? click.intervalMs / 1000 : 0.55;
    const ms = playCue(phrase.notes.map((m, i) => ({ midi: m, at: i * step, dur: Math.min(0.9 * step, 0.6) })));
    setTimeout(() => {
      if (phrase) {
        if (!phrase.startedAt) { phrase.startedAt = performance.now(); promptStartedAt = phrase.startedAt; }
        els.phraseStatus.textContent = '🎸 Your turn!';
      }
    }, ms + 250);
  }

  function phraseDotLabels() {
    return phrase.notes.map((m, i) => i < phrase.idx ? NOTE_NAMES[m % 12] : '?');
  }

  function matchPhrase(nearest, inTune) {
    if (advancing || !phrase.startedAt) return;
    const expected = phrase.notes[phrase.idx];
    const prev = phrase.idx > 0 ? phrase.notes[phrase.idx - 1] : null;
    markMatch(nearest === expected && inTune);

    if (!trackStable(nearest, inTune)) return;

    if (stable.midi === expected) {
      const off = beatOffset(stable.startTs);
      if (off != null) phrase.offsets.push(off);
      phrase.idx++;
      phrase.lastWrongMidi = null;
      stable = { midi: null, count: 0 };
      renderDots(els.phraseDots, phraseDotLabels(), phrase.idx);
      if (phrase.idx >= phrase.notes.length) {
        const ms = performance.now() - phrase.startedAt;
        session.phrase.done++;
        session.phrase.times.push(ms);
        const click = window.GuitarSynth.clickInfo();
        let onBeatPct = null;
        if (click && phrase.offsets.length) {
          const w = beatWindow(click.intervalMs);
          onBeatPct = Math.round(100 * phrase.offsets.filter((o) => Math.abs(o) <= w).length / phrase.offsets.length);
          session.phrase.lastOnBeat = onBeatPct;
        }
        pushJson(KEYS.phrase, {
          scale: phrase.scaleKey, root: midiToName(phrase.rootMidi),
          len: phrase.notes.length, ms: Math.round(ms),
          mistakes: phrase.mistakes, onBeatPct, ts: Date.now(),
        });
        if (workout) recordWorkout('phrase', ms);
        renderStats();
        successFlash();
      }
    } else if (stable.midi !== prev && stable.midi !== phrase.lastWrongMidi) {
      phrase.mistakes++;
      phrase.lastWrongMidi = stable.midi;
      session.phrase.mistakes++;
      renderStats();
    }
  }

  // ===================== Bends & holds mode =====================
  function nextBend() {
    const maxFret = +els.maxFret.value;
    const kind = Math.random() < 0.6 ? 'bend' : 'hold';
    let string, fret, startMidi, targetMidi, amount = 0;

    if (kind === 'bend') {
      // Bends live on the top three strings, mid-neck where they're easiest.
      string = rand([1, 2, 3]);
      fret = 5 + Math.floor(Math.random() * (Math.min(maxFret, 15) - 5 + 1));
      amount = rand([1, 2, 2]);               // whole-step bends twice as common
      startMidi = STRINGS[string].midi + fret;
      targetMidi = startMidi + amount;
    } else {
      string = rand(enabledStrings());
      fret = Math.floor(Math.random() * (maxFret + 1));
      startMidi = targetMidi = STRINGS[string].midi + fret;
    }

    bend = { kind, string, fret, startMidi, targetMidi, amount, phase: 0, holdMs: 0 };
    resetMatchState();

    els.bendWhere.textContent = `String ${string} · Fret ${fret}`;
    if (kind === 'bend') {
      els.bendTask.textContent =
        `Bend ${midiToName(startMidi)} → ${midiToName(targetMidi)} (${amount === 1 ? 'half' : 'whole'} step)`;
      els.bendPhase.textContent = 'Play the start note first…';
    } else {
      els.bendTask.textContent = `Hold ${midiToName(startMidi)} dead in tune`;
      els.bendPhase.textContent = `Keep it within ±${HOLD_CENTS}¢ for ${SUSTAIN_HOLD_MS / 1000}s — re-pick as it decays`;
      bend.phase = 1;
    }
    els.bendProgress.style.width = '0%';
    speakPrompt();
  }

  function matchBend(nearest, inTune, midiFloat, dtMs) {
    if (advancing) return;

    if (bend.phase === 0) {
      // First land the unbent start note.
      markMatch(nearest === bend.startMidi && inTune);
      if (nearest === bend.startMidi && inTune) {
        matchStreak++;
        if (matchStreak >= FRAMES_TO_CONFIRM) {
          bend.phase = 1;
          matchStreak = 0;
          els.bendPhase.textContent = 'Now bend up to the target and hold it!';
        }
      } else {
        matchStreak = 0;
      }
      return;
    }

    // Phase 1: sit on the target pitch. Bends need a short hold; sustains a long one.
    const centsOff = Math.abs(midiFloat - bend.targetMidi) * 100;
    const inZone = centsOff <= HOLD_CENTS;
    markMatch(inZone);
    const needed = bend.kind === 'bend' ? BEND_HOLD_MS : SUSTAIN_HOLD_MS;
    if (inZone) {
      bend.holdMs += dtMs;
    } else if (bend.kind === 'bend') {
      bend.holdMs = 0;      // a bend must *hold* the target, not wobble through it
    }
    els.bendProgress.style.width = Math.min(100, (bend.holdMs / needed) * 100) + '%';

    if (bend.holdMs >= needed) {
      const ms = performance.now() - promptStartedAt;
      session.bend.done++;
      session.bend.times.push(ms);
      pushJson(KEYS.bend, {
        kind: bend.kind, note: midiToName(bend.startMidi),
        target: midiToName(bend.targetMidi), string: bend.string, fret: bend.fret,
        amount: bend.amount, ms: Math.round(ms), ts: Date.now(),
      });
      if (workout) recordWorkout('bend', ms);
      renderStats();
      successFlash();
    }
  }

  // ===================== Shared matching helpers =====================
  function markMatch(on) {
    els.heardNote.classList.toggle('match', on);
    els.centsNeedle.classList.toggle('match', on);
  }

  // Track any stably-heard pitch so one detection glitch can't count as
  // either a hit or a mistake. Returns true once a pitch is confirmed.
  function trackStable(nearest, inTune) {
    if (inTune && nearest === stable.midi) stable.count++;
    else stable = { midi: inTune ? nearest : null, count: inTune ? 1 : 0, startTs: performance.now() };
    return stable.count >= FRAMES_TO_CONFIRM && stable.midi != null;
  }

  // How far (ms) a note onset landed from the nearest metronome beat.
  function beatOffset(ts) {
    const c = window.GuitarSynth.clickInfo();
    if (!c || ts == null) return null;
    let off = (ts - c.t0Perf) % c.intervalMs;
    if (off > c.intervalMs / 2) off -= c.intervalMs;
    if (off < -c.intervalMs / 2) off += c.intervalMs;
    return off;
  }

  function currentTargetMidi() {
    switch (mode) {
      case 'note': return prompt && prompt.midi;
      case 'scale': return run && run.notes[Math.min(run.idx, run.notes.length - 1)];
      case 'ear': return ear && ear.midi;
      case 'phrase': return phrase && phrase.notes[Math.min(phrase.idx, phrase.notes.length - 1)];
      case 'bend': return bend && (bend.phase === 0 ? bend.startMidi : bend.targetMidi);
    }
    return null;
  }

  // ===================== Speech & cues =====================
  function speakPrompt() {
    if (mode === 'ear') { playEarCue(); return; }
    if (mode === 'phrase') { playPhraseCue(); return; }
    if (!els.voiceOn.checked || !('speechSynthesis' in window)) return;
    let text = null;
    if (mode === 'note' && prompt) {
      text = `String ${STRINGS[prompt.string].speech}. Play ${NOTE_SPEECH[prompt.midi % 12]}.`;
    } else if (mode === 'scale' && run) {
      text = `${NOTE_SPEECH[run.notes[0] % 12]} ${SCALES[run.scaleKey].speech}. ` +
             `Start on string ${STRINGS[run.string].speech}, fret ${run.rootFret}, ` +
             `${FINGERS[run.finger].speech}. Play up to the octave.`;
    } else if (mode === 'bend' && bend) {
      text = bend.kind === 'bend'
        ? `String ${STRINGS[bend.string].speech}, fret ${bend.fret}. ` +
          `Bend up a ${bend.amount === 1 ? 'half' : 'whole'} step.`
        : `Hold ${NOTE_SPEECH[bend.startMidi % 12]} on string ${STRINGS[bend.string].speech}, fret ${bend.fret}.`;
    }
    if (!text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    speechSynthesis.speak(u);
  }

  // ===================== Audio in =====================
  async function startAudio() {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(micStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
  }

  function stopAudio() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    if (micStream) micStream.getTracks().forEach((t) => t.stop());
    if (audioCtx) audioCtx.close();
    micStream = audioCtx = analyser = null;
  }

  const timeBuf = new Float32Array(2048);

  function tick() {
    rafId = requestAnimationFrame(tick);
    const now = performance.now();
    const dtMs = lastTickAt ? Math.min(100, now - lastTickAt) : 16;
    lastTickAt = now;
    if (!analyser) return;

    updateTimer(now);

    analyser.getFloatTimeDomainData(timeBuf);
    const { freq, rms } = window.detectPitch(timeBuf, audioCtx.sampleRate);
    els.signalFill.style.width = Math.min(100, rms * 900) + '%';

    if (freq <= 0) {
      els.heardNote.textContent = '—';
      els.heardCents.textContent = '';
      els.centsNeedle.hidden = true;
      markMatch(false);
      matchStreak = 0;
      stable = { midi: null, count: 0 };
      return;
    }

    const midiFloat = freqToMidiFloat(freq);
    const nearest = Math.round(midiFloat);
    const cents = (midiFloat - nearest) * 100;
    const inTune = Math.abs(cents) <= CENTS_TOLERANCE;

    els.heardNote.textContent = midiToName(nearest);
    els.heardCents.textContent = (cents >= 0 ? '+' : '') + cents.toFixed(0) + '¢';

    // Metronome pulse indicator
    const click = window.GuitarSynth.clickInfo();
    els.beatDot.hidden = !click;
    if (click) {
      const phase = ((now - click.t0Perf) % click.intervalMs + click.intervalMs) % click.intervalMs;
      els.beatDot.classList.toggle('on', phase < 110);
    }

    const target = currentTargetMidi();
    if (target == null) return;

    // Needle: offset of what we hear vs the TARGET pitch, clamped to ±50¢.
    const centsFromTarget = (midiFloat - target) * 100;
    const centsMod = centsFromTarget - Math.round(centsFromTarget / 1200) * 1200;
    els.centsNeedle.hidden = false;
    els.centsNeedle.style.left = (50 + Math.max(-50, Math.min(50, centsMod))) + '%';

    // No matching during grace or while a cue is playing (speaker leak).
    if (now - promptStartedAt < GRACE_MS || now < cueUntil) return;

    switch (mode) {
      case 'note': if (prompt) matchNote(nearest, inTune); break;
      case 'scale': if (run) matchScale(nearest, inTune); break;
      case 'ear': if (ear) matchEar(nearest, inTune); break;
      case 'phrase': if (phrase) matchPhrase(nearest, inTune); break;
      case 'bend': if (bend) matchBend(nearest, inTune, midiFloat, dtMs); break;
    }
  }

  function updateTimer(now) {
    if (advancing) return;
    const secs = (t) => ((now - t) / 1000).toFixed(1) + 's';
    if (mode === 'note' && prompt) els.noteTimer.textContent = secs(promptStartedAt);
    else if (mode === 'scale' && run) els.scaleTimer.textContent = secs(run.startedAt);
    else if (mode === 'ear' && ear) els.earTimer.textContent = now < cueUntil ? '…' : secs(promptStartedAt);
    else if (mode === 'phrase' && phrase) {
      els.phraseTimer.textContent = phrase.startedAt ? secs(phrase.startedAt) : '…';
    } else if (mode === 'bend' && bend) els.bendTimer.textContent = secs(promptStartedAt);
  }

  // ===================== Game flow =====================
  // Advance is dispatched at fire time (not bound to the completing mode):
  // a workout step may have switched modes in between.
  function successFlash() {
    advancing = true;
    if (workout) workoutStep();
    els.flash.hidden = false;
    els.flash.style.animation = 'none';
    void els.flash.offsetWidth; // restart the animation
    els.flash.style.animation = '';
    setTimeout(() => { els.flash.hidden = true; }, 700);
    const seq = advanceSeq;
    setTimeout(() => {
      if (!running || seq !== advanceSeq) return;
      if (workout && workout.finished) finishWorkout();
      else nextForMode();
    }, 900);
  }

  // Skips advance the workout too — a prompt the mic can't hear must never
  // strand the circuit.
  function advanceAfterSkip(workoutMode) {
    if (workout) {
      recordWorkout(workoutMode, null);
      workoutStep();
      if (workout.finished) { finishWorkout(); return; }
    }
    nextForMode();
  }

  function onSkip() {
    if (advancing || !running) return;
    if (mode === 'note' && prompt) {
      session.note.skips++;
      pushJson(KEYS.note, {
        string: prompt.string, note: midiToName(prompt.midi), fret: prompt.fret,
        ms: null, skipped: true, ts: Date.now(),
      });
      renderStats();
      advanceAfterSkip('note');
    } else if (mode === 'scale' && run) {
      run.idx++;                 // skip just this degree; the run clock keeps going
      run.skips++;
      stable = { midi: null, count: 0 };
      if (run.idx >= run.notes.length) completeRun();
      else renderDots(els.runDots, run.notes.map((m) => NOTE_NAMES[m % 12]), run.idx);
    } else if (mode === 'ear' && ear) {
      session.ear.skips++;
      pushJson(KEYS.ear, {
        note: midiToName(ear.midi), string: ear.string, fret: ear.fret,
        level: ear.level, ms: null, attempts: ear.attempts, offsets: ear.offsets,
        hinted: ear.hinted, skipped: true, ts: Date.now(),
      });
      renderStats();
      advanceAfterSkip('ear');
    } else if (mode === 'phrase' && phrase) {
      phrase.idx++;              // skip the current note of the phrase
      stable = { midi: null, count: 0 };
      renderDots(els.phraseDots, phraseDotLabels(), phrase.idx);
      if (phrase.idx >= phrase.notes.length) advanceAfterSkip('phrase');
    } else if (mode === 'bend' && bend) {
      advanceAfterSkip('bend');
    }
  }

  function onHint() {
    if (mode === 'note') els.promptHint.hidden = false;
    else if (mode === 'ear' && ear) { ear.hinted = true; els.earHint.hidden = false; }
  }

  function onNew() {
    if (!running || advancing) return;
    if (mode === 'scale') nextRun();
    else if (mode === 'phrase') nextPhrase();
  }

  // ===================== Workout =====================
  function recordWorkout(m, ms) {
    (workout.results[m] = workout.results[m] || []).push({ ms });
  }

  function workoutStep() {
    workout.remaining--;
    if (workout.remaining <= 0) {
      workout.step++;
      if (workout.step >= workoutPlan.length) {
        workout.finished = true;
      } else {
        workout.remaining = workoutPlan[workout.step].count;
        setMode(workoutPlan[workout.step].mode, true);  // prompt comes after the flash
      }
    }
    renderWorkoutLine();
  }

  function renderWorkoutLine() {
    if (!workout) { els.workoutLine.hidden = true; return; }
    els.workoutLine.hidden = false;
    els.workoutLine.textContent = workout.finished
      ? '🏋️ Workout complete!'
      : `🏋️ Workout · step ${workout.step + 1}/${workoutPlan.length} — ` +
        `${workoutPlan[workout.step].label} · ${workout.remaining} to go`;
  }

  async function startWorkout() {
    workout = { step: 0, remaining: workoutPlan[0].count, finished: false, results: {} };
    setMode(workoutPlan[0].mode, true);
    document.querySelector('.mode-tabs').classList.add('locked');
    renderWorkoutLine();
    await start();
    if (!running) {          // mic was denied — unwind
      workout = null;
      document.querySelector('.mode-tabs').classList.remove('locked');
      renderWorkoutLine();
    }
  }

  function finishWorkout() {
    const results = workout.results;
    workout = null;
    document.querySelector('.mode-tabs').classList.remove('locked');
    renderWorkoutLine();
    stop();

    const summary = { date: new Date().toISOString().slice(0, 10), modes: {} };
    workoutPlan.forEach(({ mode: m }) => {
      const r = results[m] || [];
      const done = r.filter((x) => x.ms != null);
      summary.modes[m] = {
        total: r.length,
        done: done.length,
        avg: done.length ? Math.round(done.reduce((a, x) => a + x.ms, 0) / done.length) : null,
      };
    });
    const past = loadJson(WORKOUTS_KEY);
    const prev = past.length ? past[past.length - 1] : null;
    past.push(summary);
    if (past.length > 60) past.splice(0, past.length - 60);
    localStorage.setItem(WORKOUTS_KEY, JSON.stringify(past));

    els.summaryBody.innerHTML = '<table><thead><tr><th>Drill</th><th>Done</th><th>Avg time</th><th>vs last</th></tr></thead><tbody>' +
      workoutPlan.map(({ mode: m, label }) => {
        const cur = summary.modes[m];
        const old = prev && prev.modes[m];
        let delta = '—';
        if (cur.avg != null && old && old.avg != null) {
          const d = (cur.avg - old.avg) / 1000;
          delta = d <= 0 ? `▼ ${(-d).toFixed(1)}s faster` : `▲ ${d.toFixed(1)}s slower`;
        }
        return `<tr><td>${label}</td><td>${cur.done}/${cur.total}</td>` +
               `<td>${cur.avg != null ? (cur.avg / 1000).toFixed(1) + 's' : '—'}</td><td>${delta}</td></tr>`;
      }).join('') + '</tbody></table>' +
      `<p class="streak-line">🔥 ${workoutStreak()}-day streak</p>`;
    els.workoutSummary.hidden = false;
    renderStreak();
  }

  function workoutStreak() {
    const days = [...new Set(loadJson(WORKOUTS_KEY).map((w) => w.date))].sort().reverse();
    let streak = 0;
    const d = new Date();
    for (;;) {
      const iso = d.toISOString().slice(0, 10);
      if (days.includes(iso)) { streak++; d.setDate(d.getDate() - 1); }
      else break;
    }
    return streak;
  }

  function renderStreak() {
    const past = loadJson(WORKOUTS_KEY);
    const streak = workoutStreak();
    els.streakLine.hidden = !past.length;
    if (past.length) {
      els.streakLine.textContent = streak > 0
        ? `🔥 ${streak}-day workout streak · last: ${past[past.length - 1].date}`
        : `Last workout: ${past[past.length - 1].date}`;
    }
  }

  // ===================== Session start/stop =====================
  async function start() {
    try {
      await startAudio();
    } catch (err) {
      alert('Microphone access is required. Check browser permissions and reload.\n\n' + err.message);
      return;
    }
    running = true;
    session.note = { hits: 0, skips: 0, times: [] };
    session.scale = { runs: 0, times: [], mistakes: 0 };
    session.ear = { found: 0, skips: 0, times: [], attempts: 0 };
    session.phrase = { done: 0, times: [], mistakes: 0 };
    session.bend = { done: 0, times: [] };
    els.idleView.hidden = true;
    els.activeView.hidden = false;
    renderStats();
    nextForMode();
    lastTickAt = 0;
    tick();
  }

  function stop() {
    running = false;
    advanceSeq++;              // kill any pending auto-advance
    prompt = run = ear = phrase = bend = null;
    cueUntil = 0;
    if (workout) {             // abandoning mid-workout: nothing saved
      workout = null;
      document.querySelector('.mode-tabs').classList.remove('locked');
      renderWorkoutLine();
    }
    window.GuitarSynth.stopClick();
    stopAudio();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    els.idleView.hidden = false;
    els.activeView.hidden = true;
  }

  // ===================== Rendering =====================
  function renderDots(container, labels, doneCount) {
    container.innerHTML = labels.map((label, i) => {
      const cls = i < doneCount ? 'dot done' : i === doneCount ? 'dot current' : 'dot';
      return `<span class="${cls}">${label}</span>`;
    }).join('');
  }

  const fmt = (ms) => ms == null ? '—' : (ms / 1000).toFixed(1) + 's';
  const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;

  function renderStats() {
    const s = session;
    const tiles = {
      note: [
        ['Notes hit', s.note.hits], ['Skipped', s.note.skips],
        ['Last', fmt(s.note.times.at(-1))], ['Average', fmt(avg(s.note.times))],
        ['Fastest', fmt(s.note.times.length ? Math.min(...s.note.times) : null)],
      ],
      scale: [
        ['Runs', s.scale.runs], ['Last run', fmt(s.scale.times.at(-1))],
        ['Avg run', fmt(avg(s.scale.times))],
        ['Best run', fmt(s.scale.times.length ? Math.min(...s.scale.times) : null)],
        ['Mistakes', s.scale.mistakes],
        ['On beat', s.scale.lastOnBeat != null ? s.scale.lastOnBeat + '%' : '—'],
      ],
      ear: [
        ['Found', s.ear.found], ['Skipped', s.ear.skips],
        ['Avg time', fmt(avg(s.ear.times))],
        // include the in-progress prompt so wrong guesses show live
        ['Wrong tries', s.ear.attempts + (ear ? ear.attempts : 0)],
        ['Fastest', fmt(s.ear.times.length ? Math.min(...s.ear.times) : null)],
      ],
      phrase: [
        ['Phrases', s.phrase.done], ['Last', fmt(s.phrase.times.at(-1))],
        ['Average', fmt(avg(s.phrase.times))], ['Mistakes', s.phrase.mistakes],
        ['On beat', s.phrase.lastOnBeat != null ? s.phrase.lastOnBeat + '%' : '—'],
      ],
      bend: [
        ['Completed', s.bend.done], ['Last', fmt(s.bend.times.at(-1))],
        ['Average', fmt(avg(s.bend.times))],
        ['Fastest', fmt(s.bend.times.length ? Math.min(...s.bend.times) : null)],
      ],
    }[mode];

    els.tilesLabel.textContent = {
      note: 'Single notes', scale: 'Scale runs', ear: 'Ear training',
      phrase: 'Call & response', bend: 'Bends & holds',
    }[mode];
    els.tilesRow.innerHTML = tiles.map(([label, value]) =>
      `<div class="tile"><div class="tile-label">${label}</div><div class="tile-value">${value}</div></div>`
    ).join('');

    renderHistory();
  }

  function table(title, head, rows, empty) {
    const body = rows.length
      ? rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${head.length}">${empty}</td></tr>`;
    return `<div class="history-block"><h3>${title}</h3><table>` +
           `<thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead>` +
           `<tbody>${body}</tbody></table></div>`;
  }

  // Fretboard heatmap: each position colored by your average find-time.
  // Fixed, interpretable buckets rather than a normalized scale.
  const HEAT_BUCKETS = [1500, 2500, 4000, 6000, 9000];   // ms upper bounds

  function heatmapHtml(history) {
    const maxFret = +els.maxFret.value;
    const byPos = {};
    history.forEach((e) => {
      const b = (byPos[e.string + '|' + e.fret] = byPos[e.string + '|' + e.fret] || { ms: [], skips: 0 });
      if (e.skipped) b.skips++; else b.ms.push(e.ms);
    });

    const header = ['<span class="heat-lbl"></span>'];
    for (let f = 0; f <= maxFret; f++) header.push(`<span class="heat-num">${f}</span>`);
    const rows = [header.join('')];

    [1, 2, 3, 4, 5, 6].forEach((s) => {
      const cells = [`<span class="heat-lbl">${{ 1: 'e', 2: 'B', 3: 'G', 4: 'D', 5: 'A', 6: 'E' }[s]}</span>`];
      for (let f = 0; f <= maxFret; f++) {
        const b = byPos[s + '|' + f];
        const a = b && b.ms.length ? b.ms.reduce((x, y) => x + y, 0) / b.ms.length : null;
        let cls = 'heat-none';
        if (a != null) {
          let i = 0;
          while (i < HEAT_BUCKETS.length && a > HEAT_BUCKETS[i]) i++;
          cls = 'heat-' + (i + 1);
        }
        const name = midiToName(STRINGS[s].midi + f);
        const title = a != null
          ? `${name} · avg ${(a / 1000).toFixed(1)}s (${b.ms.length} hit${b.ms.length > 1 ? 's' : ''}${b.skips ? `, ${b.skips} skipped` : ''})`
          : b && b.skips ? `${name} · only skips (${b.skips})` : `${name} · not drilled yet`;
        cells.push(`<span class="heat-cell ${cls}" title="${title}"></span>`);
      }
      rows.push(cells.join(''));
    });

    return `<div class="history-block"><h3>Fretboard heatmap — average find-time per position</h3>` +
      `<div class="heatmap" style="grid-template-columns: 24px repeat(${maxFret + 1}, minmax(16px, 1fr));">` +
      rows.join('') + `</div>` +
      `<div class="heat-legend"><span>fast</span>` +
      [1, 2, 3, 4, 5, 6].map((i) => `<span class="heat-cell heat-${i}"></span>`).join('') +
      `<span>slow</span><span class="heat-cell heat-none"></span><span>not drilled</span></div></div>`;
  }

  function renderHistory() {
    const html = [];

    if (mode === 'note') {
      const h = loadJson(KEYS.note);
      const per = {};
      h.filter((e) => !e.skipped).forEach((e) => (per[e.string] = per[e.string] || []).push(e.ms));
      html.push(table('Per-string averages', ['String', 'Hits', 'Avg time'],
        [6, 5, 4, 3, 2, 1].filter((x) => per[x]).map((x) =>
          [`${x} · ${STRINGS[x].label}`, per[x].length, fmt(avg(per[x]))]),
        'No notes played yet'));
      html.push(table('Recent notes', ['String', 'Note', 'Fret', 'Time'],
        h.slice(-12).reverse().map((e) => [e.string, e.note, e.fret, e.skipped ? 'skipped' : fmt(e.ms)]),
        'No notes played yet'));
      html.push(heatmapHtml(h));
    } else if (mode === 'scale') {
      const h = loadJson(KEYS.scale);
      html.push(table('Recent runs', ['Scale', 'From', 'Time', 'Mistakes'],
        h.slice(-12).reverse().map((e) => [
          (SCALES[e.scale] || { label: e.scale }).label,
          `${e.root} · str ${e.string} fr ${e.fret}`, fmt(e.ms), e.mistakes]),
        'No runs completed yet'));
    } else if (mode === 'ear') {
      const h = loadJson(KEYS.ear);
      // Confusion table: which intervals your wrong guesses land on.
      const conf = {};
      h.forEach((e) => (e.offsets || []).forEach((o) => {
        const key = (o > 0 ? '↑ ' : '↓ ') + INTERVAL_NAMES[Math.abs(o) % 12];
        conf[key] = (conf[key] || 0) + 1;
      }));
      html.push(table('Miss patterns — wrong guesses by interval from the target',
        ['Interval off', 'Count'],
        Object.entries(conf).sort((a, b) => b[1] - a[1]).slice(0, 8),
        'No wrong guesses logged yet — nice'));
      html.push(table('Recent ear prompts', ['Note', 'String', 'Level', 'Time', 'Wrong tries'],
        h.slice(-12).reverse().map((e) => [
          e.note, e.string, e.level, e.skipped ? 'skipped' : fmt(e.ms), e.attempts]),
        'Nothing yet'));
    } else if (mode === 'phrase') {
      const h = loadJson(KEYS.phrase);
      html.push(table('Recent phrases', ['Scale', 'Root', 'Notes', 'Time', 'Mistakes'],
        h.slice(-12).reverse().map((e) => [
          (SCALES[e.scale] || { label: e.scale }).label, e.root, e.len, fmt(e.ms), e.mistakes]),
        'No phrases completed yet'));
    } else if (mode === 'bend') {
      const h = loadJson(KEYS.bend);
      html.push(table('Recent bends & holds', ['Type', 'Note', 'Target', 'Where', 'Time'],
        h.slice(-12).reverse().map((e) => [
          e.kind, e.note, e.target, `str ${e.string} fr ${e.fret}`, fmt(e.ms)]),
        'Nothing yet'));
    }

    els.historyContainer.innerHTML = html.join('');
  }

  // ===================== Wiring =====================
  els.startBtn.addEventListener('click', start);
  els.workoutBtn.addEventListener('click', startWorkout);
  els.summaryClose.addEventListener('click', () => { els.workoutSummary.hidden = true; });
  els.stopBtn.addEventListener('click', stop);
  els.skipBtn.addEventListener('click', onSkip);
  els.newBtn.addEventListener('click', onNew);
  els.repeatBtn.addEventListener('click', speakPrompt);
  els.hintBtn.addEventListener('click', onHint);
  Object.keys(MODE_UI).forEach((k) => {
    document.getElementById('tab-' + k).addEventListener('click', () => setMode(k));
  });
  els.resetStatsBtn.addEventListener('click', () => {
    if (confirm('Clear all saved history and stats?')) {
      Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
      session.note = { hits: 0, skips: 0, times: [] };
      session.scale = { runs: 0, times: [], mistakes: 0 };
      session.ear = { found: 0, skips: 0, times: [], attempts: 0 };
      session.phrase = { done: 0, times: [], mistakes: 0 };
      session.bend = { done: 0, times: [] };
      renderStats();
    }
  });
  els.maxFret.addEventListener('input', () => {
    els.maxFretVal.textContent = els.maxFret.value;
    saveSettings();
  });
  els.phraseLen.addEventListener('input', () => {
    els.phraseLenVal.textContent = els.phraseLen.value;
    saveSettings();
  });
  els.bpm.addEventListener('input', () => {
    els.bpmVal.textContent = els.bpm.value;
    saveSettings();
  });
  els.timedOn.addEventListener('change', () => {
    if (!els.timedOn.checked) window.GuitarSynth.stopClick();
    saveSettings();
  });
  [els.voiceOn, els.adaptiveOn, els.octaveStrict, els.earLevel, els.descendOn, els.rampOn,
   ...stringChecks, ...scaleChecks]
    .forEach((el) => el.addEventListener('change', saveSettings));

  document.addEventListener('keydown', (e) => {
    if (!running || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === 's' || e.key === 'ArrowRight') onSkip();
    if (e.key === 'n') onNew();
    if (e.key === 'h') onHint();
    if (e.key === 'r') speakPrompt();
  });

  // Test hooks: expose just enough state for automated end-to-end checks.
  window.__trainerDebug = () => ({
    mode, running, cueUntil,
    target: currentTargetMidi(),
    bendKind: bend && bend.kind,
    bendPhase: bend && bend.phase,
    phraseNotes: phrase && phrase.notes.slice(),
    earMidi: ear && ear.midi,
    runDescending: run && !!run.descending,
    runOffsets: run && run.offsets.length,
    workout: workout && { step: workout.step, remaining: workout.remaining, finished: workout.finished },
  });
  window.__trainerTest = {
    setWorkoutPlan(plan) { workoutPlan = plan; },
  };

  loadSettings();
  renderStats();
  renderStreak();
})();
