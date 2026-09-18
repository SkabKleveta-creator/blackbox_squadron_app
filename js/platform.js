/* BLACKBOX SQUADRON v0.5.0 — local platform services, no network dependencies. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document && !root.BBPlatform) root.BBPlatform = api.createPlatform(root);
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const KEYS = Object.freeze({ settings: 'blackbox_squadron_settings_v2', profile: 'blackbox_squadron_profile_v2', checkpoint: 'blackbox_squadron_checkpoint_v1' });
  const DEFAULT_SETTINGS = Object.freeze({ volume: 0.45, sound: true, music: true, reducedMotion: false, autoFire: true, gamepad: true, difficulty: 'standard' });
  const DIFFICULTIES = ['cadet', 'standard', 'ace'];
  const number = (v, fallback, min, max) => typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  const integer = (v, fallback, min, max) => Math.floor(number(v, fallback, min, max));
  const plain = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const difficulty = v => DIFFICULTIES.includes(v) ? v : 'standard';
  function validateSettings(value) {
    const v = plain(value), out = { ...DEFAULT_SETTINGS };
    for (const key of ['sound', 'music', 'reducedMotion', 'autoFire', 'gamepad']) if (typeof v[key] === 'boolean') out[key] = v[key];
    out.volume = number(v.volume, DEFAULT_SETTINGS.volume, 0, 1);
    out.difficulty = difficulty(v.difficulty);
    return out;
  }
  function validateScores(value) {
    if (!Array.isArray(value)) return [];
    return value.filter(v => v && typeof v.score === 'number' && Number.isFinite(v.score) && v.score > 0 && v.score <= 1e9)
      .map(v => ({ name: String(v.name || 'ACE').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 3) || 'ACE', score: Math.floor(v.score), level: integer(v.level, 1, 1, 10000) }))
      .sort((a, b) => b.score - a.score).slice(0, 10);
  }
  function validateProfile(value) {
    const v = plain(value);
    return { version: 2, runs: integer(v.runs, 0, 0, 1e7), wins: integer(v.wins, 0, 0, 1e7), kills: integer(v.kills, 0, 0, 1e9), playSeconds: number(v.playSeconds, 0, 0, 1e10), bestScore: integer(v.bestScore, 0, 0, 1e9), highestLevel: integer(v.highestLevel, 1, 1, 10000), scores: validateScores(v.scores), runTotals: Array.isArray(v.runTotals) ? v.runTotals.filter(x => x && typeof x.id === 'string' && x.id.length <= 100).slice(-40).map(x => ({ id: x.id, kills: integer(x.kills, 0, 0, 1e7), duration: number(x.duration, 0, 0, 1e7), won: x.won === true })) : [], recentRuns: Array.isArray(v.recentRuns) ? v.recentRuns.filter(x => typeof x === 'string' && x.length <= 100).slice(-40) : [] };
  }
  function validateCheckpoint(value) {
    const v = plain(value), p = plain(v.player), s = plain(v.stats), u = plain(v.upgrades);
    const finiteWithin = (val, min, max) => typeof val === 'number' && Number.isFinite(val) && val >= min && val <= max;
    // Reject unusable saves instead of silently reviving a dead or corrupt run.
    if (v.version !== 1 || !Number.isInteger(v.level) || !finiteWithin(v.level, 1, 10000) || !finiteWithin(v.score, 0, 1e9) || !DIFFICULTIES.includes(v.difficulty) || !finiteWithin(p.maxLives, 1, 20) || !finiteWithin(p.lives, 1, p.maxLives) || !finiteWithin(p.maxBombs, 1, 20) || !finiteWithin(p.bombs, 0, p.maxBombs)) return null;
    const stats = {};
    for (const key of ['kills', 'bossesDefeated', 'sectorsCleared', 'shotsFired', 'shotsHit', 'damageTaken', 'bombsUsed', 'maxCombo', 'perfectSectors']) stats[key] = integer(s[key], 0, 0, 1e9);
    stats.playTime = number(s.playTime, 0, 0, 1e9);
    const upgrades = {};
    for (const key of ['engine', 'reactor', 'capacitor', 'ordnance', 'hull']) upgrades[key] = integer(u[key], 0, 0, 5);
    return { version: 1, runId: typeof v.runId === 'string' && v.runId.length ? v.runId.slice(0, 99) : undefined, level: v.level, score: Math.floor(v.score), difficulty: v.difficulty, endless: v.endless === true, player: { lives: Math.floor(p.lives), maxLives: Math.floor(p.maxLives), bombs: Math.floor(p.bombs), maxBombs: Math.floor(p.maxBombs), shieldHp: number(p.shieldHp, 0, 0, 20), speed: number(p.speed, 260, 100, 600), baseFireRate: number(p.baseFireRate, 0.16, 0.04, 1), spreadTimer: number(p.spreadTimer, 0, 0, 60), rapidTimer: number(p.rapidTimer, 0, 0, 60), railTimer: number(p.railTimer, 0, 0, 60), droneTimer: number(p.droneTimer, 0, 0, 60) }, upgrades, stats };
  }
  function createStore(storage) {
    let available = !!storage;
    const memory = new Map(), dirty = new Set();
    return {
      get available() { return available; },
      read(key, fallback) {
        if (dirty.has(key)) return memory.has(key) ? memory.get(key) : fallback;
        let raw;
        try { raw = storage && storage.getItem(key); } catch (_) { available = false; }
        if (raw !== null && raw !== undefined) {
          try { const result = JSON.parse(raw); memory.set(key, result); return result; } catch (_) { return fallback; }
        }
        return memory.has(key) ? memory.get(key) : fallback;
      },
      write(key, value) {
        memory.set(key, value);
        dirty.add(key);
        try { if (!storage) return false; storage.setItem(key, JSON.stringify(value)); dirty.delete(key); return true; }
        catch (_) { available = false; return false; }
      },
      remove(key) {
        memory.delete(key); dirty.add(key);
        try { if (storage) storage.removeItem(key); dirty.delete(key); return !!storage; }
        catch (_) { available = false; return false; }
      }
    };
  }
  function createAudio(win, getSettings, getState) {
    let context, master, effects, music, timer, step = 0, paused = false;
    let voices = 0;
    const last = Object.create(null);
    function applyVolume() {
      if (!context) return;
      const settings = getSettings(), now = context.currentTime;
      master.gain.setTargetAtTime(settings.volume, now, 0.035);
      effects.gain.setTargetAtTime(settings.sound ? 0.5 : 0, now, 0.035);
      music.gain.setTargetAtTime(settings.music ? 0.13 : 0, now, 0.035);
    }
    function tone(frequency, endFrequency, duration, wave, gain, bus, delay) {
      if (!context || context.state !== 'running' || voices >= 24) return;
      const oscillator = context.createOscillator(), envelope = context.createGain(), start = context.currentTime + (delay || 0);
      oscillator.type = wave; oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
      envelope.gain.setValueAtTime(0, start); envelope.gain.linearRampToValueAtTime(gain, start + 0.006); envelope.gain.exponentialRampToValueAtTime(0.001, start + duration);
      oscillator.connect(envelope); envelope.connect(bus); voices++;
      oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); voices--; };
      oscillator.start(start); oscillator.stop(start + duration + 0.02);
    }
    function tick() {
      if (!context || context.state !== 'running' || paused || !getSettings().music || getState() !== 'playing') return;
      const notes = [110, 164.81, 220, 164.81, 130.81, 196, 261.63, 196];
      const f = notes[step++ % notes.length];
      tone(f, f, 0.29, 'triangle', 0.22, music);
      if (step % 4 === 0) tone(55, 48, 0.18, 'sine', 0.38, music);
    }
    async function unlock() {
      if (paused || win.document.hidden) return false;
      try {
        if (!context) {
          const Constructor = win.AudioContext || win.webkitAudioContext;
          if (!Constructor) return false;
          context = new Constructor(); master = context.createGain(); effects = context.createGain(); music = context.createGain();
          effects.connect(master); music.connect(master); master.connect(context.destination); applyVolume();
          timer = win.setInterval(tick, 280);
        }
        if (context.state === 'suspended') await context.resume();
        return context.state === 'running';
      } catch (_) { return false; }
    }
    function play(name) {
      if (!context || context.state !== 'running' || paused || !getSettings().sound || !getSettings().volume) return;
      const now = context.currentTime, intervals = { shoot: 0.07, explosion: 0.08, hit: 0.1 };
      if (last[name] !== undefined && now - last[name] < (intervals[name] || 0.04)) return;
      last[name] = now;
      const patterns = { shoot: [720, 180, 0.075, 'sawtooth', 0.07], hit: [160, 35, 0.24, 'sawtooth', 0.32], explosion: [100, 24, 0.23, 'sawtooth', 0.17], pickup: [640, 1100, 0.18, 'sine', 0.26], bomb: [150, 24, 0.65, 'sawtooth', 0.4], boss: [180, 90, 0.45, 'square', 0.12], ui: [480, 720, 0.075, 'sine', 0.17], shield: [940, 620, 0.11, 'triangle', 0.2], victory: [440, 880, 0.4, 'triangle', 0.3], defeat: [260, 60, 0.8, 'triangle', 0.3] };
      const p = patterns[name] || patterns.ui;
      tone(...p, effects);
      if (name === 'victory') { tone(550, 1100, 0.45, 'triangle', 0.2, effects, 0.12); tone(660, 1320, 0.5, 'triangle', 0.2, effects, 0.24); }
    }
    return { unlock, play, applyVolume, get available() { return !!(win.AudioContext || win.webkitAudioContext); }, setPaused(value) { paused = !!value; if (paused && context && context.state === 'running') context.suspend().catch(() => {}); }, destroy() { if (timer) win.clearInterval(timer); if (context) context.close().catch(() => {}); } };
  }
  function createPlatform(win) {
    let storage;
    try { storage = win.localStorage; } catch (_) { storage = null; }
    const store = createStore(storage);
    const defaults = { ...DEFAULT_SETTINGS, reducedMotion: !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches) };
    let settings = validateSettings(store.read(KEYS.settings, defaults));
    let profile = validateProfile(store.read(KEYS.profile, {}));
    let adapter = {}, bound = false, padFrame = 0, lastPad = { bomb: false, pause: false }, checkpointCleared = false;
    const listeners = new Set(), gamepadInput = { dx: 0, dy: 0, fire: false, bomb: false, pause: false, connected: false };
    const legacyScores = validateScores(store.read('blackbox_squadron_scoreboard_v1', []));
    const legacyHigh = integer(Number(store.read('blackbox_squadron_highscore', 0)), 0, 0, 1e9);
    if (!profile.scores.length) profile.scores = legacyScores;
    profile.bestScore = Math.max(profile.bestScore, legacyHigh, (profile.scores[0] || {}).score || 0);
    profile.highestLevel = Math.max(profile.highestLevel, ...profile.scores.map(entry => entry.level), 1);
    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function notify(type) {
      const detail = { type, settings: { ...settings }, profile: clone(profile), storageAvailable: store.available };
      for (const listener of listeners) { try { listener(detail); } catch (_) {} }
      win.dispatchEvent(new win.CustomEvent('blackbox:platform', { detail }));
    }
    function getState() { return adapter.getState ? adapter.getState() : typeof game !== 'undefined' ? game.state : 'start'; }
    const audio = createAudio(win, () => settings, getState);
    function clearInput() {
      Object.assign(gamepadInput, { dx: 0, dy: 0, fire: false, bomb: false, pause: false });
      if (adapter.clearInput) adapter.clearInput(); else if (typeof clearAllInput === 'function') clearAllInput();
    }
    function pause(reason) {
      clearInput();
      if (adapter.pause) adapter.pause(reason);
      else if (typeof game !== 'undefined' && typeof STATE !== 'undefined' && game.state === STATE.PLAYING) { game.state = STATE.PAUSED; game.pauseReason = reason; }
      audio.setPaused(true);
      notify('pause');
    }
    function activateAudio() { if (!win.document.hidden) { audio.setPaused(false); audio.unlock(); } }
    function pollGamepad() {
      padFrame = win.requestAnimationFrame(pollGamepad);
      if (!settings.gamepad || win.document.hidden || !win.navigator.getGamepads) return;
      let pads; try { pads = win.navigator.getGamepads(); } catch (_) { return; }
      const pad = Array.from(pads || []).find(p => p && p.connected && (p.mapping === 'standard' || p.mapping === ''));
      const connectedBefore = gamepadInput.connected;
      if (!pad) { if (connectedBefore) { gamepadInput.connected = false; pause('Controller disconnected'); } lastPad = { bomb: false, pause: false }; return; }
      const button = i => !!(pad.buttons[i] && pad.buttons[i].pressed);
      const axis = i => { const v = number(pad.axes[i], 0, -1, 1); return Math.abs(v) < 0.18 ? 0 : Math.sign(v) * (Math.abs(v) - 0.18) / 0.82; };
      const bomb = button(1) || button(5), pausePressed = button(9);
      const dx = axis(0) || ((button(15) ? 1 : 0) - (button(14) ? 1 : 0));
      const dy = axis(1) || ((button(13) ? 1 : 0) - (button(12) ? 1 : 0));
      Object.assign(gamepadInput, { dx, dy, fire: button(0) || button(7), bomb, pause: pausePressed, connected: true });
      if (bomb && !lastPad.bomb && getState() === 'playing') { activateAudio(); if (adapter.bomb) adapter.bomb(); else if (typeof useBomb === 'function') useBomb(); }
      if (pausePressed && !lastPad.pause) { activateAudio(); if (adapter.togglePause) adapter.togglePause(); else if (typeof toggleStartPause === 'function') toggleStartPause(); }
      if (adapter.onGamepad) adapter.onGamepad({ ...gamepadInput });
      lastPad = { bomb, pause: pausePressed };
      if (!connectedBefore) notify('gamepad');
    }
    const platform = {
      version: '0.5.0', gamepadInput, audio,
      get settings() { return { ...settings }; },
      get storageAvailable() { return store.available; },
      getSettings() { return { ...settings }; },
      updateSettings(patch) {
        settings = validateSettings({ ...settings, ...plain(patch) }); store.write(KEYS.settings, settings); audio.applyVolume();
        if (!settings.gamepad) { clearInput(); gamepadInput.connected = false; }
        notify('settings'); return { ...settings };
      },
      getProfile() { return clone(profile); },
      getScores() { return typeof scoreboardCache !== 'undefined' ? validateScores(scoreboardCache) : validateScores(store.read('blackbox_squadron_scoreboard_v1', profile.scores)); },
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      recordRun(data) {
        const v = plain(data), id = typeof v.id === 'string' && v.id.length ? v.id.slice(0, 100) : 'run-' + Date.now();
        const bestScore = integer(v.score, 0, 0, 1e9), level = integer(v.level, 1, 1, 10000);
        profile.bestScore = Math.max(profile.bestScore, bestScore); profile.highestLevel = Math.max(profile.highestLevel, level);
        const known = profile.recentRuns.includes(id), previous = profile.runTotals.find(item => item.id === id);
        const kills = integer(v.kills, 0, 0, 1e7), duration = number(v.duration, 0, 0, 1e7), won = v.victory === true;
        if (!known) { profile.runs++; profile.recentRuns = [...profile.recentRuns, id].slice(-40); }
        // A campaign win and its endless continuation share one sortie. Count only new totals.
        if (!known || previous) {
          profile.kills += Math.max(0, kills - (previous?.kills || 0));
          profile.playSeconds += Math.max(0, duration - (previous?.duration || 0));
          if (won && !previous?.won) profile.wins++;
          profile.runTotals = [...profile.runTotals.filter(item => item.id !== id), { id, kills: Math.max(kills, previous?.kills || 0), duration: Math.max(duration, previous?.duration || 0), won: won || previous?.won === true }].slice(-40);
        }
        profile.scores = platform.getScores();
        store.write(KEYS.profile, profile); notify('profile'); return clone(profile);
      },
      saveCheckpoint(data) {
        const checked = validateCheckpoint(data);
        if (!checked) return false;
        checkpointCleared = false; const result = store.write(KEYS.checkpoint, checked); notify('checkpoint'); return result;
      },
      loadCheckpoint() { return checkpointCleared ? null : validateCheckpoint(store.read(KEYS.checkpoint, null)); },
      clearCheckpoint() { checkpointCleared = true; store.remove(KEYS.checkpoint); notify('checkpoint'); },
      attach(value) {
        adapter = value || {};
        if (bound) return; bound = true;
        win.addEventListener('blur', () => pause('Window lost focus'));
        win.document.addEventListener('visibilitychange', () => { if (win.document.hidden) pause('Flight paused while away'); });
        win.addEventListener('pagehide', () => { clearInput(); audio.setPaused(true); });
        win.addEventListener('pointerdown', activateAudio, { passive: true });
        win.addEventListener('keydown', activateAudio, { passive: true });
        win.addEventListener('gamepaddisconnected', () => { gamepadInput.connected = false; lastPad = { bomb: false, pause: false }; pause('Controller disconnected'); });
        padFrame = win.requestAnimationFrame(pollGamepad);
      },
      pause,
      async registerServiceWorker() {
        if (!('serviceWorker' in win.navigator) || !/^https?:$/.test(win.location.protocol)) return null;
        try {
          const registration = await win.navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
          platform.serviceWorker = registration;
          registration.addEventListener('updatefound', () => { const worker = registration.installing; if (worker) worker.addEventListener('statechange', () => { if (worker.state === 'installed') notify(win.navigator.serviceWorker.controller ? 'update-ready' : 'offline-ready'); }); });
          return registration;
        } catch (_) { notify('offline-unavailable'); return null; }
      }
    };
    platform.attach({});
    win.addEventListener('blackbox:campaign', event => {
      const d = event.detail || {}, campaign = win.BlackboxCampaign;
      if (d.type === 'sector-start' || d.type === 'upgrade') { if (campaign && campaign.serialize) platform.saveCheckpoint(campaign.serialize()); }
      if (d.type === 'victory' || d.type === 'defeat') {
        const stats = d.stats || {};
        platform.clearCheckpoint(); platform.recordRun({ id: d.runId, score: d.score, level: d.level, kills: stats.kills, duration: stats.playTime, victory: d.type === 'victory' });
        audio.play(d.type);
      }
      if (d.type === 'boss-start' || d.type === 'boss-encounter' || d.type === 'boss') audio.play('boss');
    });
    // Each wrapper is installed once, after game.js and campaign.js have loaded.
    if (typeof loadScoreboard === 'function') { const original = loadScoreboard; loadScoreboard = function (...args) { const stored = original.apply(this, args); return !store.available && typeof scoreboardCache !== 'undefined' ? validateScores(scoreboardCache) : stored; }; }
    if (typeof addScoreboardEntry === 'function') { const original = addScoreboardEntry; addScoreboardEntry = function (...args) { const result = original.apply(this, args); profile.scores = validateScores(result); profile.bestScore = Math.max(profile.bestScore, profile.scores[0]?.score || 0); store.write(KEYS.profile, profile); notify('scores'); return result; }; }
    if (typeof firePlayer === 'function') { const original = firePlayer; firePlayer = function (...args) { const result = original.apply(this, args); audio.play('shoot'); return result; }; }
    if (typeof killEnemy === 'function') { const original = killEnemy; killEnemy = function (...args) { const result = original.apply(this, args); audio.play('explosion'); return result; }; }
    if (typeof applyPowerup === 'function') { const original = applyPowerup; applyPowerup = function (...args) { const result = original.apply(this, args); audio.play('pickup'); return result; }; }
    if (typeof useBomb === 'function') { const original = useBomb; useBomb = function (...args) { const before = typeof player !== 'undefined' ? player.bombs : 0; const result = original.apply(this, args); if (typeof player !== 'undefined' && player.bombs < before) audio.play('bomb'); return result; }; }
    if (typeof absorbOrHitPlayer === 'function') { const original = absorbOrHitPlayer; absorbOrHitPlayer = function (...args) { const hull = typeof player !== 'undefined' ? player.lives : 0; const shield = typeof player !== 'undefined' ? player.shieldHp : 0; const result = original.apply(this, args); if (typeof player !== 'undefined') { if (player.lives < hull) audio.play('hit'); else if (player.shieldHp < shield) audio.play('shield'); } return result; }; }
    platform.registerServiceWorker();
    return platform;
  }
  return { KEYS, DEFAULT_SETTINGS, validateSettings, validateScores, validateProfile, validateCheckpoint, createStore, createPlatform };
});
