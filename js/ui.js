/* BLACKBOX SQUADRON v0.5.0 — menus, cockpit, and direct touch flight. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const campaign = window.BlackboxCampaign, platform = window.BBPlatform;
  const overlay = $('screen-overlay'), screen = $('screen-content'), dialog = $('utility-dialog');
  const clean = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const format = value => Math.max(0, Math.floor(value || 0)).toLocaleString('en-US');
  const two = value => String(value).padStart(2, '0');
  let lastState = '', lastReadout = 0, toastTimer, restartArmed = false, lastAnnouncement = '';
  let pilot = 'ACE';
  try { pilot = (localStorage.getItem('blackbox_squadron_pilot') || 'ACE').replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0,3) || 'ACE'; } catch (_) {}
  const ship = `<div class="ship-display" aria-hidden="true"><svg viewBox="-60 -65 120 140"><path d="M-10 48 -7 74 -3 48M3 48 7 74 10 48" fill="#87e6ed" opacity=".8"/><path d="M0-59 -9-22 -40 3 -49 25 -25 21 -17 38 -8 33 -7 49 7 49 8 33 17 38 25 21 49 25 40 3 9-22Z" fill="#344b5b" stroke="#7893a3"/><path d="M0-55-6-19-28 10-8 6-5 40 5 40 8 6 28 10 6-19Z" fill="#9db4bf"/><path d="M0-42-4-15-3 6 3 6 4-15Z" fill="#81e5ed"/><path d="M-37 6-40 16-24 14-16 4M37 6 40 16 24 14 16 4" fill="#617e90"/><path d="M-9 35-9 49-3 49-3 35M3 35 3 49 9 49 9 35" fill="#121f28"/><path d="M-33 9-28 9M28 9 33 9" stroke="#edb76c" stroke-width="3"/></svg></div>`;
  const primary = (id, title, arrow = '→') => `<button id="${id}" class="primary-button"><span>${title}</span><span aria-hidden="true">${arrow}</span></button>`;
  const secondary = (id, title) => `<button id="${id}" class="secondary-button"><span>${title}</span><span aria-hidden="true">↗</span></button>`;
  function bind(id, callback) { const el = $(id); if (el) el.addEventListener('click', callback); }
  function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').classList.add('visible'); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3500); }
  function statsMarkup() {
    const stats = campaign.state.stats;
    return `<div class="debrief-grid"><div><b>${format(game.score)}</b><span>SCORE</span></div><div><b>${format(stats.kills)}</b><span>HOSTILES</span></div><div><b>${Math.floor(stats.playTime / 60)}:${two(Math.floor(stats.playTime % 60))}</b><span>FLIGHT TIME</span></div></div>`;
  }
  function savePilot() {
    const input = $('pilot-name');
    if (input) pilot = input.value.replace(/[^a-z0-9]/gi,'').toUpperCase().slice(0,3) || 'ACE';
    try { localStorage.setItem('blackbox_squadron_pilot', pilot); } catch (_) {}
  }
  function focusFlight() { clearAllInput(); canvas.focus({preventScroll:true}); platform.audio.unlock(); }
  function launch() {
    savePilot();
    const difficulty = $('difficulty')?.value || platform.settings.difficulty;
    platform.updateSettings({difficulty});
    if (dialog.open) dialog.close();
    game.state = STATE.START;
    restartGame(); campaign.setDifficulty(difficulty); startGame(); focusFlight(); refresh(true);
  }
  function resume() { if (game.state === STATE.PAUSED) { game.state = STATE.PLAYING; lastTime = performance.now(); accumulator = 0; focusFlight(); refresh(true); } }
  function returnHome() {
    if (game.state === STATE.PLAYING) platform.pause('Flight paused');
    game.state = STATE.START; clearAllInput(); window.BlackboxPointer.active = false;
    refresh(true);
  }
  function resumeCheckpoint() {
    const checkpoint = platform.loadCheckpoint();
    if (!checkpoint || !campaign.restore(checkpoint)) { platform.clearCheckpoint(); refresh(true); toast('Checkpoint unavailable. Launch a new sortie.'); return; }
    focusFlight(); refresh(true); toast(`Checkpoint restored: sector ${two(game.level)}. Stay sharp.`);
  }
  function showScreen() {
    const state = game.state;
    overlay.dataset.state = state;
    overlay.hidden = state === STATE.PLAYING;
    restartArmed = false;
    if (state === STATE.PLAYING) return;
    if (state === STATE.START) {
      const checkpoint = platform.loadCheckpoint();
      screen.innerHTML = `<p class="eyebrow">OPERATION / DEAD SIGNAL</p><h1>BLACKBOX<span>SQUADRON</span></h1>${ship}<p class="brief">A hostile signal. A silent frontier.<br>Take the X-01 beyond the perimeter.</p><div class="pilot-inputs"><label for="pilot-name">CALLSIGN<input id="pilot-name" maxlength="3" value="${clean(pilot)}" autocomplete="off" spellcheck="false" aria-label="Pilot callsign"></label><label for="difficulty">FLIGHT DIFFICULTY<select id="difficulty"><option value="cadet">CADET · forgiving</option><option value="standard">STANDARD</option><option value="ace">ACE · high threat</option></select></label></div>${checkpoint ? primary('continue-button', `CONTINUE · SECTOR ${two(checkpoint.level)}`) + secondary('launch-button','LAUNCH NEW SORTIE') : primary('launch-button','LAUNCH SORTIE')}<p class="screen-footnote"><strong>AUTO-FIRE ${platform.settings.autoFire ? "ENABLED" : "OFF · HOLD FIRE"}</strong> · Move with WASD / arrows<br>Touch: drag the ship or use the directional pad.</p><div class="menu-meta"><span>12 SECTORS</span><span>4 BOSSES</span><span>1 SIGNAL</span></div>`;
      $('difficulty').value = platform.settings.difficulty;
      bind('launch-button',launch); bind('continue-button',resumeCheckpoint);
      $('pilot-name').addEventListener('input', e => { e.target.value = e.target.value.replace(/[^a-z0-9]/gi,'').toUpperCase(); });
      $('pilot-name').addEventListener('keydown', e => { if(e.code === 'Enter') { e.preventDefault(); launch(); } });
    } else if (state === STATE.PAUSED) {
      screen.innerHTML = `<p class="eyebrow">FLIGHT ON HOLD</p><h2>Take a breath, pilot.</h2><p class="brief">Sector ${two(game.level)} · ${clean(campaign.getSector(game.level).name)}<br>Your interceptor is safe while paused.</p>${statsMarkup()}${primary('resume-button','RESUME FLIGHT')}${secondary('pause-settings','FLIGHT SETTINGS')}${secondary('restart-button','RESTART SORTIE')}${secondary('home-button','RETURN TO HANGAR')}<p class="screen-footnote">Continue resumes at the beginning of this sector.<br>Current-sector combat progress is not saved.</p>`;
      bind('resume-button',resume);bind('pause-settings',showSettings);bind('home-button',returnHome);
      bind('restart-button', () => { if (!restartArmed) { restartArmed = true; $('restart-button').firstElementChild.textContent = 'CONFIRM NEW SORTIE'; } else launch(); });
    } else if (state === STATE.LEVEL_CLEAR) {
      const data = campaign.state;
      screen.innerHTML = `<p class="eyebrow">SECTOR ${two(game.level)} SECURED</p><h2>Rearm. Refuel. Advance.</h2><p class="brief">${clean(data.sector.name)} cleared.<br>Choose one field upgrade for this sortie.</p>${statsMarkup()}<div class="upgrade-options">${data.offers.map((offer, i) => `<button class="upgrade-choice" data-upgrade="${i}"><span class="choice-number">${i+1}</span><span><strong>${clean(offer.name)}</strong><small>${clean(offer.description)}</small></span></button>`).join('')}</div><p class="screen-footnote">Press 1, 2, or 3 to select. Repairs and upgrades<br>carry forward for the rest of this sortie.</p>`;
      screen.querySelectorAll('[data-upgrade]').forEach(button => button.addEventListener('click', () => { if (campaign.chooseUpgrade(Number(button.dataset.upgrade))) { focusFlight(); refresh(true); } }));
    } else if (state === STATE.VICTORY) {
      screen.innerHTML = `<p class="eyebrow">TRANSMISSION TERMINATED</p><h2>Signal silenced.</h2><p class="brief">All twelve sectors secured. The frontier is clear.<br>BLACKBOX Squadron, return with honor.</p>${statsMarkup()}${primary('endless-button','ENTER ENDLESS FRONTIER')}${secondary('home-button','RETURN TO HANGAR')}<p class="screen-footnote">Your campaign victory has been recorded locally.</p>`;
      bind('endless-button', () => { campaign.continueEndless(); refresh(true); });bind('home-button',returnHome);
    } else if (state === STATE.GAME_OVER || state === STATE.NAME_ENTRY) {
      screen.innerHTML = `<p class="eyebrow">FLIGHT RECORDER RECOVERED</p><h2>Signal lost.</h2><p class="brief">${clean(pilot)} · Sector ${two(game.level)} · ${clean(campaign.getSector(game.level).name)}</p><div class="result-score">${format(game.score)}</div><p class="eyebrow">FINAL SCORE</p>${statsMarkup()}${primary('retry-button','FLY AGAIN')}${secondary('debrief-scores','VIEW FLIGHT RECORDS')}${secondary('home-button','RETURN TO HANGAR')}<p class="screen-footnote">${platform.storageAvailable ? 'Flight record saved on this device.' : 'Storage unavailable. Records last for this visit.'}</p>`;
      bind('retry-button',launch); bind('debrief-scores',showScores); bind('home-button',returnHome);
    }
  }
  function openDialog(body) {
    if (game.state === STATE.PLAYING) { platform.pause('Flight paused'); refresh(true); }
    clearAllInput(); window.BlackboxPointer.active = false;
    $('dialog-body').innerHTML = body;
    if (!dialog.open) dialog.showModal();
  }
  function showSettings() {
    const settings = platform.settings;
    const check = (id,name,note) => `<label class="setting"><span>${name}<small>${note}</small></span><input type="checkbox" id="setting-${id}" ${settings[id] ? 'checked' : ''}></label>`;
    openDialog(`<h2 id="dialog-title">Flight settings</h2>${check('autoFire','Auto-fire','Keep weapons firing while you concentrate on flight.')}${check('sound','Sound effects','Weapons, impacts, pickups, and cockpit alerts.')}${check('music','Ambient soundtrack','Procedural synth sequencer during flight.') }<label class="setting"><span>Master volume</span><input id="setting-volume" aria-label="Master volume" type="range" min="0" max="1" step="0.05" value="${settings.volume}"></label>${check('reducedMotion','Reduced motion','Reduce particles, screen shake, and flashes.')}${check('gamepad','Gamepad controls','Left stick / D-pad, A fire, B bomb, Start pause.')}<p class="install-note">Install on iPhone: Share → Add to Home Screen. After one complete online load, this game can run offline.</p><p>${platform.storageAvailable ? 'Settings, scores, and sector checkpoints stay in this browser.' : 'Browser storage is unavailable. You can play, but progress may not survive closing this page.'}</p>`);
    ['autoFire','sound','music','reducedMotion','gamepad'].forEach(key => $('setting-'+key).addEventListener('change', e => { platform.updateSettings({[key]:e.target.checked}); updateSoundButton(); }));
    $('setting-volume').addEventListener('input', e => platform.updateSettings({volume:Number(e.target.value)}));
  }
  function showScores() {
    const scores = platform.getScores();
    const p = platform.getProfile();
    openDialog(`<h2 id="dialog-title">Local flight records</h2><p>${format(p.runs)} sorties · ${format(p.wins)} campaign victories · ${format(p.kills)} hostiles destroyed</p>${scores.length ? `<table><thead><tr><th>RANK</th><th>PILOT</th><th>SCORE</th><th>SECTOR</th></tr></thead><tbody>${scores.map((s,i)=>`<tr><td>${two(i+1)}</td><td>${clean(s.name)}</td><td>${format(s.score)}</td><td>${two(s.level)}</td></tr>`).join('')}</tbody></table>` : '<p>No completed flights yet. Your first score belongs here.</p>'}<p>Scores are stored on this device and include previous BLACKBOX releases. This is a local arcade table; scores across difficulties and versions share the same ranking.</p>`);
  }
  function showGuide() {
    openDialog(`<h2 id="dialog-title">Pilot field manual</h2><p>Clear the required hostiles in each sector. Carriers guard sectors 3, 6, 9, and 12. Read their warning lanes, keep moving, and destroy the source of the dead signal.</p><div class="manual-grid"><div><b>STAY MOBILE</b><p>WASD / arrows, touch pad, or drag the ship. Hold Shift for precision movement. The bright center of your ship is its hitbox.</p></div><div><b>BREAK CONTACT</b><p>C or BOMB clears hostile bullets, destroys standard ships, and damages carriers. You have limited ordnance.</p></div><div><b>BUILD YOUR SHIP</b><p>Every clear offers three choices. Hull, engine, reactor, ordnance, and shield upgrades last for this sortie.</p></div><div><b>KEEP THE CHAIN</b><p>Consecutive kills build the score multiplier. Taking damage breaks it. Clean sector clears earn a bonus.</p></div></div><table><thead><tr><th>PICKUP</th><th>LOADOUT EFFECT</th></tr></thead><tbody><tr><td>S / SPREAD</td><td>Side cannons</td></tr><tr><td>R / RAPID</td><td>Faster firing cycle</td></tr><tr><td>H / SHIELD</td><td>Absorb an incoming hit</td></tr><tr><td>B / BOMB</td><td>Replenish ordnance</td></tr><tr><td>L / REPAIR</td><td>Recover one hull point</td></tr><tr><td>$ / INTEL</td><td>Bonus score</td></tr><tr><td>P / RAIL</td><td>Piercing rail cannon</td></tr><tr><td>D / DRONE</td><td>Support fire</td></tr></tbody></table><p>Checkpoints save at sector entry. Continue restarts that sector with its starting equipment and score. Death ends that sortie. Complete the campaign to unlock endless flight for that run.</p>`);
  }
  function updateSoundButton() { const on = platform.settings.sound || platform.settings.music; $('sound-toggle').textContent = on ? 'SOUND ON' : 'SOUND OFF'; $('sound-toggle').setAttribute('aria-label',on ? 'Mute sound' : 'Enable sound'); }
  function refresh(force = false) {
    if (game.state !== lastState || force) {
      const previous = lastState; lastState = game.state; showScreen();
      $('pause-button').hidden = game.state !== STATE.PLAYING;
      $('flight-state').textContent = ({start:'SYSTEMS READY',playing:'LIVE FLIGHT',paused:'FLIGHT PAUSED',levelclear:'SECTOR SECURED',gameover:'SIGNAL LOST',nameentry:'SIGNAL LOST',victory:'MISSION COMPLETE'})[game.state] || 'SYSTEMS READY';
      $('touch').classList.toggle('inactive',game.state !== STATE.PLAYING);
      platform.audio.setPaused(game.state === STATE.PAUSED);
      if (previous === STATE.PLAYING && game.state !== STATE.PLAYING) { clearAllInput(); window.BlackboxPointer.active = false; }
    }
    const now = performance.now();
    if (!force && now - lastReadout < 140) return;
    lastReadout = now;
    const data = campaign.state, profile = platform.getProfile();
    $('record-score').textContent = String(Math.max(profile.bestScore,game.highScore)).padStart(6,'0');
    $('record-sorties').textContent = format(profile.runs); $('record-sector').textContent = two(Math.max(profile.highestLevel, game.level));
    $('hull-label').textContent = `${player.lives} / ${player.maxLives}`; $('bomb-label').textContent = two(player.bombs); $('touch-bombs').textContent = player.bombs;
    const hullMarkup = Array.from({length:player.maxLives},(_,i)=>`<i${i>=player.lives?' class="empty"':''}></i>`).join('');
    if ($('hull-meter').innerHTML !== hullMarkup) $('hull-meter').innerHTML = hullMarkup;
    $('status-label').textContent = game.state === STATE.PLAYING ? 'ACTIVE' : 'STANDBY';
    const upgrades = Object.entries(data.upgrades || {}).filter(([,value])=>value>0);
    $('upgrade-count').textContent = two(upgrades.reduce((n,[,v])=>n+v,0));
    $('upgrade-list').textContent = upgrades.length ? upgrades.map(([k,v])=>`${k.toUpperCase()} ${v}`).join(' · ') : 'Standard flight configuration';
    const completed = data.stats.sectorsCleared;
    $('route-progress').textContent = `${two(Math.min(12,completed))} / 12`;
    const routeKey = `${game.level}:${completed}`;
    if ($('sector-route').dataset.route !== routeKey) {
      $('sector-route').dataset.route = routeKey;
      $('sector-route').innerHTML = Array.from({length:12},(_,i)=>{ const n=i+1,s=campaign.getSector(n); return `<li class="${n<=completed?'cleared':n===game.level?'current':''}"${n===game.level?' aria-current="step"':''}><span class="sector-number">${n<=completed?'✓':two(n)}</span><span>${clean(s.name)}</span>${s.boss?'<span class="boss-marker">BOSS</span>':''}</li>`; }).join('');
    }
  }

  // DOM menus replace tiny canvas-only buttons without replacing the game loop.
  drawStart = drawPaused = drawLevelClear = drawGameOver = drawNameEntry = function () {};
  const originalToggle = toggleStartPause;
  toggleStartPause = function () {
    if (dialog.open) return;
    if (game.state === STATE.START || game.state === STATE.GAME_OVER) { launch(); return; }
    if (game.state === STATE.PAUSED) { resume(); return; }
    originalToggle(); clearAllInput(); refresh(true);
  };
  const originalGlobalInput = handleGlobalInput;
  handleGlobalInput = function () {
    if (dialog.open) { clearAllInput(); return; }
    if (game.state === STATE.PAUSED && consume('KeyR')) { $('restart-button')?.click(); return; }
    originalGlobalInput();
  };
  const originalEnd = endGame;
  endGame = function () {
    originalEnd();
    if (game.state === STATE.NAME_ENTRY) { nameEntry.chars = pilot.padEnd(3,'X').split(''); submitNameEntry(); }
    refresh(true);
  };
  window.addEventListener('blackbox:campaign',event => {
    const data = event.detail || {};
    if (data.type === 'victory') addScoreboardEntry(pilot,game.score,game.level);
    if (data.type === 'boss-encounter') toast('CARRIER CONTACT · Read the warning lanes.');
    if (data.type === 'sector-start' && game.level === 1 && lastAnnouncement !== data.runId) { lastAnnouncement=data.runId; toast('Move with WASD / arrows or drag the ship. C / BOMB clears incoming fire.'); }
    // State has settled by the next frame; do not rerender a button while handling its click.
  });
  platform.subscribe(event => {
    updateSoundButton();
    if (event.type === 'offline-ready') toast('Flight systems cached. Offline play ready.');
    if (event.type === 'update-ready') toast('A new flight build is ready. Reload from the hangar to update.');
  });
  bind('settings-open',showSettings);bind('guide-open',showGuide);bind('scores-open',showScores);
  bind('pause-button',()=>toggleStartPause());
  bind('dialog-close',()=>dialog.close());
  dialog.addEventListener('close',()=>{ clearAllInput(); refresh(true); });
  bind('sound-toggle',()=>{ const on=platform.settings.sound || platform.settings.music; platform.updateSettings({sound:!on,music:!on}); platform.audio.unlock(); updateSoundButton(); });
  bind('fullscreen-button',async()=>{ try { if(document.fullscreenElement) await document.exitFullscreen(); else if(document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); else toast('For full screen on iPhone, add BLACKBOX to your Home Screen.'); } catch(_) { toast('Fullscreen is not available in this browser.'); } });

  // Relative dragging preserves the initial finger offset and independent FIRE/BOMB touches.
  const pointer = window.BlackboxPointer = {active:false,x:W/2,y:H-80};
  let pointerId = null, origin = null;
  canvas.addEventListener('pointerdown',event=>{
    if(game.state!==STATE.PLAYING || pointerId!==null || event.button>0)return;
    event.preventDefault(); pointerId=event.pointerId; const rect=canvas.getBoundingClientRect();
    origin={clientX:event.clientX,clientY:event.clientY,x:player.x,y:player.y,scaleX:W/rect.width,scaleY:H/rect.height};
    pointer.x=player.x;pointer.y=player.y;pointer.active=true;canvas.setPointerCapture(event.pointerId);canvas.focus({preventScroll:true});
  });
  canvas.addEventListener('pointermove',event=>{
    if(event.pointerId!==pointerId||!pointer.active)return;
    pointer.x=Math.max(14,Math.min(W-14,origin.x+(event.clientX-origin.clientX)*origin.scaleX));
    pointer.y=Math.max(H*.28,Math.min(H-65,origin.y+(event.clientY-origin.clientY)*origin.scaleY));
  });
  const release=event=>{ if(!event||event.pointerId===pointerId){pointerId=null;pointer.active=false;origin=null;} };
  ['pointerup','pointercancel','lostpointercapture'].forEach(name=>canvas.addEventListener(name,release));
  window.addEventListener('blur',()=>release());
  document.addEventListener('visibilitychange',()=>{if(document.hidden)release();});
  $('touch').addEventListener('contextmenu',e=>e.preventDefault());
  window.BlackboxUI={refresh,toast,launch,showSettings,showGuide,showScores};
  updateSoundButton();refresh(true);
})();
