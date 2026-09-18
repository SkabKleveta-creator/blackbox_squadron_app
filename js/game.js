"use strict";

   /* =========================================================
BLACKBOX SQUADRON — v0.5.0 core (derived from v0.2.3)
Progression, hull upgrades, power-up timers, and local
arcade scoreboard (top 10, localStorage, name entry).
Start-flow, shield, rail, and level-flow stabilization release.
Single-file vertical arcade shooter with level director,
power-up system, difficulty bands, modifiers, touch controls.
No libraries. No assets. Canvas only.
========================================================= */

   const canvas = document.getElementById("game");
   const ctx = canvas.getContext("2d");
   const W = canvas.width;
   const H = canvas.height;

   /* -------- Persistence -------- */

   const HS_KEY = "blackbox_squadron_highscore";

   function loadHighScore() {
     try {
       const value = Number(localStorage.getItem(HS_KEY));
       return Number.isFinite(value) ? Math.max(0, Math.min(999999999, Math.floor(value))) : 0;
     } catch (e) {
       return 0;
     }
   }
   function saveHighScore(v) {
     try {
       localStorage.setItem(HS_KEY, String(v));
     } catch (e) {}
   }

   /* -------- Local Arcade Scoreboard --------
      Top 10 local scores in localStorage. This is an
      arcade-cabinet table, not an online leaderboard. */

   const SCOREBOARD_KEY = "blackbox_squadron_scoreboard_v1";
   const NAME_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

   function loadScoreboard() {
     try {
       const raw = JSON.parse(localStorage.getItem(SCOREBOARD_KEY));
       if (!Array.isArray(raw)) return [];
       return raw
         .filter((e) => e && Number.isFinite(e.score) && e.score >= 0)
         .map((e) => ({
           name: String(e.name || "ACE").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3) || "ACE",
           score: Math.min(999999999, Math.floor(e.score)),
           level: Number.isFinite(e.level) ? Math.max(1, Math.min(9999, Math.floor(e.level))) : 1,
         }))
         .sort((a, b) => b.score - a.score)
         .slice(0, 10);
     } catch (e) {
       return [];
     }
   }

   function saveScoreboard(board) {
     try {
       localStorage.setItem(SCOREBOARD_KEY, JSON.stringify(board));
     } catch (e) {}
   }

   let scoreboardCache = loadScoreboard();

   function qualifiesForScoreboard(score) {
     if (score <= 0) return false;
     if (scoreboardCache.length < 10) return true;
     return score > scoreboardCache[scoreboardCache.length - 1].score;
   }

   function addScoreboardEntry(name, score, level) {
     const board = loadScoreboard();
     board.push({
       name: String(name || "ACE").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3) || "ACE",
       score: score,
       level: level,
     });
     board.sort((a, b) => b.score - a.score);
     scoreboardCache = board.slice(0, 10);
     saveScoreboard(scoreboardCache);
     // Keep the legacy single high score in sync
     if (scoreboardCache[0].score > loadHighScore()) {
       saveHighScore(scoreboardCache[0].score);
     }
     game.highScore = Math.max(game.highScore, scoreboardCache[0].score);
     return scoreboardCache;
   }

   function scoreboardLines(count) {
     const board = scoreboardCache.slice(0, count);
     if (!board.length) return [];
     const lines = [{ text: "TOP PILOTS", color: "#ffb454" }];
     for (const e of board) {
       lines.push({
         text:
           e.name.padEnd(3, " ") +
           "  " +
           String(e.score).padStart(7, " ") +
           "  L" +
           e.level,
         color: "#9aa7c4",
       });
     }
     return lines;
   }

   /* -------- Difficulty Bands & Modifiers -------- */

   const DIFFICULTY_BANDS = {
     1: "Training Fire",
     2: "Training Fire",
     3: "Live Contact",
     4: "Live Contact",
     5: "Hot Zone",
     6: "Hot Zone",
     7: "Kill Box",
     8: "Kill Box",
     9: "Black Sky",
     10: "Black Sky",
   };

   function getDifficultyBand(level) {
     if (level >= 11) return "Endless War";
     return DIFFICULTY_BANDS[level] || "Endless War";
   }

   const MODIFIERS = [
     "Standard Patrol",
     "Swarm Bloom",
     "Ace Squadron",
     "Scrap Storm",
     "Bullet Weather",
     "Overclock",
     "Carrier Lane",
     "Recovery Run",
   ];

   function getModifier(level) {
     return MODIFIERS[(level - 1) % MODIFIERS.length];
   }

   /* -------- Level Director -------- */

   function getKillsNeeded(level) {
     // L1-6: 10,13,16,19,22,25. Then +5 per level, capped at 75.
     if (level <= 6) {
       return 10 + (level - 1) * 3;
     }
     return Math.min(75, 25 + (level - 6) * 5);
   }

   function getLevelPlan(level) {
     const band = getDifficultyBand(level);
     const mod = getModifier(level);

     const bandCoeff = {
       "Training Fire": 1.0,
       "Live Contact": 1.3,
       "Hot Zone": 1.7,
       "Kill Box": 2.1,
       "Black Sky": 2.6,
       "Endless War": 3.0,
     };

     const coeff = bandCoeff[band] || 1.0;

     let enemyMix = { fighter: 0.5, sweeper: 0.35, bomber: 0.15 };
     let spawnIntervalMult = 1.0;
     let obstacleRateMult = 1.0;
     let dropBias = {};

     switch (mod) {
       case "Swarm Bloom":
         spawnIntervalMult = 0.7;
         enemyMix = { fighter: 0.7, sweeper: 0.2, bomber: 0.1 };
         break;
       case "Ace Squadron":
         spawnIntervalMult = 0.9;
         enemyMix = { fighter: 0.2, sweeper: 0.3, bomber: 0.5 };
         dropBias = { shield: 0.15 };
         break;
       case "Scrap Storm":
         obstacleRateMult = 1.4;
         dropBias = { rapid: 0.12 };
         break;
       case "Bullet Weather":
         dropBias = { shield: 0.18 };
         break;
       case "Overclock":
         spawnIntervalMult = 0.8;
         enemyMix = { fighter: 0.3, sweeper: 0.4, bomber: 0.3 };
         break;
       case "Carrier Lane":
         enemyMix = { fighter: 0.2, sweeper: 0.2, bomber: 0.6 };
         dropBias = { bomb: 0.08 };
         break;
       case "Recovery Run":
         dropBias = { repair: 0.14, bomb: 0.1 };
         break;
     }

     return {
       band: band,
       modifier: mod,
       difficultyCoeff: coeff,
       enemyMix: enemyMix,
       spawnIntervalMult: spawnIntervalMult,
       obstacleRateMult: obstacleRateMult,
       dropBias: dropBias,
     };
   }

   /* -------- Input -------- */

   const keys = {};
   const pressed = {};

   window.addEventListener("keydown", (e) => {
     if (e.target && (e.target.matches?.("input,select,textarea") || e.target.isContentEditable)) return;
     if (e.target?.closest?.("button") && ["Space", "Enter"].includes(e.code)) return;
     if (
       ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(
         e.key,
       )
     ) {
       e.preventDefault();
     }
     if (!keys[e.code]) pressed[e.code] = true;
     keys[e.code] = true;
   });
   window.addEventListener("keyup", (e) => {
     keys[e.code] = false;
   });

   function consume(code) {
     if (pressed[code]) {
       pressed[code] = false;
       return true;
     }
     return false;
   }

   /* -------- Touch Input -------- */

   const touchInput = {
     up: false,
     down: false,
     left: false,
     right: false,
     fire: false,
   };

   function clearAllInput() {
     for (const k in keys) keys[k] = false;
     for (const k in pressed) pressed[k] = false;
     touchInput.up =
       touchInput.down =
       touchInput.left =
       touchInput.right =
       touchInput.fire =
         false;
   }

   window.addEventListener("blur", clearAllInput);
   document.addEventListener("visibilitychange", () => {
     if (document.hidden) clearAllInput();
   });

   function bindHold(el, set) {
     const pointers = new Set();
     const sync = () => set(pointers.size > 0);
     const down = (e) => {
       e.preventDefault();
       pointers.add(e.pointerId);
       if (el.setPointerCapture) {
         try { el.setPointerCapture(e.pointerId); } catch (err) {}
       }
       sync();
     };
     const up = (e) => {
       e.preventDefault();
       pointers.delete(e.pointerId);
       sync();
     };
     el.addEventListener("pointerdown", down);
     el.addEventListener("pointerup", up);
     el.addEventListener("pointercancel", up);
     el.addEventListener("lostpointercapture", up);
     window.addEventListener("pointerup", up);
     window.addEventListener("pointercancel", up);
     window.addEventListener("blur", () => { pointers.clear(); sync(); });
     document.addEventListener("visibilitychange", () => { if (document.hidden) { pointers.clear(); sync(); } });
   }

   function bindTap(el, fn) {
     el.addEventListener("click", () => fn());
   }

   function initTouchControls() {
     const layer = document.getElementById("touch");
     if (!layer) return;

     window.addEventListener(
       "touchstart",
       () => layer.classList.add("show"),
       { once: true, passive: true },
     );
     layer.addEventListener("contextmenu", (e) => e.preventDefault());

     bindHold(document.getElementById("t-up"), (v) => (touchInput.up = v));
     bindHold(
       document.getElementById("t-down"),
       (v) => (touchInput.down = v),
     );
     bindHold(
       document.getElementById("t-left"),
       (v) => (touchInput.left = v),
     );
     bindHold(
       document.getElementById("t-right"),
       (v) => (touchInput.right = v),
     );
     bindHold(
       document.getElementById("t-fire"),
       (v) => (touchInput.fire = v),
     );

     bindTap(document.getElementById("t-bomb"), triggerBomb);
     bindTap(document.getElementById("t-start"), toggleStartPause);
     bindTap(document.getElementById("t-rst"), restartGame);
   }

   /* -------- Game State -------- */

   const STATE = {
     START: "start",
     PLAYING: "playing",
     PAUSED: "paused",
     LEVEL_CLEAR: "levelclear",
     GAME_OVER: "gameover",
     NAME_ENTRY: "nameentry",
   };

   const game = {
     state: STATE.START,
     score: 0,
     highScore: loadHighScore(),
     level: 1,
     killsThisLevel: 0,
     killsNeeded: 10,
     levelClearTimer: 0,
     graceTimer: 0,
     shake: 0,
     flash: 0,
     time: 0,
     levelPlan: null,
     lastHealthRewardLevel: 0,
     hullUpgradeEarned: false,
     levelIntroTimer: 0,
   };
   // Legacy HS_KEY remains the fallback; the scoreboard top
   // score wins if it is higher.
   game.highScore = Math.max(
     game.highScore,
     (scoreboardCache[0] || { score: 0 }).score,
   );

   /* -------- Player -------- */

   const player = {
     x: W / 2,
     y: H - 80,
     r: 10,
     speed: 260,
     lives: 3,
     bombs: 3,
     maxBombs: 3,
     maxLives: 3,
     fireCooldown: 0,
     fireRate: 0.16,
     baseFireRate: 0.16,
     invuln: 0,
     spreadTimer: 0,
     rapidTimer: 0,
     railTimer: 0,
     droneTimer: 0,
     shieldHp: 0,
     alive: true,
   };

   /* -------- Entity Pools -------- */

   let playerBullets = [];
   let enemyBullets = [];
   let enemies = [];
   let particles = [];
   let powerups = [];
   let obstacles = [];
   let stars = [];

   /* -------- Starfield -------- */

   function initStars() {
     stars = [];
     for (let i = 0; i < 90; i++) {
       const layer = i % 3;
       stars.push({
         x: Math.random() * W,
         y: Math.random() * H,
         speed: 30 + layer * 45,
         size: 1 + layer * 0.6,
         bright: 0.25 + layer * 0.3,
       });
     }
   }

   function updateStars(dt) {
     for (const s of stars) {
       s.y += s.speed * dt;
       if (s.y > H) {
         s.y = -2;
         s.x = Math.random() * W;
       }
     }
   }

   function drawStars() {
     for (const s of stars) {
       ctx.fillStyle = "rgba(180, 200, 230," + s.bright + ")";
       ctx.fillRect(s.x, s.y, s.size, s.size);
     }
   }

   /* -------- Power-up Types & Drop Logic -------- */

   const POWERUP_TYPES = {
     spread: { color: "#6ee77a", label: "S", duration: 10 },
     rapid: { color: "#ffb454", label: "R", duration: 8 },
     shield: { color: "#6fd6ff", label: "H", duration: 0 },
     bomb: { color: "#ff4d5e", label: "B", duration: 0 },
     repair: { color: "#ffd27a", label: "L", duration: 0 },
     score: { color: "#c48a5a", label: "$", duration: 0 },
     rail: { color: "#9fd6ff", label: "P", duration: 6 },
     drone: { color: "#d6a0ff", label: "D", duration: 8 },
   };

   function getDefaultDropBias() {
     return {
       spread: 0.22,
       rapid: 0.1,
       shield: 0.12,
       bomb: 0.1,
       repair: 0.08,
       score: 0.18,
       rail: 0.06,
       drone: 0.08,
     };
   }

   function choosePowerupType() {
     let bias = getDefaultDropBias();

     // Apply level modifier bias
     const levelPlan = game.levelPlan;
     if (levelPlan && levelPlan.dropBias) {
       for (const key in levelPlan.dropBias) {
         if (bias[key] !== undefined) {
           bias[key] += levelPlan.dropBias[key];
         }
       }
     }

     // Dynamic bias: prefer what we need
     if (player.lives < player.maxLives) bias.repair += 0.1;
     if (player.bombs < player.maxBombs) bias.bomb += 0.1;
     if (player.bombs === 0) bias.bomb += 0.15;
     if (player.lives <= 1) bias.shield += 0.15;
     if (game.level >= 5) {
       bias.bomb += 0.05;
       bias.shield += 0.05;
     }
     if (game.level < 3) {
       bias.rail *= 0.5;
       bias.drone *= 0.5;
     }

     // Normalize & roll
     let sum = 0;
     for (const type in bias) sum += bias[type];

     if (sum <= 0) return "score";

     const rand = Math.random() * sum;
     let cumulative = 0;
     for (const type in bias) {
       cumulative += bias[type];
       if (rand < cumulative) return type;
     }
     return "score";
   }

   function getDropChance() {
     if (game.level <= 3) return 0.12;
     if (game.level <= 7) return 0.14;
     return 0.16;
   }

   function dropPowerupForEnemy(x, y) {
     if (Math.random() < getDropChance()) {
       const type = choosePowerupType();
       powerups.push({
         x: x,
         y: y,
         vy: 70,
         r: 9,
         type: type,
         t: 0,
       });
     }
   }

   /* -------- Enemies -------- */

   function levelSpeedScale() {
     const plan = game.levelPlan;
     if (!plan) return 1 + (game.level - 1) * 0.1;
     return plan.difficultyCoeff;
   }

   function spawnEnemy() {
     const plan = game.levelPlan;
     const mix = plan
       ? plan.enemyMix
       : { fighter: 0.5, sweeper: 0.35, bomber: 0.15 };

     const rand = Math.random();
     let type;
     let cumulative = 0;
     for (const t in mix) {
       cumulative += mix[t];
       if (rand < cumulative) {
         type = t;
         break;
       }
     }
     type = type || "fighter";

     const sp = levelSpeedScale();
     const e = {
       type: type,
       r: 12,
       hp: 1,
       fireTimer: 1.2 + Math.random() * 2.0,
       t: 0,
       score: 100,
     };

     if (type === "fighter") {
       e.x = 40 + Math.random() * (W - 80);
       e.y = -20;
       e.vy = (55 + Math.random() * 30) * sp;
       e.swayAmp = 30 + Math.random() * 30;
       e.swayFreq = 1 + Math.random();
       e.baseX = e.x;
       e.hp = 1;
       e.score = 100;
     } else if (type === "bomber") {
       e.x = 60 + Math.random() * (W - 120);
       e.y = -24;
       e.vy = 45 * sp;
       e.phase = "drift";
       e.diveDelay = 1.4 + Math.random() * 1.2;
       e.r = 14;
       e.hp = 2;
       e.score = 250;
     } else {
       const fromLeft = Math.random() < 0.5;
       e.x = fromLeft ? -20 : W + 20;
       e.y = 60 + Math.random() * 160;
       e.vx = (fromLeft ? 1 : -1) * (90 + Math.random() * 40) * sp;
       e.baseY = e.y;
       e.swayAmp = 24 + Math.random() * 20;
       e.swayFreq = 2 + Math.random();
       e.r = 11;
       e.hp = 1;
       e.score = 150;
     }
     enemies.push(e);
   }

   function updateEnemies(dt) {
     for (const e of enemies) {
       e.t += dt;

       if (e.type === "fighter") {
         e.y += e.vy * dt;
         e.x = e.baseX + Math.sin(e.t * e.swayFreq * 2) * e.swayAmp;
       } else if (e.type === "bomber") {
         if (e.phase === "drift") {
           e.y += e.vy * dt;
           if (e.t > e.diveDelay && e.y > 60) {
             e.phase = "dive";
             const dx = player.x - e.x;
             const clampedDx = Math.max(-140, Math.min(140, dx));
             e.vx = clampedDx * 0.9;
             e.vy = 190 * levelSpeedScale();
           }
         } else {
           e.x += e.vx * dt;
           e.y += e.vy * dt;
         }
       } else {
         e.x += e.vx * dt;
         e.y = e.baseY + Math.sin(e.t * e.swayFreq) * e.swayAmp;
       }

       if (game.graceTimer <= 0 && enemyBullets.length < 40) {
         e.fireTimer -= dt;
         const onScreen =
           e.x > 10 && e.x < W - 10 && e.y > 10 && e.y < H * 0.7;
         if (e.fireTimer <= 0 && onScreen && e.y < player.y - 60) {
           enemyFire(e);
           e.fireTimer =
             (2.2 + Math.random() * 2.2) / (0.85 + game.level * 0.05);
         }
       }
     }

     enemies = enemies.filter(
       (e) => e.y < H + 40 && e.x > -60 && e.x < W + 60,
     );
   }

   function enemyFire(e) {
     const speed = 110 + game.level * 8;
     if (e.type === "bomber") {
       const dx = player.x - e.x;
       const dy = player.y - e.y;
       const len = Math.hypot(dx, dy) || 1;
       enemyBullets.push({
         x: e.x,
         y: e.y + e.r,
         vx: (dx / len) * speed * 0.85,
         vy: Math.max(60, (dy / len) * speed * 0.85),
         r: 4,
       });
     } else {
       enemyBullets.push({ x: e.x, y: e.y + e.r, vx: 0, vy: speed, r: 4 });
     }
   }

   function drawEnemies() {
     for (const e of enemies) {
       ctx.save();
       ctx.translate(e.x, e.y);
       if (e.type === "fighter") {
         ctx.fillStyle = "#9aa7c4";
         ctx.beginPath();
         ctx.moveTo(0, 12);
         ctx.lineTo(-10, -8);
         ctx.lineTo(0, -3);
         ctx.lineTo(10, -8);
         ctx.closePath();
         ctx.fill();
         ctx.fillStyle = "#ff4d5e";
         ctx.fillRect(-2, -2, 4, 4);
       } else if (e.type === "bomber") {
         ctx.fillStyle = e.phase === "dive" ? "#ff7a3d" : "#c48a5a";
         ctx.beginPath();
         ctx.moveTo(0, 14);
         ctx.lineTo(-13, -6);
         ctx.lineTo(-5, -10);
         ctx.lineTo(5, -10);
         ctx.lineTo(13, -6);
         ctx.closePath();
         ctx.fill();
         ctx.fillStyle = "#2a1a10";
         ctx.fillRect(-3, -4, 6, 8);
       } else {
         ctx.fillStyle = "#7fd6c2";
         ctx.beginPath();
         ctx.moveTo(-12, 0);
         ctx.lineTo(0, -8);
         ctx.lineTo(12, 0);
         ctx.lineTo(0, 8);
         ctx.closePath();
         ctx.fill();
         ctx.fillStyle = "#0c2b24";
         ctx.fillRect(-2, -2, 4, 4);
       }
       ctx.restore();
     }
   }

   /* -------- Spawning -------- */

   let spawnTimer = 0;

   function isFinalPush() {
     return game.killsThisLevel >= game.killsNeeded * 0.75;
   }

   function spawnInterval() {
     const plan = game.levelPlan;
     let base = Math.max(0.55, 1.6 - (game.level - 1) * 0.12);
     if (plan && plan.spawnIntervalMult) {
       base *= plan.spawnIntervalMult;
     }
     // Final push: last quarter of the objective tightens spawns
     // slightly. Spawn interval only; fire rate untouched.
     if (isFinalPush()) base *= 0.8;
     return base;
   }

   function maxEnemies() {
     return Math.min(14, 4 + Math.floor(game.level * 1.2));
   }

   function updateSpawning(dt) {
     if (game.killsThisLevel >= game.killsNeeded) return;

     spawnTimer -= dt;
     if (spawnTimer <= 0 && enemies.length < maxEnemies()) {
       spawnEnemy();
       spawnTimer = spawnInterval() * (0.8 + Math.random() * 0.4);
     }
   }

   /* -------- Player -------- */

   function updatePlayer(dt) {
     let dx = 0,
       dy = 0;
     if (keys["ArrowLeft"] || keys["KeyA"] || touchInput.left) dx -= 1;
     if (keys["ArrowRight"] || keys["KeyD"] || touchInput.right) dx += 1;
     if (keys["ArrowUp"] || keys["KeyW"] || touchInput.up) dy -= 1;
     if (keys["ArrowDown"] || keys["KeyS"] || touchInput.down) dy += 1;
     const pad = window.BBPlatform?.gamepadInput;
     if (pad) { dx += pad.dx || 0; dy += pad.dy || 0; }
     const magnitude = Math.hypot(dx, dy);
     if (magnitude > 1) { dx /= magnitude; dy /= magnitude; }
     const focus = keys.ShiftLeft || keys.ShiftRight;
     const speed = player.speed * (focus ? 0.48 : 1);
     player.x += dx * speed * dt;
     player.y += dy * speed * dt;
     if (window.BlackboxPointer?.active) {
       const target = window.BlackboxPointer;
       const distance = Math.hypot(target.x-player.x, target.y-player.y);
       const fraction = distance > 0 ? Math.min(1, player.speed * 1.8 * dt / distance) : 0;
       player.x += (target.x-player.x)*fraction;
       player.y += (target.y-player.y)*fraction;
     }
     player.x = Math.max(14, Math.min(W - 14, player.x));
     player.y = Math.max(H * 0.28, Math.min(H - 65, player.y));

     let fireRate = player.baseFireRate;
     if (player.rapidTimer > 0) {
       fireRate *= 0.6;
     }

     player.fireCooldown -= dt;
     if ((keys["Space"] || touchInput.fire || pad?.fire || window.BBPlatform?.settings.autoFire) && player.fireCooldown <= 0) {
       firePlayer();
       player.fireCooldown = Math.max(-0.02, player.fireCooldown) + fireRate;
     }

     if (player.invuln > 0) player.invuln -= dt;
     if (player.spreadTimer > 0) player.spreadTimer -= dt;
     if (player.rapidTimer > 0) player.rapidTimer -= dt;
     if (player.railTimer > 0) player.railTimer -= dt;
     if (player.droneTimer > 0) player.droneTimer -= dt;
   }

   function firePlayer() {
     if (!player.alive || game.state !== STATE.PLAYING || playerBullets.length >= 220) return;
     const v = 520;

     playerBullets.push({
       x: player.x,
       y: player.y - 14,
       vx: 0,
       vy: -v,
       r: 3,
       damage: 1,
     });

     if (player.spreadTimer > 0) {
       playerBullets.push({
         x: player.x - 6,
         y: player.y - 10,
         vx: -130,
         vy: -v * 0.92,
         r: 3,
         damage: 1,
       });
       playerBullets.push({
         x: player.x + 6,
         y: player.y - 10,
         vx: 130,
         vy: -v * 0.92,
         r: 3,
         damage: 1,
       });
     }

     if (player.railTimer > 0) {
       playerBullets.push({
         x: player.x,
         y: player.y - 18,
         vx: 0,
         vy: -v * 1.25,
         r: 5,
         damage: 2,
         pierce: true,
         rail: true,
       });
     }

     if (player.droneTimer > 0) {
       playerBullets.push({
         x: player.x - 12,
         y: player.y - 8,
         vx: -150,
         vy: -v * 0.9,
         r: 3,
         damage: 1,
         drone: true,
       });
       playerBullets.push({
         x: player.x + 12,
         y: player.y - 8,
         vx: 150,
         vy: -v * 0.9,
         r: 3,
         damage: 1,
         drone: true,
       });
     }
   }

   function drawPlayer() {
     if (!player.alive) return;
     if (player.invuln > 0 && Math.floor(game.time * 12) % 2 === 0) return;

     ctx.save();
     ctx.translate(player.x, player.y);

     ctx.fillStyle = "#e8edf7";
     ctx.beginPath();
     ctx.moveTo(0, -14);
     ctx.lineTo(-10, 10);
     ctx.lineTo(-4, 6);
     ctx.lineTo(0, 10);
     ctx.lineTo(4, 6);
     ctx.lineTo(10, 10);
     ctx.closePath();
     ctx.fill();

     ctx.fillStyle = "#6fd6ff";
     ctx.fillRect(-2, -8, 4, 8);

     ctx.fillStyle = Math.random() < 0.5 ? "#ffb454" : "#ff7a3d";
     ctx.fillRect(-2, 10, 4, 4 + Math.random() * 4);

     if (player.spreadTimer > 0) {
       ctx.fillStyle = "#6ee77a";
       ctx.fillRect(-11, 6, 3, 3);
       ctx.fillRect(8, 6, 3, 3);
     }

     if (player.shieldHp > 0) {
       ctx.strokeStyle = "rgba(111, 214, 255, 0.6)";
       ctx.lineWidth = 2;
       ctx.beginPath();
       ctx.arc(0, 0, 18, 0, Math.PI * 2);
       ctx.stroke();
     }

     if (player.rapidTimer > 0) {
       ctx.strokeStyle = "rgba(255, 180, 84, 0.5)";
       ctx.lineWidth = 1;
       ctx.beginPath();
       ctx.arc(0, 0, 14, 0, Math.PI * 2);
       ctx.stroke();
     }

     if (player.railTimer > 0) {
       ctx.strokeStyle = "rgba(159, 214, 255, 0.7)";
       ctx.lineWidth = 1;
       ctx.beginPath();
       ctx.moveTo(-5, -12);
       ctx.lineTo(5, -12);
       ctx.stroke();
     }

     if (player.droneTimer > 0) {
       ctx.fillStyle = "rgba(214, 160, 255, 0.6)";
       ctx.fillRect(-9, -8, 3, 3);
       ctx.fillRect(6, -8, 3, 3);
     }

     ctx.restore();
   }

   /* -------- Bullets -------- */

   function updateBullets(dt) {
     for (const b of playerBullets) {
       b.previousX = b.x; b.previousY = b.y;
       b.x += b.vx * dt;
       b.y += b.vy * dt;
     }
     for (const b of enemyBullets) {
       b.previousX = b.x; b.previousY = b.y;
       b.x += b.vx * dt;
       b.y += b.vy * dt;
     }
     playerBullets = playerBullets.filter(
       (b) => b.y > -20 && b.x > -20 && b.x < W + 20,
     );
     enemyBullets = enemyBullets.filter(
       (b) => b.y > -80 && b.y < H + 20 && b.x > -20 && b.x < W + 20,
     );
   }

   function drawBullets() {
     for (const b of playerBullets) {
       if (b.rail) {
         ctx.fillStyle = "#9fd6ff";
         ctx.fillRect(b.x - 3, b.y - 12, 6, 20);
         ctx.fillStyle = "#e8f6ff";
         ctx.fillRect(b.x - 1, b.y - 14, 2, 24);
       } else if (b.drone) {
         ctx.fillStyle = "#d6a0ff";
         ctx.fillRect(b.x - 2, b.y - 6, 4, 10);
       } else {
         ctx.fillStyle = "#e8f6ff";
         ctx.fillRect(b.x - 2, b.y - 6, 4, 10);
       }
     }
     for (const b of enemyBullets) {
       ctx.fillStyle = "#ff4d5e";
       ctx.beginPath();
       ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
       ctx.fill();
       ctx.fillStyle = "#ffd2d7";
       ctx.beginPath();
       ctx.arc(b.x, b.y, 1.6, 0, Math.PI * 2);
       ctx.fill();
     }
   }

   /* -------- Particles -------- */

   function spawnExplosion(x, y, color, count) {
     count = Math.min(count, Math.max(0, 450 - particles.length));
     if (window.BBPlatform?.settings.reducedMotion) count = Math.ceil(count / 3);
     for (let i = 0; i < count; i++) {
       const a = Math.random() * Math.PI * 2;
       const sp = 40 + Math.random() * 180;
       particles.push({
         x: x,
         y: y,
         vx: Math.cos(a) * sp,
         vy: Math.sin(a) * sp,
         life: 0.35 + Math.random() * 0.4,
         maxLife: 0.75,
         size: 1 + Math.random() * 3,
         color: color,
       });
     }
   }

   function updateParticles(dt) {
     for (const p of particles) {
       p.x += p.vx * dt;
       p.y += p.vy * dt;
       p.vx *= 0.96;
       p.vy *= 0.96;
       p.life -= dt;
     }
     particles = particles.filter((p) => p.life > 0);
   }

   function drawParticles() {
     for (const p of particles) {
       ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
       ctx.fillStyle = p.color;
       ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
     }
     ctx.globalAlpha = 1;
   }

   /* -------- Power-ups -------- */

   function updatePowerups(dt) {
     for (const p of powerups) {
       p.y += p.vy * dt;
       p.t += dt;
     }
     powerups = powerups.filter((p) => p.y < H + 20);
   }

   function drawPowerups() {
     for (const p of powerups) {
       const info = POWERUP_TYPES[p.type];
       if (!info) return;

       const pulse = 0.7 + 0.3 * Math.sin(p.t * 6);
       ctx.save();
       ctx.translate(p.x, p.y);
       ctx.strokeStyle =
         "rgba(" +
         (info.color.startsWith("#")
           ? hexToRgb(info.color).join(",")
           : "255,200,100") +
         "," +
         pulse +
         ")";
       ctx.lineWidth = 2;
       ctx.strokeRect(-8, -8, 16, 16);
       ctx.fillStyle = info.color;
       ctx.font = "bold 10px monospace";
       ctx.textAlign = "center";
       ctx.textBaseline = "middle";
       ctx.fillText(info.label, 0, 1);
       ctx.restore();
     }
   }

   function hexToRgb(hex) {
     const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
     return result
       ? [
           parseInt(result[1], 16),
           parseInt(result[2], 16),
           parseInt(result[3], 16),
         ]
       : [255, 200, 100];
   }

   /* -------- Obstacles -------- */

   let obstacleSpawnTimer = 0;

   function obstacleSpawnInterval() {
     const plan = game.levelPlan;
     let base = Math.max(2.2, 3.6 - (game.level - 2) * 0.25);
     if (plan && plan.obstacleRateMult) {
       base /= plan.obstacleRateMult;
     }
     return base;
   }

   function spawnObstacle() {
     const canArmor = game.level >= 4;
     const type = canArmor && Math.random() < 0.3 ? "armor" : "scrap";

     let x = 0;
     let ok = false;
     for (let attempt = 0; attempt < 6 && !ok; attempt++) {
       x = 30 + Math.random() * (W - 100);
       ok = Math.abs(x + 17 - player.x) > 60;
       if (ok) {
         for (const o of obstacles) {
           if (o.y < 120 && Math.abs(o.x - x) < 90) {
             ok = false;
             break;
           }
         }
       }
     }
     if (!ok) return;

     if (type === "scrap") {
       obstacles.push({
         type: "scrap",
         x: x,
         y: -30,
         w: 28,
         h: 24,
         vy: 55 + Math.random() * 25,
         hp: 2,
         destructible: true,
         score: 35,
         seed: Math.random() * Math.PI * 2,
       });
     } else {
       obstacles.push({
         type: "armor",
         x: x,
         y: -34,
         w: 36,
         h: 28,
         vy: 45 + Math.random() * 15,
         hp: Infinity,
         destructible: false,
         score: 0,
         seed: Math.random() * Math.PI * 2,
       });
     }
   }

   function updateObstacleSpawning(dt) {
     if (game.level < 2) return;
     obstacleSpawnTimer -= dt;
     if (obstacleSpawnTimer <= 0 && obstacles.length < 5) {
       spawnObstacle();
       obstacleSpawnTimer =
         obstacleSpawnInterval() * (0.8 + Math.random() * 0.4);
     }
   }

   function updateObstacles(dt) {
     for (const o of obstacles) {
       o.y += o.vy * dt;
     }
     obstacles = obstacles.filter((o) => o.y < H + 40);
   }

   function destroyObstacle(o) {
     spawnExplosion(o.x + o.w / 2, o.y + o.h / 2, "#b08a5e", 14);
     spawnExplosion(o.x + o.w / 2, o.y + o.h / 2, "#7a7f8c", 8);
     if (o.score > 0) game.score += o.score;
     o.hp = 0;
   }

   function drawObstacles() {
     for (const o of obstacles) {
       ctx.save();
       ctx.translate(o.x + o.w / 2, o.y + o.h / 2);
       ctx.rotate(Math.sin(o.seed) * 0.25);

       if (o.type === "scrap") {
         ctx.fillStyle = o.hp > 1 ? "#8c7a64" : "#6b5c4a";
         ctx.beginPath();
         ctx.moveTo(-o.w / 2, -2);
         ctx.lineTo(-o.w / 4, -o.h / 2);
         ctx.lineTo(o.w / 5, -o.h / 2 + 3);
         ctx.lineTo(o.w / 2, -4);
         ctx.lineTo(o.w / 3, o.h / 2);
         ctx.lineTo(-o.w / 3, o.h / 2 - 3);
         ctx.closePath();
         ctx.fill();
         ctx.strokeStyle = o.hp > 1 ? "#5a4f40" : "#2c241c";
         ctx.lineWidth = 1.5;
         ctx.beginPath();
         ctx.moveTo(-o.w / 4, -o.h / 4);
         ctx.lineTo(2, 2);
         ctx.lineTo(o.w / 4, o.h / 3);
         if (o.hp <= 1) {
           ctx.moveTo(o.w / 4, -o.h / 3);
           ctx.lineTo(-2, 0);
           ctx.lineTo(-o.w / 4, o.h / 4);
         }
         ctx.stroke();
       } else {
         ctx.fillStyle = "#2a3142";
         ctx.fillRect(-o.w / 2, -o.h / 2, o.w, o.h);
         ctx.strokeStyle = "#8fa0c4";
         ctx.lineWidth = 2;
         ctx.strokeRect(-o.w / 2, -o.h / 2, o.w, o.h);
         ctx.fillStyle = "#8fa0c4";
         const rx = o.w / 2 - 5;
         const ry = o.h / 2 - 5;
         ctx.fillRect(-rx - 1, -ry - 1, 3, 3);
         ctx.fillRect(rx - 2, -ry - 1, 3, 3);
         ctx.fillRect(-rx - 1, ry - 2, 3, 3);
         ctx.fillRect(rx - 2, ry - 2, 3, 3);
       }
       ctx.restore();
     }
   }

   function circleRectHit(cx, cy, cr, rx, ry, rw, rh) {
     const nx = Math.max(rx, Math.min(cx, rx + rw));
     const ny = Math.max(ry, Math.min(cy, ry + rh));
     const dx = cx - nx;
     const dy = cy - ny;
     return dx * dx + dy * dy <= cr * cr;
   }

   function absorbOrHitPlayer(x, y) {
     if (!player.alive || player.invuln > 0 || game.state !== STATE.PLAYING) return;
     if (player.shieldHp > 0) {
       player.shieldHp--;
       spawnExplosion(x ?? player.x, y ?? player.y, "#6fd6ff", 10);
       game.shake = Math.min(10, game.shake + 4);
       player.invuln = Math.max(player.invuln, 0.35);
       return;
     }
     hitPlayer();
   }

   function handleObstacleCollisions() {
     for (const b of playerBullets) {
       for (const o of obstacles) {
         if (o.hp > 0 && circleRectHit(b.x, b.y, b.r, o.x, o.y, o.w, o.h)) {
           b.dead = true;
           if (o.destructible) {
             o.hp -= b.damage || 1;
             if (o.hp <= 0) destroyObstacle(o);
             else spawnExplosion(b.x, b.y, "#b08a5e", 4);
           } else {
             spawnExplosion(b.x, b.y, "#8fa0c4", 3);
           }
           break;
         }
       }
     }
     playerBullets = playerBullets.filter((b) => !b.dead);
     obstacles = obstacles.filter((o) => o.hp > 0);

     if (player.alive && player.invuln <= 0) {
       for (const o of obstacles) {
         if (circleRectHit(player.x, player.y, 8, o.x, o.y, o.w, o.h)) {
           absorbOrHitPlayer(player.x, player.y);
           break;
         }
       }
     }
   }

   /* -------- Collisions -------- */

   function circleHit(ax, ay, ar, bx, by, br) {
     const dx = ax - bx;
     const dy = ay - by;
     const rr = ar + br;
     return dx * dx + dy * dy <= rr * rr;
   }

   function bulletHit(b, x, y, radius) {
     const ax = b.previousX ?? b.x, ay = b.previousY ?? b.y;
     const dx = b.x - ax, dy = b.y - ay;
     const lengthSquared = dx * dx + dy * dy;
     const t = lengthSquared ? Math.max(0, Math.min(1, ((x-ax)*dx + (y-ay)*dy) / lengthSquared)) : 0;
     return circleHit(ax + dx*t, ay + dy*t, b.r, x, y, radius);
   }

   function killEnemy(e, awardScore) {
     if (e.rewarded) return;
     e.rewarded = true; e.hp = 0;
     spawnExplosion(
       e.x,
       e.y,
       e.type === "bomber" ? "#ff7a3d" : "#ffd27a",
       18,
     );
     spawnExplosion(e.x, e.y, "#e8edf7", 8);
     if (awardScore) {
       game.score += e.score;
       game.killsThisLevel++;
       dropPowerupForEnemy(e.x, e.y);
     }
     game.shake = Math.min(6, game.shake + 2);
   }

   function handleCollisions() {
     if (!player.alive || game.state !== STATE.PLAYING) return;
     handleObstacleCollisions();
     if (!player.alive) return;

     for (const b of playerBullets) {
       for (const e of enemies) {
         if (!b.dead && e.hp > 0 && !b.hitEnemies?.has(e) && bulletHit(b, e.x, e.y, e.r)) {
           (b.hitEnemies ||= new Set()).add(e);
           const damage = b.damage || 1;
           e.hp -= damage;
           if (!b.pierce) b.dead = true;
           if (e.hp <= 0) {
             killEnemy(e, true);
           } else {
             spawnExplosion(
               b.x,
               b.y,
               b.rail ? "#9fd6ff" : "#ffd27a",
               b.rail ? 8 : 4,
             );
           }
           if (!b.pierce) break;
         }
       }
     }
     playerBullets = playerBullets.filter((b) => !b.dead);
     enemies = enemies.filter((e) => e.hp > 0);

     if (player.invuln <= 0 && player.alive) {
       for (const b of enemyBullets) {
         if (bulletHit(b, player.x, player.y, 6)) {
           b.dead = true;
           absorbOrHitPlayer(b.x, b.y);
           break;
         }
       }
       enemyBullets = enemyBullets.filter((b) => !b.dead);

       if (player.invuln <= 0) {
         for (const e of enemies) {
           if (circleHit(e.x, e.y, e.r, player.x, player.y, 8)) {
             e.hp = 0;
             killEnemy(e, false);
             absorbOrHitPlayer(player.x, player.y);
             break;
           }
         }
         enemies = enemies.filter((e) => e.hp > 0);
       }
     }

     if (!player.alive) return;
     for (const p of powerups) {
       if (circleHit(p.x, p.y, p.r, player.x, player.y, 14)) {
         p.dead = true;
         applyPowerup(p.type);
       }
     }
     powerups = powerups.filter((p) => !p.dead);
   }

   function applyPowerup(type) {
     switch (type) {
       case "spread":
         player.spreadTimer = 10;
         game.score += 50;
         break;
       case "rapid":
         player.rapidTimer = 8;
         game.score += 50;
         break;
       case "shield":
         player.shieldHp = 1;
         game.score += 75;
         break;
       case "bomb":
         player.bombs = Math.min(player.bombs + 1, player.maxBombs);
         game.score += 100;
         break;
       case "repair":
         player.lives = Math.min(player.lives + 1, player.maxLives);
         game.score += 100;
         break;
       case "score":
         game.score += 200;
         break;
       case "rail":
         player.railTimer = 6;
         game.score += 50;
         break;
       case "drone":
         player.droneTimer = 8;
         game.score += 50;
         break;
     }
   }

   function hitPlayer() {
     if (!player.alive || player.invuln > 0 || game.state !== STATE.PLAYING) return;
     player.lives--;
     spawnExplosion(player.x, player.y, "#ff4d5e", 26);
     spawnExplosion(player.x, player.y, "#e8edf7", 12);
     game.shake = 10;
     player.spreadTimer = 0;
     player.railTimer = 0;
     player.droneTimer = 0;

     if (player.lives <= 0) {
       player.alive = false;
       endGame();
       return;
     }

     player.invuln = 2.0;
     enemyBullets = enemyBullets.filter(
       (b) => Math.hypot(b.x - player.x, b.y - player.y) > 130,
     );
   }

   /* -------- Bomb -------- */

   function useBomb() {
     if (game.state !== STATE.PLAYING || player.bombs <= 0) return;

     player.bombs--;
     game.flash = 0.35;
     game.shake = 14;

     for (const b of enemyBullets) {
       spawnExplosion(b.x, b.y, "#ffd27a", 3);
     }
     enemyBullets = [];

     for (const e of enemies) {
       spawnExplosion(e.x, e.y, "#ff7a3d", 8);
       e.hp = 0;
     }
     enemies = [];

     for (const o of obstacles) {
       if (o.destructible) {
         destroyObstacle(o);
       }
     }
     obstacles = obstacles.filter((o) => !o.destructible || o.hp > 0);

     game.score += 500;
     game.shake = Math.min(20, game.shake + 6);
   }

   function triggerBomb() {
     if (game.state === STATE.PLAYING && player.bombs > 0) useBomb();
   }

   /* -------- Arcade Name Entry -------- */

   const nameEntry = {
     chars: ["A", "C", "E"],
     slot: 0,
     prevTouch: { up: false, down: false, left: false, right: false, fire: false },
   };

   function resetNameEntry() {
     nameEntry.chars = ["A", "C", "E"]; // default name if confirmed through
     nameEntry.slot = 0;
   }

   function cycleNameChar(dir) {
     const i = NAME_CHARS.indexOf(nameEntry.chars[nameEntry.slot]);
     const n = (i + dir + NAME_CHARS.length) % NAME_CHARS.length;
     nameEntry.chars[nameEntry.slot] = NAME_CHARS[n];
   }

   function confirmNameSlot() {
     if (nameEntry.slot < 2) nameEntry.slot++;
     else submitNameEntry();
   }

   function submitNameEntry() {
     addScoreboardEntry(nameEntry.chars.join(""), game.score, game.level);
     game.state = STATE.GAME_OVER;
   }

   function handleNameEntryInput() {
     // Keyboard (edge-triggered)
     if (consume("ArrowLeft") || consume("KeyA"))
       nameEntry.slot = Math.max(0, nameEntry.slot - 1);
     if (consume("ArrowRight") || consume("KeyD"))
       nameEntry.slot = Math.min(2, nameEntry.slot + 1);
     if (consume("ArrowUp") || consume("KeyW")) cycleNameChar(1);
     if (consume("ArrowDown") || consume("KeyS")) cycleNameChar(-1);
     if (consume("Space") || consume("Enter")) confirmNameSlot();
     if (consume("Backspace") || consume("KeyR")) resetNameEntry();

     // Touch (derive edges from hold state)
     const t = touchInput;
     const p = nameEntry.prevTouch;
     if (t.left && !p.left) nameEntry.slot = Math.max(0, nameEntry.slot - 1);
     if (t.right && !p.right) nameEntry.slot = Math.min(2, nameEntry.slot + 1);
     if (t.up && !p.up) cycleNameChar(1);
     if (t.down && !p.down) cycleNameChar(-1);
     if (t.fire && !p.fire) confirmNameSlot();
     p.up = t.up; p.down = t.down; p.left = t.left;
     p.right = t.right; p.fire = t.fire;
   }

   /* -------- Game Flow -------- */

   function toggleStartPause() {
     if (game.state === STATE.NAME_ENTRY) {
       confirmNameSlot();
       return;
     }
     if (game.state === STATE.START || game.state === STATE.GAME_OVER) {
       restartGame();
       startGame();
     } else if (game.state === STATE.PLAYING) {
       game.state = STATE.PAUSED;
     } else if (game.state === STATE.PAUSED) {
       game.state = STATE.PLAYING;
     }
   }

   function restartGame() {
     if (game.state === STATE.NAME_ENTRY) {
       resetNameEntry();
       return;
     }
     clearAllInput();
     game.shake = 0; game.flash = 0; game.time = 0; game.levelPlan = null;
     player.fireCooldown = 0; player.speed = 260; player.baseFireRate = 0.16; player.maxBombs = 3;
     game.state = STATE.START;
     game.score = 0;
     game.level = 1;
     game.killsThisLevel = 0;
     game.killsNeeded = getKillsNeeded(1);
     game.lastHealthRewardLevel = 0;
     game.hullUpgradeEarned = false;
     game.levelIntroTimer = 0;
     player.maxLives = 3;
     player.lives = 3;
     player.bombs = 3;
     player.invuln = 0;
     player.spreadTimer = 0;
     player.rapidTimer = 0;
     player.railTimer = 0;
     player.droneTimer = 0;
     player.shieldHp = 0;
     player.x = W / 2;
     player.y = H - 80;
     player.alive = true;
     playerBullets = [];
     enemyBullets = [];
     enemies = [];
     particles = [];
     powerups = [];
     obstacles = [];
     spawnTimer = 0;
     obstacleSpawnTimer = 0;
     game.graceTimer = 0;
     game.levelClearTimer = 0;
   }

   function startGame() {
     game.state = STATE.PLAYING;
     game.graceTimer = 1.0;
     game.levelIntroTimer = 1.5;
     game.levelPlan = getLevelPlan(game.level);
     spawnTimer = 0;
     obstacleSpawnTimer = 0;
   }

   function endGame() {
     if (game.score > game.highScore) {
       game.highScore = game.score;
       saveHighScore(game.highScore);
     }
     if (qualifiesForScoreboard(game.score)) {
       resetNameEntry();
       nameEntry.prevTouch.fire = touchInput.fire; // no carry-over confirm
       game.state = STATE.NAME_ENTRY;
     } else {
       game.state = STATE.GAME_OVER;
     }
   }

   function completeLevel() {
     if (game.state !== STATE.PLAYING || !player.alive) return;
     game.state = STATE.LEVEL_CLEAR;

     // Survival reward: every 5 cleared levels, +1 max hull (cap 10),
     // restore to new max. Tracker prevents duplicate rewards.
     game.hullUpgradeEarned = false;
     if (
       game.level % 5 === 0 &&
       game.level > game.lastHealthRewardLevel &&
       player.maxLives < 10
     ) {
       player.maxLives++;
       player.lives = player.maxLives;
       game.lastHealthRewardLevel = game.level;
       game.hullUpgradeEarned = true;
     }

     game.levelClearTimer = game.hullUpgradeEarned ? 2.8 : 2.0;
     playerBullets = [];
     enemyBullets = [];
     enemies = [];
     powerups = [];
   }

   function beginNextLevel() {
     game.level++;
     game.killsThisLevel = 0;
     game.killsNeeded = getKillsNeeded(game.level);
     game.graceTimer = 1.0;
     spawnTimer = 0;
     obstacleSpawnTimer = 0;
     obstacles = [];
     game.levelPlan = getLevelPlan(game.level);
     game.levelIntroTimer = 1.5;
     game.state = STATE.PLAYING;
   }

   function checkLevelProgress() {
     if (game.state === STATE.PLAYING && player.alive && game.killsThisLevel >= game.killsNeeded && enemies.length === 0) {
       completeLevel();
     }
   }

   /* -------- Drawing -------- */

   function drawCenteredPanel(items, accentColor) {
     const panelH = items.length * 16 + 20;
     const panelY = H / 2 - panelH / 2;

     ctx.fillStyle = "rgba(11, 16, 32, 0.9)";
     ctx.fillRect(W / 2 - 120, panelY - 10, 240, panelH + 20);
     ctx.strokeStyle = accentColor;
     ctx.lineWidth = 2;
     ctx.strokeRect(W / 2 - 120, panelY - 10, 240, panelH + 20);

     let y = panelY + 10;
     for (const item of items) {
       ctx.textAlign = "center";
       ctx.font = item.big ? "bold 24px monospace" : "14px monospace";
       ctx.fillStyle = item.color || "#ffb454";
       ctx.fillText(item.text, W / 2, y);
       y += 16;
     }
   }

   function getActivePowerupText() {
     // Compact: "SPR 7  RAP 4  RAIL 5  DRN 8  SHLD"
     const active = [];
     if (player.spreadTimer > 0)
       active.push("SPR " + Math.ceil(player.spreadTimer));
     if (player.rapidTimer > 0)
       active.push("RAP " + Math.ceil(player.rapidTimer));
     if (player.railTimer > 0)
       active.push("RAIL " + Math.ceil(player.railTimer));
     if (player.droneTimer > 0)
       active.push("DRN " + Math.ceil(player.droneTimer));
     if (player.shieldHp > 0) active.push("SHLD");
     return active.join("  ");
   }

   function drawHUD() {
     ctx.font = "12px monospace";
     ctx.fillStyle = "#ffb454";
     ctx.textAlign = "left";

     ctx.fillText("LIVES: " + player.lives, 8, H - 8);
     ctx.fillText("BOMBS: " + player.bombs, 8, H - 20);
     ctx.fillText("LEVEL: " + game.level, W - 90, H - 20);

     ctx.fillStyle = "#6ee77a";
     ctx.fillText(
       "KILLS: " + game.killsThisLevel + "/" + game.killsNeeded,
       W - 90,
       H - 8,
     );

     ctx.fillStyle = "#ffb454";
     ctx.textAlign = "center";
     ctx.fillText("SCORE: " + game.score, W / 2, H - 8);

     const activeText = getActivePowerupText();
     if (activeText) {
       ctx.fillStyle = "#6fd6ff";
       ctx.font = "10px monospace";
       ctx.fillText(activeText, W / 2, H - 22);
     }
   }

   function drawStart() {
     drawCenteredPanel(
       [
         { text: "BLACKBOX", big: true },
         { text: "SQUADRON", big: true },
         { text: "" },
         { text: "v0.2.3", color: "#9aa7c4" },
         { text: "" },
         { text: "HIGH SCORE  " + game.highScore, color: "#6ee77a" },
         { text: "" },
         { text: "ARROWS / WASD - MOVE", color: "#9aa7c4" },
         { text: "SPACE - FIRE    C - BOMB", color: "#9aa7c4" },
         { text: "ENTER - PAUSE   R - RESET", color: "#9aa7c4" },
         { text: "TOUCH: D-PAD + BUTTONS", color: "#6fd6ff" },
         { text: "" },
         ...scoreboardLines(5),
         { text: "" },
         { text: "PRESS SPACE / START", color: "#6fd6ff" },
       ],
       "#ffb454",
     );
   }

   function drawPaused() {
     drawCenteredPanel(
       [
         { text: "PAUSED", big: true },
         { text: "" },
         {
           text: "LEVEL " + game.level + " — " + game.levelPlan.band,
           color: "#9aa7c4",
         },
         { text: game.levelPlan.modifier, color: "#9aa7c4" },
         { text: "" },
         { text: "SCORE  " + game.score, color: "#ffb454" },
         { text: "" },
         { text: "PRESS SPACE TO RESUME", color: "#6fd6ff" },
       ],
       "#6fd6ff",
     );
   }

   function drawLevelClear() {
     const lines = [
       { text: "LEVEL " + game.level + " CLEAR", big: true },
       { text: "" },
       { text: "SCORE  " + game.score, color: "#ffb454" },
     ];
     if (game.hullUpgradeEarned) {
       lines.push({ text: "" });
       lines.push({ text: "HULL UPGRADE +1", color: "#6ee77a" });
       lines.push({ text: "MAX HULL: " + player.maxLives, color: "#6ee77a" });
     }
     lines.push({ text: "" });
     lines.push({ text: "NEXT WAVE INBOUND", color: "#9aa7c4" });
     drawCenteredPanel(lines, "#6ee77a");
   }

   function drawGameOver() {
     drawCenteredPanel(
       [
         { text: "GAME OVER", big: true },
         { text: "" },
         { text: "FINAL SCORE  " + game.score, color: "#ffb454" },
         {
           text:
             game.score >= game.highScore && game.score > 0
               ? "NEW HIGH SCORE"
               : "HIGH SCORE  " + game.highScore,
           color:
             game.score >= game.highScore && game.score > 0
               ? "#6ee77a"
               : "#5a6478",
         },
         { text: "" },
         ...scoreboardLines(5),
         { text: "" },
         { text: "PRESS SPACE / START", color: "#6ee77a" },
       ],
       "#ff4d5e",
     );
   }

   function drawLevelIntro() {
     // Brief banner; game keeps running underneath. Fades out.
     const a = Math.min(1, game.levelIntroTimer / 0.4);
     const plan = game.levelPlan;
     ctx.save();
     ctx.globalAlpha = a;
     ctx.fillStyle = "rgba(11, 16, 32, 0.85)";
     ctx.fillRect(0, H * 0.22, W, 86);
     ctx.strokeStyle = "#ffb454";
     ctx.lineWidth = 1;
     ctx.strokeRect(-2, H * 0.22, W + 4, 86);
     ctx.textAlign = "center";
     ctx.font = "bold 20px monospace";
     ctx.fillStyle = "#ffb454";
     ctx.fillText(
       "LEVEL " + game.level + " — " + (plan ? plan.band.toUpperCase() : ""),
       W / 2,
       H * 0.22 + 28,
     );
     ctx.font = "13px monospace";
     ctx.fillStyle = "#9aa7c4";
     ctx.fillText(
       "MODIFIER: " + (plan ? plan.modifier.toUpperCase() : ""),
       W / 2,
       H * 0.22 + 52,
     );
     ctx.fillStyle = "#6ee77a";
     ctx.fillText(
       "OBJECTIVE: DESTROY " + game.killsNeeded,
       W / 2,
       H * 0.22 + 72,
     );
     ctx.restore();
   }

   function drawNameEntry() {
     const lines = [
       { text: "QUALIFYING SCORE", color: "#6ee77a" },
       { text: String(game.score), big: true },
       { text: "" },
       { text: "ENTER NAME", color: "#ffb454" },
       { text: "" },
       { text: "" },
       { text: "" },
       { text: "U/D CHANGE  L/R SLOT", color: "#5a6478" },
       { text: "FIRE / START CONFIRM", color: "#5a6478" },
     ];
     drawCenteredPanel(lines, "#ffb454");

     // Big character slots with blinking active cursor
     const blink = Math.floor(game.time * 3) % 2 === 0;
     ctx.font = "bold 34px monospace";
     ctx.textAlign = "center";
     const cy = H / 2 + 18;
     for (let i = 0; i < 3; i++) {
       const cx = W / 2 + (i - 1) * 42;
       const active = i === nameEntry.slot;
       ctx.fillStyle = active ? "#6fd6ff" : "#e8edf7";
       ctx.fillText(nameEntry.chars[i], cx, cy);
       if (active && blink) {
         ctx.fillStyle = "#6fd6ff";
         ctx.fillRect(cx - 14, cy + 8, 28, 3);
       }
     }
   }

   /* -------- Main Loop -------- */

   let lastTime = performance.now();
   let accumulator = 0;
   const FIXED_STEP = 1 / 120;

   function frame(now) {
     const elapsed = Math.min(0.1, Math.max(0, (now - lastTime) / 1000));
     lastTime = now;
     handleGlobalInput();
     if (game.state === STATE.PAUSED || document.hidden) {
       accumulator = 0;
     } else {
       accumulator += elapsed;
       let steps = 0;
       while (accumulator >= FIXED_STEP && steps++ < 12) {
         game.time += FIXED_STEP;
         update(FIXED_STEP);
         accumulator -= FIXED_STEP;
       }
     }
     render();
     if (window.BlackboxUI) window.BlackboxUI.refresh();
     for (const k in pressed) pressed[k] = false;
     requestAnimationFrame(frame);
   }

   function handleGlobalInput() {
     if (game.state === STATE.NAME_ENTRY) {
       handleNameEntryInput();
       return;
     }
     if (consume("Enter") || consume("Escape") || consume("KeyP")) toggleStartPause();

     // Space starts/resumes/restarts outside gameplay. During gameplay,
     // Space is held for fire in updatePlayer(), and never triggers bomb.
     if (game.state !== STATE.PLAYING && consume("Space"))
       toggleStartPause();

     if (consume("KeyR") && game.state !== STATE.PLAYING) restartGame();
     if (consume("KeyC")) triggerBomb();
   }

   function update(dt) {
     updateStars(dt);

     if (game.state === STATE.PLAYING) {
       if (game.graceTimer > 0) game.graceTimer -= dt;
       if (game.levelIntroTimer > 0) game.levelIntroTimer -= dt;
       updatePlayer(dt);
       updateSpawning(dt);
       updateObstacleSpawning(dt);
       updateEnemies(dt);
       updateObstacles(dt);
       updateBullets(dt);
       updatePowerups(dt);
       handleCollisions();
       if (game.state === STATE.PLAYING && player.alive) checkLevelProgress();
     } else if (game.state === STATE.LEVEL_CLEAR) {
       game.levelClearTimer -= dt;
       if (game.levelClearTimer <= 0) {
         beginNextLevel();
       }
     }

     updateParticles(dt);
     if (game.shake > 0) game.shake = Math.max(0, game.shake - dt * 30);
     if (game.flash > 0) game.flash -= dt;
   }

   function render() {
     ctx.fillStyle = "#050b12";
     ctx.fillRect(0, 0, W, H);
     ctx.save();
     if (game.shake > 0 && !window.BBPlatform?.settings.reducedMotion) {
       const sx = (Math.random() - 0.5) * game.shake * 2;
       const sy = (Math.random() - 0.5) * game.shake * 2;
       ctx.translate(sx, sy);
     }

     ctx.fillStyle = "#000";
     ctx.fillRect(0, 0, W, H);

     drawStars();
     drawEnemies();
     drawObstacles();
     drawBullets();
     drawPlayer();
     drawPowerups();
     drawParticles();

     if (game.flash > 0 && !window.BBPlatform?.settings.reducedMotion) {
       ctx.fillStyle = "rgba(255, 255, 255, " + game.flash * 0.5 + ")";
       ctx.fillRect(0, 0, W, H);
     }

     ctx.restore();

     if (game.state === STATE.START) {
       drawStart();
     } else if (game.state === STATE.PLAYING) {
       drawHUD();
       if (game.levelIntroTimer > 0) drawLevelIntro();
     } else if (game.state === STATE.PAUSED) {
       drawPaused();
     } else if (game.state === STATE.LEVEL_CLEAR) {
       drawLevelClear();
     } else if (game.state === STATE.NAME_ENTRY) {
       drawNameEntry();
     } else if (game.state === STATE.GAME_OVER) {
       drawGameOver();
     }
   }

   /* -------- Initialization -------- */

   initStars();
   initTouchControls();
   requestAnimationFrame(frame);
