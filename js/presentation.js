/* BLACKBOX SQUADRON · native canvas presentation
 * Rendering only. No external assets, timers, entity mutation or game rules.
 */
(() => {
  "use strict";

  const TAU = Math.PI * 2;
  const CYAN = "#79e4eb";
  const AMBER = "#ffbc6a";
  const WHITE = "#e2f3f4";
  const MONO = '"SFMono-Regular", Consolas, "Liberation Mono", monospace';
  const sectorPalettes = [
    { deep: "#070f1b", haze: "#173849", edge: "#83bec4", planet: "#23485d", ring: "#356573" },
    { deep: "#111017", haze: "#4a2925", edge: "#d7a978", planet: "#614130", ring: "#8f6750" },
    { deep: "#080e20", haze: "#282e54", edge: "#9ba9df", planet: "#313e71", ring: "#5c568a" },
    { deep: "#071714", haze: "#154237", edge: "#78bbae", planet: "#215543", ring: "#326956" },
    { deep: "#150d1c", haze: "#3c244e", edge: "#c4a0d9", planet: "#52345b", ring: "#754778" },
    { deep: "#141115", haze: "#4a2829", edge: "#d2a095", planet: "#62313d", ring: "#8f5758" },
  ];
  const scenery = new Map();
  const pickupNames = {
    spread: "SPREAD", rapid: "RAPID", shield: "SHIELD", bomb: "PULSE",
    repair: "REPAIR", score: "INTEL", rail: "RAIL", drone: "DRONES",
  };

  function polygon(points, fill, stroke, width = 1) {
    ctx.beginPath();
    points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }

  function ellipse(x, y, rx, ry, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    ctx.fill();
  }

  function getCampaign() {
    return window.BlackboxCampaign || null;
  }

  function reducedMotion() {
    return !!window.BBPlatform?.settings.reducedMotion;
  }

  function sectorIndex() {
    return ((Math.max(1, game.level) - 1) % sectorPalettes.length);
  }

  // Pre-render the large gradients and planetary surfaces once per sector.
  function makeScenery(index) {
    const surface = document.createElement("canvas");
    surface.width = W;
    surface.height = H;
    const c = surface.getContext("2d");
    const p = sectorPalettes[index];
    c.fillStyle = p.deep;
    c.fillRect(0, 0, W, H);
    const nebula = c.createRadialGradient(W * .8, H * .28, 5, W * .8, H * .28, W * .86);
    nebula.addColorStop(0, p.haze);
    nebula.addColorStop(.56, p.deep);
    nebula.addColorStop(1, "#050a12");
    c.fillStyle = nebula;
    c.fillRect(0, 0, W, H);

    // The planet sits outside the primary firing lane, behind the starfield.
    const px = index % 2 ? 28 : W - 32;
    const py = H * (.25 + (index % 3) * .09);
    const r = 115 + (index % 3) * 19;
    if (index % 3 === 1) {
      c.save(); c.translate(px, py); c.rotate(-.5);
      c.strokeStyle = p.ring; c.globalAlpha = .23; c.lineWidth = 15;
      c.beginPath(); c.ellipse(0, 0, r * 1.8, r * .32, 0, 0, TAU); c.stroke();
      c.lineWidth = 2; c.globalAlpha = .32;
      c.beginPath(); c.ellipse(0, 0, r * 2, r * .38, 0, 0, TAU); c.stroke(); c.restore();
    }
    const glow = c.createRadialGradient(px, py, r * .95, px, py, r * 1.13);
    glow.addColorStop(0, p.edge + "30"); glow.addColorStop(1, p.edge + "00");
    c.fillStyle = glow; c.beginPath(); c.arc(px, py, r * 1.14, 0, TAU); c.fill();
    c.save();
    c.beginPath(); c.arc(px, py, r, 0, TAU); c.clip();
    const planet = c.createLinearGradient(px - r, py - r, px + r * .55, py + r * .35);
    planet.addColorStop(0, p.planet); planet.addColorStop(.5, p.deep); planet.addColorStop(1, "#060a12");
    c.fillStyle = planet; c.fillRect(px - r, py - r, r * 2, r * 2);
    c.lineWidth = .7; c.strokeStyle = p.edge; c.globalAlpha = .09;
    for (let i = 0; i < 16; i++) {
      const yy = py - r + i * 19;
      c.beginPath(); c.ellipse(px, yy, r * 1.1, 11 + i * 2, -.3, 0, TAU); c.stroke();
    }
    c.restore();
    c.strokeStyle = p.edge + "30"; c.lineWidth = 1;
    c.beginPath(); c.arc(px, py, r, Math.PI * .86, Math.PI * 1.8); c.stroke();

    // Derelict navigation infrastructure: dim, non-interactive scenery.
    c.save(); c.globalAlpha = .12; c.strokeStyle = p.edge; c.lineWidth = 1;
    const sx = index % 2 ? W - 40 : 27;
    c.translate(sx, H * .71); c.rotate(-.24);
    c.strokeRect(-9, -44, 18, 89);
    c.strokeRect(-32, -22, 64, 8);
    c.strokeRect(-32, 13, 64, 8);
    c.beginPath(); c.moveTo(-42, -40); c.lineTo(-42, 45); c.moveTo(42, -40); c.lineTo(42, 45); c.stroke();
    c.restore();
    const vignette = c.createRadialGradient(W / 2, H / 2, W * .22, W / 2, H / 2, H * .72);
    vignette.addColorStop(0, "#00000000"); vignette.addColorStop(1, "#00060da6");
    c.fillStyle = vignette; c.fillRect(0, 0, W, H);
    return surface;
  }

  drawStars = function () {
    const index = sectorIndex();
    const calm = reducedMotion();
    if (!scenery.has(index)) scenery.set(index, makeScenery(index));
    ctx.save();
    ctx.drawImage(scenery.get(index), 0, 0);
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const bright = s.bright * (calm ? .78 : .78 + Math.sin(game.time * .7 + i * 1.27) * .15);
      ctx.globalAlpha = bright;
      ctx.fillStyle = i % 5 === 0 ? AMBER : "#c3dde8";
      const size = s.size > 1.8 ? 1.6 : .9;
      ctx.fillRect(s.x, s.y, size, size + s.speed * .009);
      if (i % 23 === 0) {
        ctx.globalAlpha = bright * .24;
        ctx.fillRect(s.x - 2, s.y + size, 5, .6);
      }
    }
    ctx.globalAlpha = 1;
    // Sparse flight reference marks clarify movement without adding a grid.
    ctx.fillStyle = "#78b7c51a";
    for (let y = calm ? 0 : (game.time * 18) % 80; y < H; y += 80) {
      ctx.fillRect(11, y, 4, 1); ctx.fillRect(W - 15, y, 4, 1);
    }
    ctx.restore();
  };

  drawPlayer = function () {
    if (!player.alive) return;
    const calm = reducedMotion();
    ctx.save();
    ctx.translate(player.x, player.y);
    if (player.invuln > 0) ctx.globalAlpha = calm ? .72 : .48 + .52 * Math.abs(Math.sin(game.time * 19));
    const thrust = calm ? 14 : 14 + Math.sin(game.time * 38) * 4;
    for (const side of [-1, 1]) {
      const x = side * 6;
      polygon([[x - 4, 17], [x + 4, 17], [x + 2, 24 + thrust], [x, 30 + thrust], [x - 2, 24 + thrust]], "#39c7ee24");
      polygon([[x - 2, 20], [x + 2, 20], [x, 26 + thrust * .75]], player.rapidTimer > 0 ? AMBER : CYAN);
      polygon([[x - 1, 20], [x + 1, 20], [x, 28]], WHITE);
    }
    polygon([[0, -29], [-6, -15], [-16, -8], [-28, 5], [-20, 10], [-13, 16], [-7, 12], [-6, 21], [6, 21], [7, 12], [13, 16], [20, 10], [28, 5], [16, -8], [6, -15]], "#142b3d", "#6d8c9c");
    for (const side of [-1, 1]) {
      polygon([[side * 5, -15], [side * 13, -8], [side * 25, 3], [side * 17, 7], [side * 9, 4]], side < 0 ? "#859bab" : "#566f83");
      polygon([[side * 17, 8], [side * 9, 5], [side * 7, 15], [side * 12, 17]], "#354d62");
      ctx.strokeStyle = "#263e50"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(side * 12, -4); ctx.lineTo(side * 19, 3); ctx.lineTo(side * 12, 5); ctx.stroke();
      ctx.fillStyle = AMBER; ctx.fillRect(side * 18 - 1, 3, 2, 3);
      ctx.fillStyle = "#bdcbd1"; ctx.fillRect(side * 11 - 1, -9, 2, 8);
    }
    polygon([[0, -29], [-4, -16], [-5, 4], [-3, 18], [3, 18], [5, 4], [4, -16]], "#b4c6d0");
    polygon([[0, -24], [-4, -12], [-4, 7], [0, 15]], "#647f91");
    polygon([[0, -20], [-3, -11], [-2, 1], [2, 1], [3, -11]], "#122c3e", "#638e9d", .6);
    polygon([[0, -17], [-1.5, -10], [-1, -1], [1, -1], [1.5, -10]], CYAN);
    ctx.fillStyle = WHITE; ctx.fillRect(-1, -13, 1, 4);
    ctx.fillStyle = "#132835"; ctx.fillRect(-8, 18, 5, 4); ctx.fillRect(3, 18, 5, 4);
    ctx.fillStyle = "#c1d0d4"; ctx.fillRect(-2, 6, 4, 5);
    ctx.fillStyle = "#233d4d"; ctx.fillRect(-1, 7, 2, 3);

    if (player.spreadTimer > 0) {
      for (const side of [-1, 1]) {
        const x = side * 25;
        polygon([[x - 3, -7], [x + 3, -7], [x + 4, 9], [x - 4, 9]], "#315143", "#81dd9d");
        ctx.fillStyle = "#c6f4d3"; ctx.fillRect(x - 1, -13, 2, 9);
      }
    }
    if (player.railTimer > 0) {
      ctx.fillStyle = "#3b7893"; ctx.fillRect(-3, -35, 6, 17);
      ctx.fillStyle = "#c8f3ff"; ctx.fillRect(-1, -38, 2, 21);
    }
    if (player.droneTimer > 0) {
      for (const side of [-1, 1]) {
        const x = side * 37;
        const y = calm ? 6 : 6 + Math.sin(game.time * 3 + side) * 3;
        polygon([[x, y - 9], [x + 6, y + 4], [x, y + 1], [x - 6, y + 4]], "#5c537e", "#c4b3f0");
        ctx.fillStyle = "#dec8ff"; ctx.fillRect(x - 1, y - 6, 2, 5);
        polygon([[x - 2, y + 4], [x + 2, y + 4], [x, y + 13]], "#b69bf77a");
      }
    }
    if (player.shieldHp > 0) {
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = "#83edf59c";
      for (let a = 0; a < 6; a++) {
        ctx.beginPath(); ctx.arc(0, 0, 33, a * TAU / 6 + .08, (a + 1) * TAU / 6 - .08); ctx.stroke();
      }
      ctx.strokeStyle = "#80e2f228"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, 33, 0, TAU); ctx.stroke();
    }
    if (player.lives === 1) {
      ctx.strokeStyle = "#ff8064"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-17, 3); ctx.lineTo(-13, 6); ctx.lineTo(-16, 9); ctx.stroke();
    }
    // The illuminated core marks the deliberately forgiving collision center.
    ellipse(0, 5, 1.2, 1.2, WHITE);
    ctx.restore();
  };

  drawEnemies = function () {
    ctx.save();
    for (const e of enemies) {
      if (e.type === "boss") continue;
      ctx.save(); ctx.translate(e.x, e.y);
      if (e.type === "fighter") {
        polygon([[-6, -9], [-3, -19], [-1, -9]], "#fc6b624b");
        polygon([[6, -9], [3, -19], [1, -9]], "#fc6b624b");
        polygon([[0, 16], [-6, 6], [-18, -6], [-13, -10], [-4, -7], [0, -12], [4, -7], [13, -10], [18, -6], [6, 6]], "#59667d", "#94a2b3", .8);
        polygon([[0, 11], [-4, -3], [0, -8], [4, -3]], "#263b50");
        ctx.fillStyle = "#ff796c"; ctx.fillRect(-2, -1, 4, 6);
        ctx.fillStyle = "#efafa0"; ctx.fillRect(-11, -4, 3, 2); ctx.fillRect(8, -4, 3, 2);
      } else if (e.type === "bomber") {
        const dive = e.phase === "dive";
        polygon([[-9, -12], [-5, -27 - (dive ? 10 : 0)], [-2, -12]], dive ? "#ff94666b" : "#ff946637");
        polygon([[9, -12], [5, -27 - (dive ? 10 : 0)], [2, -12]], dive ? "#ff94666b" : "#ff946637");
        polygon([[0, 20], [-9, 11], [-21, -4], [-14, -14], [-4, -10], [4, -10], [14, -14], [21, -4], [9, 11]], dive ? "#8d5140" : "#7b6955", "#cca581", .8);
        polygon([[0, 14], [-7, 3], [-6, -9], [6, -9], [7, 3]], "#352e2c");
        polygon([[0, 9], [-3, 1], [-2, -5], [2, -5], [3, 1]], "#ffb66a");
        ctx.fillStyle = dive ? "#ffd1a2" : AMBER;
        ctx.fillRect(-14, -3, 3, 7); ctx.fillRect(11, -3, 3, 7);
        if (e.hp > 1) { ctx.fillStyle = "#e7bf8360"; ctx.fillRect(-8, -20, 16, 2); }
      } else {
        polygon([[-19, 0], [-7, -10], [7, -10], [19, 0], [7, 10], [-7, 10]], "#3e6c6f", "#88bcba", .8);
        polygon([[-13, 0], [0, -7], [13, 0], [0, 7]], "#172e3b");
        ellipse(0, 0, 4, 4, "#cd9291"); ellipse(0, 0, 1.6, 1.6, "#ffe0b2");
        ctx.fillStyle = "#91d6ce"; ctx.fillRect(-13, -2, 3, 4); ctx.fillRect(10, -2, 3, 4);
      }
      if (e.fireTimer > 0 && e.fireTimer < .35) {
        ctx.globalAlpha = .45; ctx.strokeStyle = "#ff9b82"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 2, e.r + 6, 0, TAU); ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
    const campaign = getCampaign();
    if (campaign && typeof campaign.drawBoss === "function") campaign.drawBoss();
  };

  function pickupIcon(type) {
    ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath();
    if (type === "spread") {
      for (const x of [-7, 0, 7]) { ctx.moveTo(x, 7); ctx.lineTo(x, -6); ctx.lineTo(x - 2, -3); ctx.moveTo(x, -6); ctx.lineTo(x + 2, -3); }
    } else if (type === "rapid") {
      ctx.moveTo(2, -9); ctx.lineTo(-5, 1); ctx.lineTo(1, 1); ctx.lineTo(-2, 9); ctx.lineTo(6, -2); ctx.lineTo(0, -2); ctx.closePath();
    } else if (type === "shield") {
      ctx.moveTo(0, -9); ctx.lineTo(8, -5); ctx.lineTo(6, 4); ctx.lineTo(0, 9); ctx.lineTo(-6, 4); ctx.lineTo(-8, -5); ctx.closePath();
    } else if (type === "bomb") {
      ctx.arc(0, 0, 5, 0, TAU);
      for (let a = 0; a < 8; a++) { ctx.moveTo(Math.cos(a * TAU / 8) * 8, Math.sin(a * TAU / 8) * 8); ctx.lineTo(Math.cos(a * TAU / 8) * 10, Math.sin(a * TAU / 8) * 10); }
    } else if (type === "repair") {
      ctx.moveTo(0, -8); ctx.lineTo(0, 8); ctx.moveTo(-8, 0); ctx.lineTo(8, 0);
      ctx.lineWidth = 4;
    } else if (type === "score") {
      ctx.rect(-6, -8, 12, 16); ctx.moveTo(-3, -3); ctx.lineTo(3, -3); ctx.moveTo(-3, 1); ctx.lineTo(3, 1); ctx.moveTo(-3, 5); ctx.lineTo(0, 5);
    } else if (type === "rail") {
      ctx.moveTo(-4, 8); ctx.lineTo(-4, -4); ctx.moveTo(4, 8); ctx.lineTo(4, -4); ctx.moveTo(0, 5); ctx.lineTo(0, -10); ctx.moveTo(-3, -7); ctx.lineTo(0, -10); ctx.lineTo(3, -7);
    } else if (type === "drone") {
      for (const x of [-6, 6]) { ctx.moveTo(x, -6); ctx.lineTo(x + 4, 4); ctx.lineTo(x, 1); ctx.lineTo(x - 4, 4); ctx.closePath(); }
    }
    ctx.stroke();
  }

  drawPowerups = function () {
    const calm = reducedMotion();
    for (const p of powerups) {
      const info = POWERUP_TYPES[p.type];
      if (!info) continue;
      const color = p.type === "repair" ? "#9be6b4" : p.type === "bomb" ? "#c4adf6" : info.color;
      ctx.save(); ctx.translate(p.x, p.y);
      const pulse = calm ? .8 : .65 + .25 * Math.sin(p.t * 5);
      ctx.globalAlpha = pulse * .15; ellipse(0, 0, 24, 24, color);
      ctx.globalAlpha = 1;
      polygon([[-12, -17], [12, -17], [17, -12], [17, 12], [12, 17], [-12, 17], [-17, 12], [-17, -12]], "#0b1b29", color, 1.3);
      ctx.strokeStyle = color; ctx.fillStyle = color; pickupIcon(p.type);
      ctx.fillStyle = "#091320dd"; ctx.fillRect(-26, 21, 52, 12);
      ctx.fillStyle = color; ctx.font = "10px " + MONO; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(pickupNames[p.type], 0, 27);
      ctx.restore();
    }
  };

  drawBullets = function () {
    ctx.save();
    ctx.lineCap = "round";
    for (const b of playerBullets) {
      const color = b.drone ? "#c4adf6" : b.rail ? "#9ae3ff" : "#99eced";
      const vx = Number.isFinite(b.vx) ? b.vx : 0;
      const vy = Number.isFinite(b.vy) ? b.vy : -450;
      const len = Math.hypot(vx, vy) || 1;
      const tail = b.rail ? 27 : 15;
      ctx.globalAlpha = .17; ctx.strokeStyle = color; ctx.lineWidth = b.rail ? 9 : 5;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - vx / len * tail, b.y - vy / len * tail); ctx.stroke();
      ctx.globalAlpha = 1; ctx.strokeStyle = color; ctx.lineWidth = b.rail ? 3 : 2;
      ctx.beginPath(); ctx.moveTo(b.x, b.y - 5); ctx.lineTo(b.x - vx / len * (tail * .6), b.y - vy / len * (tail * .6)); ctx.stroke();
      ctx.fillStyle = WHITE; ctx.fillRect(b.x - .65, b.y - 6, 1.3, 5);
    }
    for (const b of enemyBullets) {
      const r = b.r || 4;
      ctx.globalAlpha = .14; ellipse(b.x, b.y, r + 4, r + 4, "#ff655e");
      ctx.globalAlpha = 1; ellipse(b.x, b.y, r + .8, r + .8, "#301422");
      ellipse(b.x, b.y, r, r, "#ff755e");
      ellipse(b.x - .5, b.y - .5, Math.max(1.4, r * .42), Math.max(1.4, r * .42), "#ffe7b8");
    }
    ctx.restore();
  };

  drawParticles = function () {
    ctx.save(); ctx.lineCap = "round";
    for (const p of particles) {
      const a = Math.max(0, Math.min(1, p.life / p.maxLife));
      ctx.globalAlpha = a;
      ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(.7, p.size * .6);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * .022, p.y - p.vy * .022); ctx.stroke();
      if (a > .55) { ctx.fillStyle = WHITE; ctx.fillRect(p.x - .6, p.y - .6, 1.2, 1.2); }
    }
    ctx.restore();
  };

  drawObstacles = function () {
    for (const o of obstacles) {
      ctx.save(); ctx.translate(o.x + o.w / 2, o.y + o.h / 2);
      // A fixed orientation keeps the rendering faithful to collision bounds.
      if (o.type === "scrap") {
        polygon([[-o.w / 2, -o.h * .1], [-o.w * .28, -o.h / 2], [o.w * .16, -o.h / 2], [o.w / 2, -o.h * .15], [o.w * .35, o.h / 2], [-o.w * .32, o.h * .38]], "#493f3d", "#9d8270", 1);
        polygon([[-o.w * .22, -o.h * .26], [o.w * .1, -o.h * .34], [o.w * .29, -o.h * .04], [-o.w * .01, o.h * .11]], "#766357");
        ctx.strokeStyle = "#a8896955"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-o.w * .26, o.h * .08); ctx.lineTo(-o.w * .05, o.h * .12); ctx.lineTo(o.w * .08, o.h * .34); ctx.stroke();
      } else {
        ctx.fillStyle = "#253544"; ctx.fillRect(-o.w / 2, -o.h / 2, o.w, o.h);
        ctx.strokeStyle = "#8b9baa"; ctx.lineWidth = 1; ctx.strokeRect(-o.w / 2, -o.h / 2, o.w, o.h);
        ctx.fillStyle = "#112431"; ctx.fillRect(-o.w / 2 + 4, -o.h / 2 + 4, o.w - 8, o.h - 8);
        ctx.fillStyle = "#e5b779";
        for (let x = -o.w / 2 + 4; x < o.w / 2 - 4; x += 8) ctx.fillRect(x, -o.h / 2 + 2, 4, 2);
        ctx.strokeStyle = "#627d8c"; ctx.beginPath(); ctx.moveTo(-o.w * .3, 0); ctx.lineTo(o.w * .3, 0); ctx.stroke();
      }
      ctx.restore();
    }
  };

  function hudText(value, x, y, size = 10, color = WHITE, align = "left") {
    ctx.font = size + "px " + MONO;
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "alphabetic";
    ctx.fillText(value, x, y);
  }

  drawHUD = function () {
    if (game.state === STATE.START) return;
    const campaign = getCampaign();
    const boss = campaign && campaign.state && campaign.state.boss;
    ctx.save();
    ctx.fillStyle = "#07111eea"; ctx.fillRect(0, 0, W, 47); ctx.fillRect(0, H - 41, W, 41);
    ctx.fillStyle = "#69bfc62e"; ctx.fillRect(0, 46, W, 1); ctx.fillRect(0, H - 41, W, 1);
    hudText("SCORE", 17, 15, 10, "#7f9daa");
    hudText(String(game.score).padStart(6, "0"), 17, 35, 18);
    hudText("SECTOR " + String(game.level).padStart(2, "0"), W / 2, 16, 11, CYAN, "center");
    const cleared = Math.min(game.killsThisLevel, game.killsNeeded);
    hudText(boss ? "COMMAND SHIP" : "TARGETS  " + cleared + " / " + game.killsNeeded, W / 2, 34, 11, "#a4bbc7", "center");
    hudText("PERSONAL BEST", W - 17, 15, 10, "#7f9daa", "right");
    hudText(String(Math.max(game.highScore, game.score)).padStart(6, "0"), W - 17, 35, 16, AMBER, "right");
    ctx.fillStyle = boss ? "#fa7966" : CYAN;
    ctx.fillRect(0, 46, W * Math.min(1, game.killsThisLevel / Math.max(1, game.killsNeeded)), 1);

    hudText("HULL", 17, H - 24, 11, "#91a9b4");
    for (let i = 0; i < player.maxLives; i++) {
      ctx.fillStyle = i < player.lives ? (player.lives === 1 ? "#ff8d70" : CYAN) : "#27404d";
      ctx.fillRect(17 + i * 16, H - 16, 12, 5);
    }
    hudText("PULSE", W / 2, H - 24, 11, "#91a9b4", "center");
    for (let i = 0; i < player.maxBombs; i++) {
      const x = W / 2 + (i - (player.maxBombs - 1) / 2) * 13;
      polygon([[x, H - 18], [x + 3, H - 14], [x, H - 10], [x - 3, H - 14]], i < player.bombs ? AMBER : "#29404c");
    }
    hudText(player.shieldHp > 0 ? "SHIELD ACTIVE" : "INTERCEPTOR / B-01", W - 17, H - 24, 11, player.shieldHp > 0 ? CYAN : "#91a9b4", "right");
    hudText(player.lives === 1 ? "HULL CRITICAL" : "FLIGHT SYSTEMS ONLINE", W - 17, H - 11, 9, player.lives === 1 ? "#ff8d70" : "#5f8796", "right");

    const active = [
      ["SPR", player.spreadTimer, POWERUP_TYPES.spread.duration, "#9ce2a9"],
      ["RAP", player.rapidTimer, POWERUP_TYPES.rapid.duration, AMBER],
      ["RAIL", player.railTimer, POWERUP_TYPES.rail.duration, "#9fd6ff"],
      ["DRN", player.droneTimer, POWERUP_TYPES.drone.duration, "#cbb0ef"],
    ].filter(item => item[1] > 0);
    active.forEach(([label, remaining, duration, color], i) => {
      const x = W / 2 - active.length * 37 + i * 74;
      ctx.fillStyle = "#091321e0"; ctx.fillRect(x, H - 64, 70, 18);
      hudText(label + " " + Math.ceil(remaining), x + 4, H - 51, 10, color);
      ctx.fillStyle = color; ctx.fillRect(x, H - 47, 70 * Math.min(1, remaining / Math.max(1, duration)), 1);
    });
    ctx.restore();
  };

  window.BlackboxPresentation = {
    version: "0.5.0",
    palettes: sectorPalettes,
    clearCache() { scenery.clear(); },
  };
})();
