const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const minimap = document.getElementById("minimap");
const mini = minimap.getContext("2d");

class ScoreDisplay extends HTMLElement {
  setScore(score) {
    this.score = score;
  }
}

class SubmitButton extends HTMLElement {}

class ShareCard extends HTMLElement {
  setConfig(config) {
    this.config = config;
  }

  setData(data) {
    this.data = data;
  }

  async share() {
    const data = this.data || {};
    const text = `Battle Royale: ${data.name || "Player"} placed #${data.rank || "?"}, kills ${data.kills || 0}, score ${data.score || 0}.`;
    if (navigator.share) {
      await navigator.share({ title: "Battle Royale Score", text, url: location.href });
      return;
    }
    await navigator.clipboard?.writeText(text);
    alert("Share text copied.");
  }
}

if (!customElements.get("score-display")) customElements.define("score-display", ScoreDisplay);
if (!customElements.get("submit-button")) customElements.define("submit-button", SubmitButton);
if (!customElements.get("share-card")) customElements.define("share-card", ShareCard);

const ui = {
  nameModal: document.getElementById("nameModal"),
  nameInput: document.getElementById("playerNameInput"),
  start: document.getElementById("startGameBtn"),
  hud: document.getElementById("hud"),
  alive: document.getElementById("aliveCount"),
  zone: document.getElementById("zoneInfo"),
  healthBar: document.getElementById("healthBar"),
  health: document.getElementById("healthFill"),
  shield: document.getElementById("shieldFill"),
  weaponHud: document.getElementById("weaponHud"),
  weaponName: document.getElementById("weaponName"),
  ammo: document.getElementById("ammoCount"),
  inventory: document.getElementById("inventoryHud"),
  pickup: document.getElementById("pickupNotif"),
  killFeed: document.getElementById("killFeed"),
  gameOver: document.getElementById("gameOverModal"),
  goTitle: document.getElementById("goTitle"),
  goStats: document.getElementById("goStats"),
  restart: document.getElementById("restartBtn"),
  share: document.getElementById("shareBtn"),
  leaderboard: document.getElementById("leaderboardBtn"),
  scoreDisplay: document.getElementById("scoreDisplay"),
  submit: document.getElementById("submitBtn"),
  shareCard: document.getElementById("shareCard"),
};

const keys = new Set();
const mouse = { x: 0, y: 0, down: false };
const world = { w: 3200, h: 3200 };
const weapons = {
  fists: { name: "Fists", damage: 10, range: 38, fireRate: 0.55, speed: 0, spread: 0, mag: 0 },
  pistol: { name: "Pistol", damage: 22, range: 520, fireRate: 0.32, speed: 760, spread: 0.08, mag: 12 },
  rifle: { name: "Rifle", damage: 16, range: 720, fireRate: 0.11, speed: 980, spread: 0.04, mag: 30 },
  shotgun: { name: "Shotgun", damage: 12, range: 310, fireRate: 0.7, speed: 760, spread: 0.24, mag: 6, pellets: 6 },
};

let state;
let last = performance.now();
let pickupTimer = 0;
let gameOverData = null;
let submitBound = false;

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function resize() {
  canvas.width = innerWidth * devicePixelRatio;
  canvas.height = innerHeight * devicePixelRatio;
  canvas.style.width = `${innerWidth}px`;
  canvas.style.height = `${innerHeight}px`;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}

function makePlayer(name) {
  return {
    id: "player",
    name,
    x: world.w * 0.5,
    y: world.h * 0.5,
    r: 15,
    hp: 100,
    shield: 0,
    alive: true,
    kills: 0,
    speed: 210,
    weapon: "pistol",
    ammo: { pistol: 36, rifle: 0, shotgun: 0 },
    meds: 0,
    pain: 0,
    reload: 0,
    ai: false,
    color: "#27d17f",
  };
}

function startGame() {
  const name = ui.nameInput.value.trim() || "Player";
  ui.nameModal.classList.add("hidden");
  ui.hud.classList.add("active");
  ui.healthBar.classList.add("active");
  ui.weaponHud.classList.add("active");
  ui.inventory.classList.add("active");
  minimap.classList.add("active");
  ui.gameOver.classList.remove("active");
  gameOverData = null;

  state = {
    phase: "plane",
    phaseTime: 0,
    player: makePlayer(name),
    bots: [],
    loot: [],
    bullets: [],
    effects: [],
    camera: { x: 0, y: 0 },
    plane: { x: -180, y: rand(520, world.h - 520), vx: 470 },
    zone: { x: world.w / 2, y: world.h / 2, r: 1450, targetR: 1450, nextShrink: 18 },
    score: 0,
    rank: 30,
  };

  for (let i = 0; i < 29; i++) {
    const bot = makePlayer(botName(i));
    bot.id = `bot-${i}`;
    bot.ai = true;
    bot.color = "#d94848";
    bot.x = rand(180, world.w - 180);
    bot.y = rand(180, world.h - 180);
    bot.weapon = ["pistol", "rifle", "shotgun"][Math.floor(rand(0, 3))];
    bot.ammo[bot.weapon] = 80;
    bot.brain = rand(0, 2);
    state.bots.push(bot);
  }

  spawnLoot(150);
  setupShare();
  addFeed("Plane is crossing the island. Press Space to jump.");
}

function botName(i) {
  const names = ["Ghost", "Viper", "Nova", "Rook", "Echo", "Blaze", "Raven", "Wolf", "Ace", "Zero"];
  return `${names[i % names.length]}${Math.floor(i / names.length) + 1}`;
}

function spawnLoot(count) {
  const types = ["med", "pain", "ammo_pistol", "ammo_rifle", "ammo_shotgun", "pistol", "rifle", "shotgun", "shield"];
  for (let i = 0; i < count; i++) {
    const type = types[Math.floor(rand(0, types.length))];
    state.loot.push({ id: crypto.randomUUID(), type, x: rand(120, world.w - 120), y: rand(120, world.h - 120), r: 12 });
  }
}

function setupShare() {
  ui.shareCard.setConfig({ title: "Battle Royale", shareText: "{name} score {score}" });
  if (!submitBound) {
    ui.submit.addEventListener("submit-score", () => saveScore());
    submitBound = true;
  }
}

function update(dt) {
  if (!state || gameOverData) return;
  state.phaseTime += dt;
  pickupTimer = Math.max(0, pickupTimer - dt);

  if (state.phase === "plane") {
    state.plane.x += state.plane.vx * dt;
    state.player.x = clamp(state.plane.x, 80, world.w - 80);
    state.player.y = state.plane.y;
    if (keys.has(" ") || state.plane.x > world.w + 100) dropPlayer();
  } else if (state.phase === "drop") {
    state.player.r = Math.max(15, state.player.r - 34 * dt);
    if (state.player.r <= 15) {
      state.phase = "fight";
      addFeed("You landed. Left click to shoot. Press E to heal.");
    }
  } else {
    updatePlayer(dt);
    updateBots(dt);
    updateLoot();
    updateZone(dt);
  }

  updateBullets(dt);
  state.effects = state.effects.filter(e => (e.life -= dt) > 0);
  state.camera.x = clamp(state.player.x - innerWidth / 2, 0, world.w - innerWidth);
  state.camera.y = clamp(state.player.y - innerHeight / 2, 0, world.h - innerHeight);
  updateHud();
  checkEnd();
}

function dropPlayer() {
  if (state.phase !== "plane") return;
  state.phase = "drop";
  state.player.r = 42;
  addFeed("Parachute deployed.");
}

function updatePlayer(dt) {
  const p = state.player;
  if (!p.alive) return;
  let dx = 0;
  let dy = 0;
  if (keys.has("w") || keys.has("arrowup")) dy -= 1;
  if (keys.has("s") || keys.has("arrowdown")) dy += 1;
  if (keys.has("a") || keys.has("arrowleft")) dx -= 1;
  if (keys.has("d") || keys.has("arrowright")) dx += 1;
  const len = Math.hypot(dx, dy) || 1;
  p.x = clamp(p.x + (dx / len) * p.speed * dt, 0, world.w);
  p.y = clamp(p.y + (dy / len) * p.speed * dt, 0, world.h);
  p.reload = Math.max(0, p.reload - dt);
  if (mouse.down) fire(p, screenToWorld(mouse));
  if (keys.has("e")) useBestHeal();
}

function updateBots(dt) {
  const actors = liveActors();
  for (const bot of state.bots) {
    if (!bot.alive) continue;
    bot.reload = Math.max(0, bot.reload - dt);
    bot.brain -= dt;
    const target = actors.filter(a => a.id !== bot.id).sort((a, b) => dist(bot, a) - dist(bot, b))[0];
    if (!target) continue;
    const d = dist(bot, target);
    if (bot.brain <= 0) {
      bot.tx = d > 430 ? target.x + rand(-180, 180) : bot.x + rand(-260, 260);
      bot.ty = d > 430 ? target.y + rand(-180, 180) : bot.y + rand(-260, 260);
      bot.brain = rand(0.45, 1.2);
    }
    if (bot.tx) {
      const vx = bot.tx - bot.x;
      const vy = bot.ty - bot.y;
      const len = Math.hypot(vx, vy) || 1;
      bot.x = clamp(bot.x + (vx / len) * 150 * dt, 0, world.w);
      bot.y = clamp(bot.y + (vy / len) * 150 * dt, 0, world.h);
    }
    if (d < weapons[bot.weapon].range * 0.85) fire(bot, target);
    if (bot.hp < 45 && bot.meds > 0) {
      bot.meds--;
      bot.hp = Math.min(100, bot.hp + 45);
    }
  }
}

function updateLoot() {
  const p = state.player;
  for (let i = state.loot.length - 1; i >= 0; i--) {
    const item = state.loot[i];
    if (dist(p, item) > p.r + item.r + 10) continue;
    applyLoot(p, item.type);
    state.loot.splice(i, 1);
  }
}

function applyLoot(p, type) {
  const names = {
    med: "Medical Kit",
    pain: "Painkiller",
    shield: "Armor Plate",
    ammo_pistol: "Pistol Ammo",
    ammo_rifle: "Rifle Ammo",
    ammo_shotgun: "Shotgun Shells",
    pistol: "Pistol",
    rifle: "Rifle",
    shotgun: "Shotgun",
  };
  if (type === "med") p.meds++;
  else if (type === "pain") p.pain++;
  else if (type === "shield") p.shield = Math.min(100, p.shield + 35);
  else if (type.startsWith("ammo_")) p.ammo[type.replace("ammo_", "")] += type === "ammo_shotgun" ? 12 : 30;
  else {
    p.weapon = type;
    p.ammo[type] += type === "shotgun" ? 12 : 30;
  }
  showPickup(`Picked up ${names[type]}`);
}

function useBestHeal() {
  const p = state.player;
  if (p.hp < 70 && p.meds > 0) {
    p.meds--;
    p.hp = Math.min(100, p.hp + 50);
    showPickup("Used Medical Kit");
  } else if (p.shield < 100 && p.pain > 0) {
    p.pain--;
    p.shield = Math.min(100, p.shield + 25);
    showPickup("Used Painkiller");
  }
  keys.delete("e");
}

function fire(shooter, target) {
  const weapon = weapons[shooter.weapon];
  if (shooter.reload > 0) return;
  if (shooter.weapon !== "fists" && shooter.ammo[shooter.weapon] <= 0) return;
  shooter.reload = weapon.fireRate;
  if (shooter.weapon !== "fists") shooter.ammo[shooter.weapon]--;
  const angle = Math.atan2(target.y - shooter.y, target.x - shooter.x);
  const count = weapon.pellets || 1;
  for (let i = 0; i < count; i++) {
    const a = angle + rand(-weapon.spread, weapon.spread);
    state.bullets.push({
      owner: shooter.id,
      x: shooter.x + Math.cos(a) * shooter.r,
      y: shooter.y + Math.sin(a) * shooter.r,
      vx: Math.cos(a) * weapon.speed,
      vy: Math.sin(a) * weapon.speed,
      life: weapon.range / Math.max(1, weapon.speed),
      damage: weapon.damage,
    });
  }
}

function updateBullets(dt) {
  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const b = state.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let hit = false;
    for (const actor of liveActors()) {
      if (actor.id === b.owner || dist(actor, b) > actor.r) continue;
      damage(actor, b.damage, b.owner);
      state.effects.push({ x: b.x, y: b.y, life: 0.18 });
      hit = true;
      break;
    }
    if (hit || b.life <= 0 || b.x < 0 || b.y < 0 || b.x > world.w || b.y > world.h) state.bullets.splice(i, 1);
  }
}

function damage(actor, amount, ownerId) {
  const shieldHit = Math.min(actor.shield, amount);
  actor.shield -= shieldHit;
  actor.hp -= amount - shieldHit;
  if (actor.hp > 0) return;
  actor.alive = false;
  const killer = liveActors().find(a => a.id === ownerId);
  if (killer) killer.kills++;
  if (ownerId === "player") state.score += 100;
  const killerName = killer ? killer.name : "Zone";
  addFeed(`${killerName} eliminated ${actor.name}`);
}

function updateZone(dt) {
  const z = state.zone;
  z.nextShrink -= dt;
  if (z.nextShrink <= 0) {
    z.targetR = Math.max(120, z.targetR * 0.68);
    z.x = rand(500, world.w - 500);
    z.y = rand(500, world.h - 500);
    z.nextShrink = 24;
    addFeed("The safe zone is shrinking.");
  }
  z.r += (z.targetR - z.r) * 0.08 * dt;
  for (const actor of liveActors()) {
    if (dist(actor, z) > z.r) damage(actor, 10 * dt, "zone");
  }
}

function liveActors() {
  return [state.player, ...state.bots].filter(a => a.alive);
}

function checkEnd() {
  const alive = liveActors();
  state.rank = state.player.alive ? alive.length : alive.length + 1;
  if (!state.player.alive) return endGame(false);
  if (alive.length === 1 && alive[0].id === "player") return endGame(true);
}

function endGame(win) {
  if (gameOverData) return;
  state.score += win ? 500 : 0;
  gameOverData = {
    win,
    name: state.player.name,
    kills: state.player.kills,
    rank: win ? 1 : state.rank,
    score: state.score + state.player.kills * 50 + Math.max(0, 31 - state.rank) * 20,
  };
  saveScore();
  ui.shareCard.setData(gameOverData);
  ui.goTitle.textContent = win ? "Winner Winner Chicken Dinner" : `Finished #${gameOverData.rank}`;
  ui.goTitle.className = win ? "win" : "lose";
  ui.goStats.innerHTML = `Kills: ${gameOverData.kills}<br>Score: ${gameOverData.score}<br>Alive rank: #${gameOverData.rank}`;
  ui.gameOver.classList.add("active");
}

function saveScore() {
  if (!gameOverData) return;
  const board = JSON.parse(localStorage.getItem("brLeaderboard") || "[]");
  board.push({ ...gameOverData, date: new Date().toLocaleString() });
  board.sort((a, b) => b.score - a.score);
  localStorage.setItem("brLeaderboard", JSON.stringify(board.slice(0, 10)));
}

function showLeaderboard() {
  const board = JSON.parse(localStorage.getItem("brLeaderboard") || "[]");
  if (!board.length) {
    alert("No leaderboard entries yet.");
    return;
  }
  alert(board.map((e, i) => `${i + 1}. ${e.name}  score ${e.score}  kills ${e.kills}  rank #${e.rank}`).join("\n"));
}

function showPickup(text) {
  ui.pickup.textContent = text;
  ui.pickup.style.opacity = "1";
  pickupTimer = 1;
}

function addFeed(text) {
  const div = document.createElement("div");
  div.className = "kf-entry";
  div.textContent = text;
  ui.killFeed.prepend(div);
  setTimeout(() => div.remove(), 4500);
}

function updateHud() {
  const p = state.player;
  ui.alive.textContent = liveActors().length;
  ui.zone.textContent = state.phase === "plane" ? "SPACE: jump" : `Zone closes in ${Math.ceil(state.zone.nextShrink)}s`;
  ui.health.style.width = `${clamp(p.hp, 0, 100)}%`;
  ui.shield.style.width = `${clamp(p.shield, 0, 100)}%`;
  ui.weaponName.textContent = weapons[p.weapon].name;
  ui.ammo.textContent = p.weapon === "fists" ? "No ammo needed" : `${p.ammo[p.weapon]} rounds`;
  ui.inventory.innerHTML = `<div class="inv-item">Med Kits: ${p.meds}</div><div class="inv-item">Painkillers: ${p.pain}</div><div class="inv-item">Kills: ${p.kills}</div>`;
  if (pickupTimer <= 0) ui.pickup.style.opacity = "0";
  ui.scoreDisplay.setScore(state.score);
}

function screenToWorld(point) {
  return { x: point.x + state.camera.x, y: point.y + state.camera.y };
}

function render() {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  if (!state) return;
  const cam = state.camera;
  ctx.save();
  ctx.translate(-cam.x, -cam.y);
  drawWorld();
  ctx.restore();
  drawMinimap();
}

function drawWorld() {
  ctx.fillStyle = "#567a49";
  ctx.fillRect(0, 0, world.w, world.h);
  ctx.strokeStyle = "rgba(255,255,255,.08)";
  for (let x = 0; x < world.w; x += 160) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, world.h);
    ctx.stroke();
  }
  for (let y = 0; y < world.h; y += 160) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(world.w, y);
    ctx.stroke();
  }
  drawZone();
  drawLoot();
  if (state.phase === "plane") drawPlane();
  for (const b of state.bullets) drawCircle(b.x, b.y, 3, "#ffd24d");
  for (const e of state.effects) drawCircle(e.x, e.y, 18 * e.life, "rgba(255,220,90,.8)");
  for (const actor of [state.player, ...state.bots]) if (actor.alive) drawActor(actor);
}

function drawZone() {
  const z = state.zone;
  ctx.save();
  ctx.fillStyle = "rgba(50,90,180,.22)";
  ctx.beginPath();
  ctx.rect(0, 0, world.w, world.h);
  ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2, true);
  ctx.fill("evenodd");
  ctx.restore();
  ctx.strokeStyle = "#6ec6ff";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
  ctx.stroke();
}

function drawLoot() {
  for (const item of state.loot) {
    const color = item.type.includes("ammo") ? "#e8d15c" : item.type === "med" ? "#f2f2f2" : item.type === "pain" ? "#ff8f4d" : item.type === "shield" ? "#64c7ff" : "#222";
    drawCircle(item.x, item.y, item.r, color);
    ctx.fillStyle = "#111";
    ctx.font = "10px Arial";
    ctx.textAlign = "center";
    ctx.fillText(item.type[0].toUpperCase(), item.x, item.y + 3);
  }
}

function drawPlane() {
  const p = state.plane;
  ctx.fillStyle = "#202833";
  ctx.fillRect(p.x - 70, p.y - 12, 140, 24);
  ctx.fillRect(p.x - 18, p.y - 58, 36, 116);
  ctx.fillStyle = "#9bb7d4";
  ctx.fillRect(p.x + 34, p.y - 7, 28, 14);
}

function drawActor(actor) {
  drawCircle(actor.x, actor.y, actor.r, actor.color);
  ctx.fillStyle = "#fff";
  ctx.font = "12px Arial";
  ctx.textAlign = "center";
  ctx.fillText(actor.name, actor.x, actor.y - actor.r - 10);
  ctx.fillStyle = "#111";
  ctx.fillRect(actor.x - 20, actor.y + actor.r + 6, 40, 5);
  ctx.fillStyle = "#e84d4d";
  ctx.fillRect(actor.x - 20, actor.y + actor.r + 6, 40 * clamp(actor.hp / 100, 0, 1), 5);
  if (actor.weapon !== "fists") {
    const target = actor.id === "player" ? screenToWorld(mouse) : { x: actor.x + 1, y: actor.y };
    const a = Math.atan2(target.y - actor.y, target.x - actor.x);
    ctx.strokeStyle = "#191919";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(actor.x, actor.y);
    ctx.lineTo(actor.x + Math.cos(a) * 24, actor.y + Math.sin(a) * 24);
    ctx.stroke();
  }
}

function drawCircle(x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawMinimap() {
  mini.clearRect(0, 0, 150, 150);
  mini.fillStyle = "#2f4f38";
  mini.fillRect(0, 0, 150, 150);
  const sx = 150 / world.w;
  const sy = 150 / world.h;
  mini.strokeStyle = "#6ec6ff";
  mini.beginPath();
  mini.arc(state.zone.x * sx, state.zone.y * sy, state.zone.r * sx, 0, Math.PI * 2);
  mini.stroke();
  mini.fillStyle = "#d94848";
  for (const bot of state.bots) if (bot.alive) mini.fillRect(bot.x * sx - 1, bot.y * sy - 1, 2, 2);
  mini.fillStyle = "#27d17f";
  mini.fillRect(state.player.x * sx - 2, state.player.y * sy - 2, 4, 4);
}

function loop(now = performance.now()) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

addEventListener("resize", resize);
addEventListener("keydown", e => {
  keys.add(e.key.toLowerCase());
  if (e.key === " ") e.preventDefault();
});
addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));
canvas.addEventListener("mousemove", e => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
});
canvas.addEventListener("mousedown", e => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
  mouse.down = true;
});
addEventListener("mouseup", () => {
  mouse.down = false;
});

ui.start.addEventListener("click", startGame);
ui.nameInput.addEventListener("keydown", e => {
  if (e.key === "Enter") startGame();
});
ui.restart.addEventListener("click", startGame);
ui.share.addEventListener("click", () => ui.shareCard.share());
ui.leaderboard.addEventListener("click", showLeaderboard);

resize();
requestAnimationFrame(loop);
