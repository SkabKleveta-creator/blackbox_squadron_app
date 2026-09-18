/* BLACKBOX SQUADRON — campaign director, fleet encounters and persistent loadout. */
"use strict";

(() => {
  const SECTORS = [
    { name: "OUTER PERIMETER", briefing: "Clear the patrol screen. Keep a path through the fire.", modifier: "Patrol Screen", formation: "wedge", kills: 8, color: "#67dcff" },
    { name: "SALVAGE CORRIDOR", briefing: "Fly the debris lanes. Amber scrap can be destroyed.", modifier: "Debris Field", formation: "column", kills: 10, color: "#efbc70" },
    { name: "WARDEN GATE", briefing: "Break the escort. Destroy the Warden command ship.", modifier: "Command Intercept", formation: "wedge", kills: 12, boss: "WARDEN", color: "#ffbb69" },
    { name: "GLASS CURRENT", briefing: "Crossing formations are converging on your position.", modifier: "Crossfire", formation: "pincer", kills: 14, color: "#67e4cf" },
    { name: "ASH BELT", briefing: "Armored debris is indestructible. Find the open lane.", modifier: "Scrap Storm", formation: "wall", kills: 16, color: "#e7a472" },
    { name: "BASTION ARRAY", briefing: "Defeat the Bastion. Leave marked lanes before beams fire.", modifier: "Beam Battery", formation: "column", kills: 15, boss: "BASTION", color: "#e19aff" },
    { name: "GHOST CHANNEL", briefing: "Fast wings approach from both flanks. Keep moving.", modifier: "Ace Squadron", formation: "pincer", kills: 18, color: "#83bcff" },
    { name: "IRON RAIN", briefing: "The carrier screen is closing. Save a bomb for an escape.", modifier: "Carrier Lane", formation: "wedge", kills: 20, color: "#ffa079" },
    { name: "HARROW ENGINE", briefing: "The Harrow changes attacks as its hull breaks apart.", modifier: "Siege Engine", formation: "wall", kills: 18, boss: "HARROW", color: "#ff799a" },
    { name: "MIDNIGHT REACH", briefing: "Dense patrols ahead. Every clean kill builds your multiplier.", modifier: "Bullet Weather", formation: "pincer", kills: 22, color: "#a28eff" },
    { name: "CROWN APPROACH", briefing: "Destroy the inner guard. Prepare for the final command ship.", modifier: "Inner Guard", formation: "wall", kills: 24, color: "#ffab67" },
    { name: "BLACKBOX CITADEL", briefing: "Eliminate the Black Crown. Bring the squadron home.", modifier: "Final Command", formation: "wedge", kills: 22, boss: "BLACK CROWN", color: "#ff637e" },
  ].map((sector, i) => Object.freeze({ id: i + 1, boss: null, ...sector }));

  const DIFFICULTIES = {
    cadet: { speed: 0.78, fire: 1.28, bossHealth: 0.8, bullet: 0.8, score: 0.8 },
    standard: { speed: 1, fire: 1, bossHealth: 1, bullet: 1, score: 1 },
    ace: { speed: 1.15, fire: 0.84, bossHealth: 1.25, bullet: 1.14, score: 1.2 },
  };
  const ORIGINAL = {
    restartGame, startGame, beginNextLevel, update, updateEnemies,
    handleCollisions, killEnemy, hitPlayer, firePlayer, applyPowerup,
    endGame, handleGlobalInput, updateObstacleSpawning,
  };
  STATE.VICTORY = "victory";
  let restoring = false;
  let runSequence = 0;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const finite = (v, fallback, lo, hi) => Number.isFinite(v) ? clamp(v, lo, hi) : fallback;

  function freshStats() {
    return { kills: 0, bossesDefeated: 0, sectorsCleared: 0, shotsFired: 0,
      shotsHit: 0, damageTaken: 0, bombsUsed: 0, playTime: 0, maxCombo: 0,
      perfectSectors: 0 };
  }
  function freshCampaign(difficulty = "standard") {
    return {
      runId: "bb-" + Date.now().toString(36) + "-" + (++runSequence).toString(36),
      difficulty: DIFFICULTIES[difficulty] ? difficulty : "standard",
      endless: false, boss: null, bossSpawned: false, bossDefeated: false,
      sector: SECTORS[0], offers: [], selectedOffer: 0, sectorTime: 0,
      sectorDamage: 0, sectorBonus: 0, combo: 0, comboTimer: 0,
      multiplier: 1, formationCounter: 0, bossWarningTimer: 0,
      upgrades: { engine: 0, reactor: 0, capacitor: 0, ordnance: 0, hull: 0 },
      stats: freshStats(), completed: false, defeatRecorded: false,
    };
  }
  let campaign = freshCampaign();

  function emit(type, extra = {}) {
    window.dispatchEvent(new CustomEvent("blackbox:campaign", {
      detail: { type, level: game.level, score: game.score, runId: campaign.runId,
        difficulty: campaign.difficulty, endless: campaign.endless,
        stats: { ...campaign.stats }, ...extra },
    }));
  }

  function getSector(level = game.level) {
    const n = Math.max(1, Math.floor(Number(level) || 1));
    if (n <= SECTORS.length) return SECTORS[n - 1];
    const template = SECTORS[(n - 1) % SECTORS.length];
    return { ...template, id: n, name: "DEEP BLACK / " + (n - 12),
      briefing: "Endless deployment. The fleet adapts to every sector you clear.",
      kills: Math.min(36, 22 + Math.floor((n - 12) / 2)),
      boss: n % 3 === 0 ? template.boss || "BLACK CROWN" : null };
  }

  getDifficultyBand = function (level) {
    if (level > 12) return "Endless Deployment";
    return ["Outer Defense", "Hostile Space", "Siege Corridor", "Final Approach"][Math.floor((Math.max(1, level) - 1) / 3)];
  };
  getKillsNeeded = function (level) { return getSector(level).kills; };
  getLevelPlan = function (level) {
    const sector = getSector(level);
    const difficulty = DIFFICULTIES[campaign.difficulty];
    const scaling = Math.min(2.1, 1 + (level - 1) * 0.065);
    return {
      name: sector.name, title: sector.name, band: getDifficultyBand(level),
      briefing: sector.briefing, modifier: sector.modifier, color: sector.color,
      difficultyCoeff: scaling * difficulty.speed,
      enemyMix: level < 3 ? { fighter: 0.65, sweeper: 0.3, bomber: 0.05 }
        : level < 7 ? { fighter: 0.45, sweeper: 0.35, bomber: 0.2 }
          : { fighter: 0.35, sweeper: 0.35, bomber: 0.3 },
      spawnIntervalMult: level > 8 ? 0.9 : 1,
      obstacleRateMult: [2, 5, 8].includes((level - 1) % 12 + 1) ? 1.35 : 0.65,
      dropBias: player.lives < 2 ? { repair: 0.16, shield: 0.1 } : { shield: 0.05 },
    };
  };

  function beginSector() {
    campaign.sector = getSector();
    campaign.boss = null;
    campaign.bossSpawned = false;
    campaign.bossDefeated = false;
    campaign.sectorTime = 0;
    campaign.sectorDamage = 0;
    campaign.sectorBonus = 0;
    campaign.offers = [];
    campaign.selectedOffer = 0;
    campaign.formationCounter = 0;
    campaign.bossWarningTimer = 0;
    game.killsNeeded = getKillsNeeded(game.level);
    game.levelPlan = getLevelPlan(game.level);
    game.graceTimer = 1.8;
    game.levelIntroTimer = 2.5;
    game.levelClearTimer = 0;
    player.x = W / 2;
    player.y = H - 100;
    player.invuln = Math.max(1.8, player.invuln);
    player.fireCooldown = 0;
    spawnTimer = 1.1;
    obstacleSpawnTimer = 3.5;
    clearAllInput();
    if (!restoring) emit("sector-start", { sector: campaign.sector.name });
  }

  restartGame = function () {
    ORIGINAL.restartGame();
    if (game.state !== STATE.START) return;
    const savedDifficulty = window.BBPlatform?.getSettings?.().difficulty || campaign.difficulty;
    campaign = freshCampaign(savedDifficulty);
    player.speed = 260;
    player.baseFireRate = 0.16;
    player.maxBombs = 3;
    player.bombs = 3;
    player.fireCooldown = 0;
    game.levelPlan = getLevelPlan(1);
  };
  startGame = function () {
    if (!restoring && game.level === 1 && campaign.stats.playTime === 0) {
      const configured = window.BBPlatform?.getSettings?.().difficulty;
      if (DIFFICULTIES[configured]) campaign.difficulty = configured;
    }
    ORIGINAL.startGame();
    beginSector();
  };
  beginNextLevel = function () {
    if (game.state !== STATE.LEVEL_CLEAR || campaign.offers.length) return;
    ORIGINAL.beginNextLevel();
    beginSector();
  };

  function formationEnemy(type, x, y, index = 0) {
    const scale = levelSpeedScale();
    const e = { type, x, y, r: type === "bomber" ? 14 : 12,
      hp: type === "bomber" ? (game.level >= 7 ? 3 : 2) : (game.level >= 10 && index === 1 ? 2 : 1),
      score: type === "bomber" ? 250 : type === "sweeper" ? 150 : 100,
      fireTimer: 1.8 + index * 0.25 + Math.random() * 1.2,
      t: index * 0.13, baseX: x, vy: (52 + Math.random() * 15) * scale,
      swayAmp: 12 + (index % 2) * 8, swayFreq: 0.8,
      phase: "drift", diveDelay: 3.2 + index * 0.25,
    };
    if (type === "sweeper") {
      e.vx = (x < W / 2 ? 1 : -1) * (78 + game.level * 2) * scale;
      e.baseY = y;
      e.swayAmp = 23;
      e.swayFreq = 1.5;
      e.r = 11;
    }
    return e;
  }

  function spawnFormation() {
    const capacity = Math.max(0, Math.min(11, maxEnemies()) - enemies.length);
    const remaining = Math.max(1, game.killsNeeded - game.killsThisLevel);
    const count = Math.min(capacity, remaining + 1, game.level < 4 ? 3 : 4);
    if (count < 1) return;
    const formation = campaign.sector.formation;
    const wave = campaign.formationCounter++;
    const center = 135 + Math.random() * (W - 270);
    for (let i = 0; i < count; i++) {
      let type = game.level > 2 && wave % 3 === 2 && i === 1 ? "bomber" : "fighter";
      let x, y;
      if (formation === "pincer" && wave % 2 === 0) {
        type = "sweeper";
        x = i % 2 ? W + 15 : -15;
        y = 90 + Math.floor(i / 2) * 66;
      } else if (formation === "column") {
        x = clamp(center + (i % 2 ? 24 : -24), 50, W - 50);
        y = -30 - i * 55;
      } else if (formation === "wall") {
        x = (i + 1) * W / (count + 1);
        y = -30 - (i % 2) * 20;
      } else {
        x = clamp(center + (i - (count - 1) / 2) * 58, 45, W - 45);
        y = -30 - Math.abs(i - (count - 1) / 2) * 36;
      }
      enemies.push(formationEnemy(type, x, y, i));
    }
  }

  updateSpawning = function (dt) {
    if (game.state !== STATE.PLAYING || campaign.boss || game.killsThisLevel >= game.killsNeeded) return;
    spawnTimer -= dt;
    if (spawnTimer <= 0 && enemies.length < Math.min(11, maxEnemies())) {
      spawnFormation();
      const pace = DIFFICULTIES[campaign.difficulty].fire;
      spawnTimer = Math.max(1.3, 3.2 - game.level * 0.1) * pace;
    }
  };
  updateObstacleSpawning = function (dt) {
    if (campaign.boss || campaign.bossWarningTimer > 0 || game.killsThisLevel >= game.killsNeeded) return;
    ORIGINAL.updateObstacleSpawning(dt);
  };

  enemyFire = function (e) {
    if (enemyBullets.length >= 84) return;
    const speed = Math.min(220, 98 + game.level * 6) * DIFFICULTIES[campaign.difficulty].bullet;
    if (e.type === "bomber") {
      const dx = player.x - e.x, dy = player.y - e.y;
      const length = Math.hypot(dx, dy) || 1;
      enemyBullets.push({ x: e.x, y: e.y + e.r, vx: dx / length * speed,
        vy: Math.max(65, dy / length * speed), r: 4 });
    } else {
      enemyBullets.push({ x: e.x, y: e.y + e.r, vx: 0, vy: speed, r: 4 });
      if (game.level >= 8 && e.type === "sweeper" && enemyBullets.length < 82) {
        enemyBullets.push({ x: e.x, y: e.y + e.r, vx: 43, vy: speed * 0.93, r: 3.5 });
        enemyBullets.push({ x: e.x, y: e.y + e.r, vx: -43, vy: speed * 0.93, r: 3.5 });
      }
    }
  };

  function spawnBoss() {
    const tier = clamp(Math.ceil(game.level / 3), 1, 4);
    const health = Math.round(([0, 110, 160, 220, 285][tier]
      + Math.max(0, game.level - 12) * 9) * DIFFICULTIES[campaign.difficulty].bossHealth);
    campaign.boss = {
      name: campaign.sector.boss, tier, x: W / 2, y: -85, r: 49 + tier * 3,
      hp: health, maxHp: health, t: 0, stage: "entering", attackTimer: 1.25,
      attackIndex: 0, warning: null, beam: null, phase: 1, flash: 0,
      escortTimer: 9, defeated: false,
    };
    campaign.bossSpawned = true;
    campaign.bossWarningTimer = 2.6;
    enemyBullets = [];
    obstacles = [];
    game.graceTimer = 2;
    game.levelIntroTimer = 0;
    emit("boss-encounter", { name: campaign.boss.name });
  }

  function bossBullet(x, y, angle, speed, radius = 4) {
    if (enemyBullets.length >= 120) return;
    enemyBullets.push({ x, y, vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed, r: radius, boss: true });
  }

  function startBossWarning(boss) {
    const patterns = boss.tier === 1 ? ["fan", "aim", "fan", "aim"]
      : boss.tier === 2 ? ["fan", "beam", "aim", "beam"]
        : boss.tier === 3 ? ["ring", "aim", "beam", "fan"]
          : ["beam", "ring", "fan", "aim", "beam", "ring"];
    const kind = patterns[boss.attackIndex++ % patterns.length];
    const duration = (kind === "beam" ? 1.25 : kind === "ring" ? 0.85 : 0.75)
      * (campaign.difficulty === "cadet" ? 1.2 : 1);
    boss.warning = { kind, time: duration, duration, phase: boss.phase,
      targetX: player.x, targetY: player.y, width: boss.phase >= 2 ? 48 : 38 };
    emit("boss-warning", { kind, boss: boss.name });
  }

  function fireBossAttack(boss, warning) {
    const speed = (133 + boss.tier * 9 + boss.phase * 9)
      * DIFFICULTIES[campaign.difficulty].bullet;
    if (warning.kind === "beam") {
      boss.beam = { x: warning.targetX, width: warning.width, time: 0.6 };
      // A second, well-spaced lane in the last command ship's final phase.
      if (boss.tier === 4 && warning.phase === 3) boss.beam.secondX = warning.targetX < W / 2 ? W - 82 : 82;
    } else if (warning.kind === "aim") {
      for (const offset of [-35, 35]) {
        const angle = Math.atan2(warning.targetY - boss.y, warning.targetX - (boss.x + offset));
        const count = boss.phase > 1 ? 3 : 1;
        for (let i = 0; i < count; i++) {
          bossBullet(boss.x + offset, boss.y + 28, angle + (i - (count - 1) / 2) * 0.13, speed * 1.16);
        }
      }
    } else if (warning.kind === "ring") {
      const count = 14 + boss.phase * 2;
      for (let i = 0; i < count; i++) {
        bossBullet(boss.x, boss.y + 20, (i / count) * Math.PI * 2 + boss.attackIndex * 0.17, speed * 0.86, 4.5);
      }
    } else {
      const count = 7 + boss.tier + boss.phase;
      for (let i = 0; i < count; i++) {
        bossBullet(boss.x, boss.y + 30, Math.PI / 2 + (i - (count - 1) / 2) * 0.15, speed);
      }
    }
    boss.attackTimer = Math.max(0.95, 2.15 - boss.tier * 0.13 - (boss.phase - 1) * 0.18)
      * DIFFICULTIES[campaign.difficulty].fire;
    emit("boss-fire", { kind: warning.kind });
  }

  function updateBoss(dt) {
    const boss = campaign.boss;
    if (!boss || boss.defeated) return;
    boss.t += dt;
    boss.flash = Math.max(0, boss.flash - dt);
    if (boss.stage === "entering") {
      boss.y = Math.min(139, boss.y + dt * 100);
      if (boss.y >= 139) boss.stage = "active";
      return;
    }
    boss.phase = boss.hp / boss.maxHp <= 0.25 && boss.tier >= 3 ? 3 : boss.hp / boss.maxHp <= 0.55 ? 2 : 1;
    boss.x = W / 2 + Math.sin(boss.t * (0.36 + boss.phase * 0.06)) * (95 + boss.tier * 8);
    boss.y = 139 + Math.sin(boss.t * 0.8) * 15;
    if (boss.beam) {
      boss.beam.time -= dt;
      if (boss.beam.time <= 0) boss.beam = null;
    }
    if (boss.warning) {
      boss.warning.time -= dt;
      if (boss.warning.time <= 0) {
        const warning = boss.warning;
        boss.warning = null;
        fireBossAttack(boss, warning);
      }
    } else if (!boss.beam) {
      boss.attackTimer -= dt;
      if (boss.attackTimer <= 0) startBossWarning(boss);
    }
    if (boss.tier >= 3 && boss.phase > 1) {
      boss.escortTimer -= dt;
      if (boss.escortTimer <= 0 && enemies.length < 2) {
        enemies.push(formationEnemy("fighter", 72, -24));
        enemies.push(formationEnemy("fighter", W - 72, -24, 1));
        boss.escortTimer = 10;
      }
    }
  }

  updateEnemies = function (dt) {
    ORIGINAL.updateEnemies(dt);
    updateBoss(dt);
  };

  function defeatBoss() {
    const boss = campaign.boss;
    if (!boss || boss.defeated) return;
    boss.defeated = true;
    boss.hp = 0;
    campaign.bossDefeated = true;
    campaign.stats.bossesDefeated++;
    game.score += Math.round((2000 + boss.tier * 1000) * DIFFICULTIES[campaign.difficulty].score);
    for (let i = 0; i < 8; i++) {
      spawnExplosion(boss.x + (Math.random() - 0.5) * 115,
        boss.y + (Math.random() - 0.5) * 70, i % 2 ? "#67dcff" : "#ffbc71", 12);
    }
    game.shake = 13;
    game.flash = 0.25;
    enemyBullets = [];
    enemies = [];
    campaign.boss = null;
    emit("boss-defeated", { name: boss.name });
  }

  handleCollisions = function () {
    const incoming = playerBullets.slice();
    ORIGINAL.handleCollisions();
    for (const bullet of incoming) {
      if (bullet.hitEnemies?.size && !bullet.campaignHitRecorded) {
        bullet.campaignHitRecorded = true;
        campaign.stats.shotsHit++;
      }
    }
    if (game.state !== STATE.PLAYING || !player.alive) return;
    const boss = campaign.boss;
    if (!boss || boss.stage !== "active" || boss.defeated) return;
    for (const bullet of playerBullets) {
      if (bullet.dead || bullet.bossHit === boss || boss.hp <= 0) continue;
      if (!bulletHit(bullet, boss.x, boss.y, boss.r)) continue;
      bullet.bossHit = boss; // Each projectile can damage this hull only once.
      if (!bullet.pierce) bullet.dead = true;
      boss.hp -= bullet.damage || 1;
      boss.flash = 0.07;
      if (!bullet.campaignHitRecorded) {
        bullet.campaignHitRecorded = true;
        campaign.stats.shotsHit++;
      }
      spawnExplosion(bullet.x, bullet.y, "#85e7ff", 3);
    }
    playerBullets = playerBullets.filter(b => !b.dead);
    if (boss.hp <= 0) { defeatBoss(); return; }
    if (player.invuln <= 0 && boss.beam) {
      const beam = boss.beam;
      const inBeam = Math.abs(player.x - beam.x) < beam.width / 2 + 6
        || (beam.secondX !== undefined && Math.abs(player.x - beam.secondX) < beam.width / 2 + 6);
      if (inBeam && player.y > boss.y + 20) absorbOrHitPlayer(player.x, player.y);
    }
  };

  firePlayer = function () {
    const before = playerBullets.length;
    ORIGINAL.firePlayer();
    campaign.stats.shotsFired += playerBullets.length - before;
  };
  killEnemy = function (enemy, awardScore) {
    if (enemy.campaignKilled || enemy.rewarded) return;
    enemy.campaignKilled = true;
    const previousScore = game.score;
    ORIGINAL.killEnemy(enemy, awardScore);
    if (awardScore) {
      campaign.stats.kills++;
      campaign.combo++;
      campaign.comboTimer = 4.2;
      campaign.stats.maxCombo = Math.max(campaign.stats.maxCombo, campaign.combo);
      campaign.multiplier = Math.min(3, 1 + Math.floor(campaign.combo / 8) * 0.5);
      game.score = previousScore + Math.round(enemy.score * campaign.multiplier * DIFFICULTIES[campaign.difficulty].score);
    }
  };
  hitPlayer = function () {
    if (game.state !== STATE.PLAYING || !player.alive || player.invuln > 0) return;
    campaign.stats.damageTaken++;
    campaign.sectorDamage++;
    campaign.combo = 0;
    campaign.comboTimer = 0;
    campaign.multiplier = 1;
    ORIGINAL.hitPlayer();
  };
  applyPowerup = function (type) {
    const shieldBefore = player.shieldHp;
    ORIGINAL.applyPowerup(type);
    if (type === "shield") player.shieldHp = Math.max(shieldBefore, player.shieldHp);
    const timer = { spread: "spreadTimer", rapid: "rapidTimer", rail: "railTimer", drone: "droneTimer" }[type];
    if (timer) player[timer] *= 1 + campaign.upgrades.capacitor * 0.2;
  };

  useBomb = function () {
    if (game.state !== STATE.PLAYING || !player.alive || player.bombs <= 0) return;
    player.bombs--;
    campaign.stats.bombsUsed++;
    game.flash = 0.3;
    game.shake = 14;
    enemyBullets = [];
    for (const enemy of enemies) {
      if (enemy.hp <= 0) continue;
      enemy.hp = 0;
      killEnemy(enemy, true);
    }
    enemies = [];
    for (const obstacle of obstacles) if (obstacle.destructible) destroyObstacle(obstacle);
    obstacles = obstacles.filter(o => !o.destructible);
    const boss = campaign.boss;
    if (boss && boss.stage === "active") {
      boss.hp -= 24 + campaign.upgrades.ordnance * 5;
      boss.flash = 0.25;
      boss.warning = null;
      boss.beam = null;
      boss.attackTimer = 1.8;
      if (boss.hp <= 0) defeatBoss();
    }
    player.invuln = Math.max(0.7, player.invuln);
    emit("bomb");
  };

  const UPGRADE_INFO = {
    repair: { name: "FIELD REPAIR", description: "Restore all hull integrity and recover one bomb." },
    reactor: { name: "REACTOR TUNING", description: "Permanent 10% faster primary fire. Stacks up to four times." },
    engine: { name: "VECTOR THRUST", description: "+25 flight speed for tighter evasive maneuvers." },
    hull: { name: "HULL PLATING", description: "+1 maximum hull integrity and restore two hull points." },
    capacitor: { name: "POWER CAPACITOR", description: "Weapon pickups last 20% longer for the rest of this run." },
    ordnance: { name: "EXPANDED MAGAZINE", description: "+1 bomb capacity, two bombs, and stronger boss bomb damage." },
    shield: { name: "DEFENSE PACKAGE", description: "Two shield charges and one bomb for the next deployment." },
    supply: { name: "WEAPON RESUPPLY", description: "Two bombs and 18 seconds of spread fire." },
  };
  function upgradeOffers() {
    const ids = [];
    if (player.lives < player.maxLives) ids.push("repair");
    const rotations = [
      ["reactor", "hull", "shield"], ["engine", "ordnance", "capacitor"],
      ["hull", "reactor", "supply"], ["capacitor", "shield", "engine"],
    ];
    const pool = [...rotations[(game.level - 1) % rotations.length], "reactor", "hull", "ordnance", "capacitor", "engine", "shield", "supply"];
    const limits = { reactor: 4, engine: 3, hull: 5, ordnance: 2, capacitor: 4 };
    for (const id of pool) {
      if (ids.includes(id) || (limits[id] && campaign.upgrades[id] >= limits[id])) continue;
      ids.push(id);
      if (ids.length === 3) break;
    }
    return ids.map(id => ({ id, ...UPGRADE_INFO[id], rank: campaign.upgrades[id] || 0 }));
  }

  function chooseUpgrade(index) {
    if (game.state !== STATE.LEVEL_CLEAR || !Number.isInteger(index) || !campaign.offers[index]) return false;
    const offer = campaign.offers[index];
    const id = offer.id;
    if (id === "repair") {
      player.lives = player.maxLives;
      player.bombs = Math.min(player.maxBombs, player.bombs + 1);
    } else if (id === "reactor") {
      campaign.upgrades.reactor++;
      player.baseFireRate = 0.16 * Math.pow(0.9, campaign.upgrades.reactor);
    } else if (id === "engine") {
      campaign.upgrades.engine++;
      player.speed = 260 + campaign.upgrades.engine * 25;
    } else if (id === "hull") {
      campaign.upgrades.hull++;
      player.maxLives = Math.min(8, 3 + campaign.upgrades.hull);
      player.lives = Math.min(player.maxLives, player.lives + 2);
    } else if (id === "capacitor") {
      campaign.upgrades.capacitor++;
    } else if (id === "ordnance") {
      campaign.upgrades.ordnance++;
      player.maxBombs = Math.min(5, 3 + campaign.upgrades.ordnance);
      player.bombs = Math.min(player.maxBombs, player.bombs + 2);
    } else if (id === "shield") {
      player.shieldHp = 2;
      player.bombs = Math.min(player.maxBombs, player.bombs + 1);
    } else if (id === "supply") {
      player.bombs = Math.min(player.maxBombs, player.bombs + 2);
      player.spreadTimer = 18;
    }
    campaign.offers = [];
    beginNextLevel();
    emit("upgrade", { upgrade: id });
    return true;
  }

  completeLevel = function () {
    if (game.state !== STATE.PLAYING || !player.alive) return;
    // A finishing blow must not discard the supplies it just released.
    for (const pickup of powerups) if (!pickup.dead) applyPowerup(pickup.type);
    campaign.stats.sectorsCleared++;
    if (campaign.sectorDamage === 0) campaign.stats.perfectSectors++;
    campaign.sectorBonus = Math.round((400 + game.level * 80 + (campaign.sectorDamage === 0 ? 500 : 0))
      * DIFFICULTIES[campaign.difficulty].score);
    game.score += campaign.sectorBonus;
    game.state = STATE.LEVEL_CLEAR;
    game.levelClearTimer = Infinity;
    game.hullUpgradeEarned = false;
    playerBullets = [];
    enemyBullets = [];
    enemies = [];
    powerups = [];
    obstacles = [];
    campaign.boss = null;
    campaign.comboTimer = 0;
    campaign.combo = 0;
    campaign.multiplier = 1;
    campaign.offers = upgradeOffers();
    campaign.selectedOffer = 0;
    player.bombs = Math.min(player.maxBombs, player.bombs + 1);
    clearAllInput();
    emit("sector-clear", { bonus: campaign.sectorBonus, perfect: campaign.sectorDamage === 0 });
    if (game.level === 12 && !campaign.endless) {
      campaign.completed = true;
      game.state = STATE.VICTORY;
      if (game.score > game.highScore) {
        game.highScore = game.score;
        saveHighScore(game.highScore);
      }
      emit("victory");
    }
  };
  checkLevelProgress = function () {
    if (game.state !== STATE.PLAYING || !player.alive || game.killsThisLevel < game.killsNeeded) return;
    if (campaign.sector.boss && !campaign.bossDefeated) {
      if (!campaign.bossSpawned && enemies.length === 0) spawnBoss();
      return;
    }
    if (enemies.length === 0) completeLevel();
  };
  endGame = function () {
    if (!campaign.defeatRecorded) {
      campaign.defeatRecorded = true;
      emit("defeat");
    }
    ORIGINAL.endGame();
  };
  function continueEndless() {
    if (game.state !== STATE.VICTORY) return false;
    campaign.endless = true;
    game.state = STATE.LEVEL_CLEAR;
    game.levelClearTimer = Infinity;
    campaign.offers = upgradeOffers();
    clearAllInput();
    emit("endless-start");
    return true;
  }

  update = function (dt) {
    if (game.state === STATE.PLAYING) {
      campaign.stats.playTime += dt;
      campaign.sectorTime += dt;
      campaign.bossWarningTimer = Math.max(0, campaign.bossWarningTimer - dt);
      if (campaign.comboTimer > 0) {
        campaign.comboTimer -= dt;
        if (campaign.comboTimer <= 0) { campaign.combo = 0; campaign.multiplier = 1; }
      }
    }
    ORIGINAL.update(dt);
  };
  handleGlobalInput = function () {
    if (game.state === STATE.LEVEL_CLEAR) {
      for (let i = 0; i < 3; i++) {
        if (consume("Digit" + (i + 1)) || consume("Numpad" + (i + 1))) {
          chooseUpgrade(i);
          return;
        }
      }
    }
    ORIGINAL.handleGlobalInput();
  };

  function drawBoss() {
    const boss = campaign.boss;
    if (!boss || boss.defeated) return;
    ctx.save();
    const color = campaign.sector.color;
    const warning = boss.warning;
    if (warning) {
      const pulse = 0.3 + 0.25 * Math.sin(boss.t * 18);
      ctx.lineWidth = 1.5;
      if (warning.kind === "beam") {
        const lanes = [warning.targetX];
        if (boss.tier === 4 && warning.phase === 3) lanes.push(warning.targetX < W / 2 ? W - 82 : 82);
        for (const x of lanes) {
          ctx.fillStyle = `rgba(255,81,113,${0.07 + pulse * 0.12})`;
          ctx.fillRect(x - warning.width / 2, boss.y + 25, warning.width, H - boss.y - 70);
          ctx.strokeStyle = `rgba(255,129,140,${0.4 + pulse})`;
          ctx.setLineDash([8, 7]);
          ctx.strokeRect(x - warning.width / 2, boss.y + 25, warning.width, H - boss.y - 70);
          ctx.setLineDash([]);
        }
      } else if (warning.kind === "aim") {
        ctx.strokeStyle = `rgba(255,191,115,${0.2 + pulse})`;
        ctx.setLineDash([5, 9]);
        ctx.beginPath();
        ctx.moveTo(boss.x, boss.y + 30);
        ctx.lineTo(warning.targetX, warning.targetY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(warning.targetX, warning.targetY, 18, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeStyle = `rgba(255,168,130,${0.2 + pulse})`;
        ctx.beginPath();
        ctx.arc(boss.x, boss.y + 20, boss.r + 13 + (1 - warning.time / warning.duration) * 16,
          warning.kind === "fan" ? 0.5 : 0, warning.kind === "fan" ? Math.PI - 0.5 : Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = "#ffc788";
      ctx.textAlign = "center";
      ctx.font = "bold 10px monospace";
      const label = { beam: "BEAM LOCK · LEAVE MARKED LANES", aim: "TARGET LOCK · EVADE", fan: "SPREAD VOLLEY · FIND A GAP", ring: "PULSE RING · HOLD YOUR LINE" }[warning.kind];
      ctx.fillText(label, W / 2, 94);
    }
    if (boss.beam) {
      const lanes = [boss.beam.x];
      if (boss.beam.secondX !== undefined) lanes.push(boss.beam.secondX);
      for (const x of lanes) {
        ctx.shadowBlur = 22;
        ctx.shadowColor = "#ff547e";
        ctx.fillStyle = "rgba(255,73,113,0.62)";
        ctx.fillRect(x - boss.beam.width / 2, boss.y + 28, boss.beam.width, H - boss.y - 72);
        ctx.fillStyle = "#fff3ed";
        ctx.fillRect(x - 3, boss.y + 28, 6, H - boss.y - 72);
      }
      ctx.shadowBlur = 0;
    }
    ctx.save();
    ctx.translate(boss.x, boss.y);
    ctx.shadowBlur = 14;
    ctx.shadowColor = color;
    ctx.fillStyle = boss.flash > 0 ? "#e6faff" : "#222c43";
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -44);
    ctx.lineTo(31, -27);
    ctx.lineTo(66 + boss.tier * 3, -38);
    ctx.lineTo(59 + boss.tier * 3, 27);
    ctx.lineTo(35, 16);
    ctx.lineTo(19, 45);
    ctx.lineTo(0, 31);
    ctx.lineTo(-19, 45);
    ctx.lineTo(-35, 16);
    ctx.lineTo(-59 - boss.tier * 3, 27);
    ctx.lineTo(-66 - boss.tier * 3, -38);
    ctx.lineTo(-31, -27);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#111925";
    ctx.fillRect(-21, -24, 42, 42);
    ctx.strokeStyle = "#50617e";
    ctx.strokeRect(-21, -24, 42, 42);
    ctx.fillStyle = warning ? "#fff0b6" : color;
    ctx.fillRect(-7, -15, 14, 25);
    for (const side of [-1, 1]) {
      ctx.fillStyle = color;
      ctx.fillRect(side * 42 - 5, 7, 10, 21);
      ctx.fillStyle = "#34455e";
      ctx.fillRect(side * 46 - 11, -27, 22, 22);
      ctx.fillStyle = "#89daff";
      ctx.fillRect(side * 25 - 4, -35, 8, 5);
    }
    if (boss.phase > 1) {
      ctx.strokeStyle = "#ffb06d";
      ctx.beginPath();
      ctx.moveTo(-29, -20); ctx.lineTo(-17, -8); ctx.lineTo(-24, 5);
      ctx.moveTo(35, -14); ctx.lineTo(23, 1); ctx.lineTo(37, 12);
      ctx.stroke();
    }
    ctx.restore();
    ctx.textAlign = "left";
    ctx.fillStyle = "#e3edf4";
    ctx.font = "bold 10px monospace";
    ctx.fillText(boss.name + " / PHASE " + boss.phase, 56, 59);
    ctx.textAlign = "right";
    ctx.fillStyle = color;
    ctx.fillText(Math.max(0, Math.ceil(boss.hp / boss.maxHp * 100)) + "%", W - 56, 59);
    ctx.fillStyle = "rgba(2,7,15,0.94)";
    ctx.fillRect(56, 65, W - 112, 8);
    ctx.fillStyle = color;
    ctx.fillRect(56, 65, (W - 112) * clamp(boss.hp / boss.maxHp, 0, 1), 8);
    ctx.strokeStyle = "#354057";
    ctx.strokeRect(56, 65, W - 112, 8);
    ctx.restore();
  }

  function serialize() {
    return {
      version: 1, runId: campaign.runId, level: game.level, score: game.score,
      difficulty: campaign.difficulty, endless: campaign.endless,
      player: { lives: player.lives, maxLives: player.maxLives, bombs: player.bombs,
        maxBombs: player.maxBombs, shieldHp: player.shieldHp, speed: player.speed,
        baseFireRate: player.baseFireRate, spreadTimer: player.spreadTimer,
        rapidTimer: player.rapidTimer, railTimer: player.railTimer, droneTimer: player.droneTimer },
      upgrades: { ...campaign.upgrades }, stats: { ...campaign.stats },
    };
  }

  function restore(snapshot) {
    if (!snapshot || snapshot.version !== 1 || !Number.isInteger(snapshot.level)
      || snapshot.level < 1 || snapshot.level > 10000 || !DIFFICULTIES[snapshot.difficulty]
      || !snapshot.player || !snapshot.upgrades || !snapshot.stats
      || !Number.isFinite(snapshot.score) || snapshot.score < 0
      || snapshot.score > 1e9 || !Number.isInteger(snapshot.player.lives)
      || snapshot.player.lives < 1 || snapshot.player.lives > 8
      || !Number.isInteger(snapshot.player.bombs)
      || snapshot.player.bombs < 0 || snapshot.player.bombs > 5
      || !Number.isInteger(snapshot.player.maxLives)
      || snapshot.player.maxLives < 3 || snapshot.player.maxLives > 8
      || snapshot.player.lives > snapshot.player.maxLives
      || !Number.isInteger(snapshot.player.maxBombs)
      || snapshot.player.maxBombs < 3 || snapshot.player.maxBombs > 5
      || snapshot.player.bombs > snapshot.player.maxBombs) return false;
    restoring = true;
    try {
      game.state = STATE.START;
      restartGame();
      campaign.difficulty = snapshot.difficulty;
      campaign.runId = typeof snapshot.runId === "string" && snapshot.runId.length < 100
        ? snapshot.runId : campaign.runId;
      campaign.endless = Boolean(snapshot.endless) || snapshot.level > 12;
      campaign.completed = campaign.endless;
      game.level = snapshot.level;
      game.score = Math.floor(finite(snapshot.score, 0, 0, 1e9));
      for (const [id, max] of Object.entries({ engine: 3, reactor: 4, capacitor: 4, ordnance: 2, hull: 5 })) {
        campaign.upgrades[id] = Math.floor(finite(snapshot.upgrades[id], 0, 0, max));
      }
      player.maxLives = 3 + campaign.upgrades.hull;
      player.maxBombs = 3 + campaign.upgrades.ordnance;
      player.lives = Math.floor(finite(snapshot.player.lives, 3, 1, player.maxLives));
      player.bombs = Math.floor(finite(snapshot.player.bombs, 1, 0, player.maxBombs));
      player.shieldHp = Math.floor(finite(snapshot.player.shieldHp, 0, 0, 2));
      player.speed = 260 + campaign.upgrades.engine * 25;
      player.baseFireRate = 0.16 * Math.pow(0.9, campaign.upgrades.reactor);
      for (const timer of ["spreadTimer", "rapidTimer", "railTimer", "droneTimer"]) {
        player[timer] = finite(snapshot.player[timer], 0, 0, 60);
      }
      for (const key of Object.keys(campaign.stats)) {
        campaign.stats[key] = finite(snapshot.stats[key], 0, 0, 1e9);
      }
      game.killsThisLevel = 0;
      startGame();
      clearAllInput();
    } finally {
      restoring = false;
    }
    emit("sector-start", { resumed: true, sector: campaign.sector.name });
    return true;
  }

  window.BlackboxCampaign = Object.freeze({
    get state() { return campaign; },
    getState: () => campaign,
    sectors: SECTORS,
    getSector, chooseUpgrade, continueEndless, serialize, restore, drawBoss,
    setDifficulty(value) {
      if (!DIFFICULTIES[value] || (game.state !== STATE.START && game.state !== STATE.GAME_OVER)) return false;
      campaign.difficulty = value;
      game.levelPlan = getLevelPlan(game.level);
      return true;
    },
  });
})();
