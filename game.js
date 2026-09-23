// 정글 백신 런
// 바이브 코딩 실습용 3레인 러닝 게임.
// 속도를 더 빠르게, 목숨을 더 많이 — 아래 숫자만 바꿔도 느낌이 달라집니다.
const CONFIG = {
  maxLives: 3,
  invulnTime: 1,
  startSpeed: 0.34,
  maxSpeed: 0.95,
  jumpSpeed: 720,
  gravity: 1900,
  jumpClear: 52,
  playerHeight: { dog: 112, dogSit: 108, chick: 82 },
};

const W = 480;
const H = 780;
const STORAGE_KEY = "jungle-vaccine-run";

const TIPS = [
  "낮은 초록 바이러스는 점프하거나 레인을 바꾸세요",
  "키 큰 보라 바이러스는 레인 이동으로만 피해요",
  "백신은 목숨을 1 회복해요. 최대는 3개",
  "별·과일·보석을 연속으로 먹으면 콤보!",
];

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const ui = {
  menu: document.getElementById("screen-menu"),
  select: document.getElementById("screen-select"),
  over: document.getElementById("screen-over"),
  hud: document.getElementById("hud"),
  controls: document.getElementById("controls"),
  hearts: document.getElementById("hearts"),
  score: document.getElementById("score-label"),
  distance: document.getElementById("distance-label"),
  tip: document.getElementById("tip"),
  gear: document.getElementById("btn-gear"),
  settings: document.getElementById("screen-settings"),
  settingsNote: document.getElementById("settings-note"),
  optBgm: document.getElementById("opt-bgm"),
  optSfx: document.getElementById("opt-sfx"),
  volBgm: document.getElementById("vol-bgm"),
  volSfx: document.getElementById("vol-sfx"),
  volBgmLabel: document.getElementById("vol-bgm-label"),
  volSfxLabel: document.getElementById("vol-sfx-label"),
  menuCharacter: document.getElementById("menu-character"),
  menuBest: document.getElementById("menu-best"),
  overScore: document.getElementById("over-score"),
  overDistance: document.getElementById("over-distance"),
  overBest: document.getElementById("over-best"),
  overNew: document.getElementById("over-new"),
};

const sprites = { dog: {}, chick: {} };

let state = "menu";
let character = "dog";
let best = 0;
let paused = false;
const audioSettings = {
  bgm: true,
  sfx: true,
  bgmVolume: 0.32,
  sfxVolume: 1,
};

let lives = CONFIG.maxLives;
let distance = 0;
let itemScore = 0;
let runTime = 0;
let combo = 1;
let comboLeft = 0;
let invuln = 0;
let flash = 0;
let shake = 0;
let spawnIn = 1.2;
let roadScroll = 0;
let entities = [];
let particles = [];
let floaters = [];
let endedNewBest = false;

const player = { lane: 1, lanePos: 1, jumpZ: 0, vy: 0 };

function totalScore() {
  return Math.floor(distance) + itemScore;
}

function speed() {
  const t = Math.min(1, runTime / 70);
  return CONFIG.startSpeed + (CONFIG.maxSpeed - CONFIG.startSpeed) * t;
}

function loadSave() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    best = Number(data.best) || 0;
    character = data.character === "chick" ? "chick" : "dog";
    if (data.audio) {
      audioSettings.bgm = data.audio.bgm !== false;
      audioSettings.sfx = data.audio.sfx !== false;
      audioSettings.bgmVolume = clamp01(data.audio.bgmVolume, 0.32);
      audioSettings.sfxVolume = clamp01(data.audio.sfxVolume, 1);
    } else if (data.mute) {
      audioSettings.bgm = false;
      audioSettings.sfx = false;
    }
  } catch (err) {
    best = 0;
    character = "dog";
  }
}

function clamp01(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    best,
    character,
    audio: audioSettings,
  }));
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(src));
    img.src = src;
  });
}

// 배경음악: Alex Morgan, "K-Pop Dance Instrumental With Bright Hooks" (CC BY 4.0, Free Music Archive)
// 효과음: Mixkit (Mixkit License)
const bgm = new Audio("audio/bgm.mp3");
bgm.loop = true;
bgm.volume = audioSettings.bgmVolume;
bgm.preload = "auto";

const sfx = {
  jump: "audio/jump.mp3",
  score: "audio/score.mp3",
  vaccine: "audio/vaccine.mp3",
  hit: "audio/hit.mp3",
  over: "audio/over.mp3",
};
Object.values(sfx).forEach((src) => {
  const audio = new Audio(src);
  audio.preload = "auto";
});
let musicOn = false;

function playSfx(name, volume) {
  if (!audioSettings.sfx || audioSettings.sfxVolume <= 0) return;
  const audio = new Audio(sfx[name]);
  audio.volume = Math.min(1, volume * audioSettings.sfxVolume);
  audio.play().catch(() => {});
}

function applyMusic() {
  bgm.volume = audioSettings.bgmVolume;
  const canPlay = musicOn && audioSettings.bgm && audioSettings.bgmVolume > 0 && state !== "over";
  if (canPlay) bgm.play().catch(() => {});
  else bgm.pause();
}

function ensureMusic() {
  musicOn = true;
  applyMusic();
}

function playJump() { playSfx("jump", 0.55); }
function playGem() { playSfx("score", 0.62); }
function playVaccine() { playSfx("vaccine", 0.58); }
function playHit() { playSfx("hit", 0.7); }
function playOver() {
  bgm.pause();
  playSfx("over", 0.7);
}

function syncSettingsUi() {
  ui.optBgm.setAttribute("aria-pressed", audioSettings.bgm ? "true" : "false");
  ui.optSfx.setAttribute("aria-pressed", audioSettings.sfx ? "true" : "false");
  ui.volBgm.value = String(Math.round(audioSettings.bgmVolume * 100));
  ui.volSfx.value = String(Math.round(audioSettings.sfxVolume * 100));
  ui.volBgmLabel.textContent = ui.volBgm.value;
  ui.volSfxLabel.textContent = ui.volSfx.value;
  ui.volBgm.disabled = !audioSettings.bgm;
  ui.volSfx.disabled = !audioSettings.sfx;
}

function readSettings() {
  audioSettings.bgm = ui.optBgm.getAttribute("aria-pressed") === "true";
  audioSettings.sfx = ui.optSfx.getAttribute("aria-pressed") === "true";
  audioSettings.bgmVolume = Number(ui.volBgm.value) / 100;
  audioSettings.sfxVolume = Number(ui.volSfx.value) / 100;
  syncSettingsUi();
  ensureMusic();
  save();
}

function openSettings() {
  paused = state === "play";
  ui.menu.hidden = true;
  ui.select.hidden = true;
  ui.over.hidden = true;
  ui.settings.hidden = false;
  ui.settingsNote.hidden = !paused;
  ui.gear.hidden = true;
  if (paused) {
    ui.hud.hidden = true;
    ui.controls.hidden = true;
  }
  syncSettingsUi();
  ensureMusic();
}

function closeSettings() {
  ui.settings.hidden = true;
  paused = false;
  const playing = state === "play";
  ui.menu.hidden = state !== "menu";
  ui.select.hidden = state !== "select";
  ui.over.hidden = state !== "over";
  ui.hud.hidden = !playing;
  ui.controls.hidden = !playing;
  ui.gear.hidden = !playing;
  ensureMusic();
}

function settingsOpen() {
  return !ui.settings.hidden;
}

function characterName() {
  return character === "chick" ? "삐약" : "멍멍";
}

function refreshMenu() {
  ui.menuCharacter.textContent = characterName();
  ui.menuBest.textContent = String(best);
  document.querySelectorAll(".card").forEach((card) => {
    card.classList.toggle("selected", card.dataset.character === character);
  });
}

function show(name) {
  state = name;
  paused = false;
  ui.settings.hidden = true;
  ui.menu.hidden = name !== "menu";
  ui.select.hidden = name !== "select";
  ui.over.hidden = name !== "over";
  ui.hud.hidden = name !== "play";
  ui.controls.hidden = name !== "play";
  ui.gear.hidden = name !== "play";
}

function resetRun() {
  lives = CONFIG.maxLives;
  distance = 0;
  itemScore = 0;
  runTime = 0;
  combo = 1;
  comboLeft = 0;
  invuln = 0;
  flash = 0;
  shake = 0;
  spawnIn = 2.4;
  entities = [];
  particles = [];
  floaters = [];
  endedNewBest = false;
  player.lane = 1;
  player.lanePos = 1;
  player.jumpZ = 0;
  player.vy = 0;
  renderHud();
}

function startRun() {
  resetRun();
  show("play");
  ensureMusic();
}

function finishRun() {
  const score = totalScore();
  endedNewBest = score > best;
  if (endedNewBest) best = score;
  save();
  ui.overScore.textContent = String(score);
  ui.overDistance.textContent = `거리 ${Math.floor(distance)}m`;
  ui.overBest.textContent = `최고 점수 ${best}`;
  ui.overNew.hidden = !endedNewBest;
  show("over");
  playOver();
}

function moveLane(dir) {
  if (state !== "play") return;
  player.lane = Math.max(0, Math.min(2, player.lane + dir));
}

function jump() {
  if (state !== "play") return;
  if (player.jumpZ <= 0) {
    player.vy = CONFIG.jumpSpeed;
    playJump();
    burst(playerScreen().x, playerScreen().y - 20, "#fff4c8", 6);
  }
}

function renderHud() {
  const hearts = [];
  for (let i = 0; i < CONFIG.maxLives; i += 1) {
    hearts.push(`<span class="heart ${i < lives ? "full" : "empty"}">♥</span>`);
  }
  ui.hearts.innerHTML = hearts.join("");
  ui.score.textContent = String(totalScore());
  ui.distance.textContent = `${Math.floor(distance)}m${combo > 1 ? `  콤보 x${combo}` : ""}`;
  if (state === "play" && runTime < 9) {
    ui.tip.textContent = TIPS[Math.floor(runTime / 2.2) % TIPS.length];
  } else {
    ui.tip.textContent = "";
  }
}

function laneX(lane, z) {
  const depth = Math.pow(z, 0.88);
  const half = 16 + (206 - 16) * depth;
  const left = W / 2 - half;
  return left + (half * 2 / 3) * (lane + 0.5);
}

function laneY(z) {
  const horizon = H * 0.36;
  const ground = H * 0.8;
  return horizon + (ground - horizon) * Math.pow(z, 0.9);
}

function laneScale(z) {
  return 0.18 + 0.82 * Math.pow(z, 0.92);
}

function playerScreen() {
  return {
    x: laneX(player.lanePos, 1),
    y: laneY(1) - player.jumpZ,
  };
}

function spawnKind() {
  const roll = Math.random();
  const crowded = entities.filter((e) => e.z < 0.32).length;
  if (crowded >= 2) return roll < 0.6 ? "fruit" : "star";
  if (roll < 0.12) return "vaccine";
  if (roll < 0.28) return "fruit";
  if (roll < 0.4) return "star";
  if (roll < 0.48) return "gem";
  if (runTime < 12 || roll < 0.78) return "virus-low";
  return "virus-tall";
}

function spawnEntity() {
  const busy = [false, false, false];
  entities.forEach((e) => {
    if (e.z < 0.3) busy[e.lane] = true;
  });
  const open = [0, 1, 2].filter((lane) => !busy[lane]);
  if (!open.length) return;
  let kind = spawnKind();
  if (runTime < 4 && kind.startsWith("virus")) kind = "star";
  const safer = open.filter((lane) => lane !== player.lane);
  const choices = runTime < 8 && safer.length ? safer : open;
  const lane = choices[Math.floor(Math.random() * choices.length)];
  entities.push({ kind, lane, z: 0.015 });
}

function popup(text, x, y, color) {
  floaters.push({ text, x, y, life: 0.85, max: 0.85, color });
}

function burst(x, y, color, count) {
  for (let i = 0; i < count; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const s = 40 + Math.random() * 140;
    particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - 40,
      life: 0.35 + Math.random() * 0.35,
      max: 0.7,
      color,
      size: 3 + Math.random() * 4,
    });
  }
}

function onHit(entity) {
  entity.gone = true;
  if (invuln > 0) return;
  lives -= 1;
  invuln = CONFIG.invulnTime;
  flash = 0.45;
  shake = 8;
  combo = 1;
  comboLeft = 0;
  playHit();
  const p = playerScreen();
  burst(p.x, p.y - 60, "#ff7b8a", 14);
  popup("-1", p.x, p.y - 90, "#ffd0d6");
  renderHud();
  if (lives <= 0) finishRun();
}

function onVaccine(entity) {
  entity.gone = true;
  const p = playerScreen();
  burst(p.x, p.y - 70, "#9dffc2", 16);
  playVaccine();
  if (lives < CONFIG.maxLives) {
    lives += 1;
    popup("+1 ♥", p.x, p.y - 100, "#eafff0");
  } else {
    popup("가득 참", p.x, p.y - 100, "#fff3c4");
  }
  renderHud();
}

function onScoreItem(entity) {
  entity.gone = true;
  const base = entity.kind === "gem" ? 100 : entity.kind === "star" ? 50 : 20;
  if (comboLeft > 0) combo = Math.min(8, combo + 1);
  else combo = 1;
  comboLeft = 2.3;
  const gained = base * combo;
  itemScore += gained;
  const p = playerScreen();
  const color = entity.kind === "gem" ? "#b9f3ff" : entity.kind === "star" ? "#ffe38a" : "#ffd0a1";
  burst(p.x, p.y - 70, color, 12);
  popup(combo > 1 ? `+${gained} x${combo}` : `+${gained}`, p.x, p.y - 96, color);
  playGem();
  renderHud();
}

function update(dt) {
  if (paused) {
    flash = Math.max(0, flash - dt * 1.4);
    shake = Math.max(0, shake - dt * 18);
    updateFx(dt);
    return;
  }

  roadScroll = (roadScroll + dt * (state === "play" ? speed() * 1.4 : 0.12)) % 1;

  if (state !== "play") {
    if (state !== "over") {
      player.jumpZ = 0;
      player.lanePos += (1 - player.lanePos) * Math.min(1, dt * 2);
    }
    updateFx(dt);
    return;
  }

  runTime += dt;
  distance += speed() * dt * 22;
  comboLeft = Math.max(0, comboLeft - dt);
  if (comboLeft <= 0) combo = 1;
  invuln = Math.max(0, invuln - dt);
  flash = Math.max(0, flash - dt * 1.4);
  shake = Math.max(0, shake - dt * 18);

  player.lanePos += (player.lane - player.lanePos) * Math.min(1, dt * 12);
  player.vy -= CONFIG.gravity * dt;
  player.jumpZ += player.vy * dt;
  if (player.jumpZ <= 0) {
    player.jumpZ = 0;
    player.vy = 0;
  }

  const advance = speed() * dt;
  entities.forEach((entity) => { entity.z += advance; });

  spawnIn -= dt;
  if (spawnIn <= 0) {
    spawnEntity();
    const gap = Math.max(0.42, 1.2 - runTime * 0.012);
    spawnIn = gap * (0.8 + Math.random() * 0.45);
  }

  entities.forEach((entity) => {
    if (entity.gone || entity.z < 0.9 || entity.z > 1.05) return;
    if (Math.abs(player.lanePos - entity.lane) > 0.42) return;
    if (entity.kind === "virus-low") {
      if (player.jumpZ > CONFIG.jumpClear) return;
      onHit(entity);
    } else if (entity.kind === "virus-tall") {
      onHit(entity);
    } else if (entity.kind === "vaccine") {
      onVaccine(entity);
    } else {
      onScoreItem(entity);
    }
  });
  entities = entities.filter((entity) => !entity.gone && entity.z < 1.2);
  updateFx(dt);
  renderHud();
}

function updateFx(dt) {
  particles.forEach((p) => {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 280 * dt;
  });
  particles = particles.filter((p) => p.life > 0);
  floaters.forEach((f) => {
    f.life -= dt;
    f.y -= 28 * dt;
  });
  floaters = floaters.filter((f) => f.life > 0);
}

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.48);
  sky.addColorStop(0, "#79d0ff");
  sky.addColorStop(0.55, "#b6ecff");
  sky.addColorStop(1, "#d9f8c8");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#fff6c9";
  ctx.beginPath();
  ctx.arc(390, 92, 36, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 246, 201, 0.35)";
  ctx.beginPath();
  ctx.arc(390, 92, 52, 0, Math.PI * 2);
  ctx.fill();

  const scroll = roadScroll * 220 + runTime * 18;
  for (let i = 0; i < 9; i += 1) {
    const x = ((i * 78 - scroll * 0.35) % (W + 140) + (W + 140)) % (W + 140) - 70;
    const h = 70 + (i % 3) * 26;
    ctx.fillStyle = i % 2 ? "#8fc98a" : "#79b978";
    ctx.beginPath();
    ctx.arc(x, H * 0.4, h * 0.45, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = "#6eaa6a";
    ctx.fillRect(x - 7, H * 0.38, 14, 28);
  }

  ctx.fillStyle = "rgba(220, 255, 230, 0.35)";
  ctx.fillRect(0, H * 0.34, W, 26);
}

function drawJungleSides() {
  ctx.fillStyle = "#2f9a45";
  ctx.fillRect(0, H * 0.4, W, H);
  ctx.fillStyle = "#24883a";
  ctx.beginPath();
  ctx.moveTo(0, H * 0.46);
  ctx.quadraticCurveTo(W * 0.5, H * 0.38, W, H * 0.47);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.fill();

  const scroll = roadScroll * 360;
  for (let i = 0; i < 7; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = ((i * 0.16 + roadScroll) % 1);
    const x = W / 2 + side * (70 + 180 * z);
    const y = laneY(Math.max(0.08, z));
    const s = laneScale(z);
    ctx.fillStyle = side < 0 ? "#1f7a34" : "#17662b";
    ctx.beginPath();
    ctx.ellipse(x, y, 54 * s, 28 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3cba58";
    ctx.beginPath();
    ctx.arc(x - 10 * s, y - 24 * s, 22 * s, 0, Math.PI * 2);
    ctx.arc(x + 14 * s, y - 20 * s, 18 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  const sway = Math.sin(performance.now() / 500) * 8;
  ctx.strokeStyle = "#1d6b32";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.bezierCurveTo(40 + sway, 160, 10, 320, 36 + sway, 520);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(W - 16, 0);
  ctx.bezierCurveTo(W - 50 - sway, 180, W - 8, 340, W - 34, 540);
  ctx.stroke();
}

function fillLane(lane, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(laneX(lane - 0.5, 0.02), laneY(0.02));
  ctx.lineTo(laneX(lane + 0.5, 0.02), laneY(0.02));
  ctx.lineTo(laneX(lane + 0.5, 1), laneY(1));
  ctx.lineTo(laneX(lane - 0.5, 1), laneY(1));
  ctx.closePath();
  ctx.fill();
}

function drawRoad() {
  fillLane(0, "#d2ae62");
  fillLane(1, "#e4c98a");
  fillLane(2, "#d2ae62");
  const active = Math.round(player.lanePos);
  ctx.save();
  ctx.globalAlpha = 0.45;
  fillLane(active, "#fff1c2");
  ctx.restore();

  ctx.strokeStyle = "rgba(120, 78, 32, 0.35)";
  ctx.lineWidth = 3;
  ctx.setLineDash([16, 18]);
  ctx.lineDashOffset = -roadScroll * 180;
  [0.5, 1.5].forEach((edge) => {
    ctx.beginPath();
    ctx.moveTo(laneX(edge, 0.02), laneY(0.02));
    ctx.lineTo(laneX(edge, 1), laneY(1));
    ctx.stroke();
  });
  ctx.setLineDash([]);

  for (let lane = 0; lane < 3; lane += 1) {
    for (let i = 0; i < 5; i += 1) {
      const z = (i * 0.2 + roadScroll * 0.8) % 1;
      if (z < 0.05) continue;
      const x = laneX(lane, z);
      const y = laneY(z);
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.fillRect(x - 2, y, 4, 8 * laneScale(z));
    }
  }
}

function drawVirus(kind, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  if (kind === "virus-tall") {
    ctx.fillStyle = "#7a3cc4";
    for (let i = 0; i < 7; i += 1) {
      const a = -Math.PI * 0.85 + (Math.PI * 0.7 * i) / 6;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * 26 * s, -78 * s + Math.sin(a) * 48 * s, 9 * s, 18 * s, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#9b5de5";
    ctx.beginPath();
    ctx.ellipse(0, -78 * s, 26 * s, 48 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    cuteFace(0, -82 * s, s * 1.05, "#4a1d78");
  } else {
    ctx.fillStyle = "#3eaf4a";
    ctx.beginPath();
    ctx.arc(-16 * s, -10 * s, 16 * s, 0, Math.PI * 2);
    ctx.arc(14 * s, -8 * s, 18 * s, 0, Math.PI * 2);
    ctx.arc(0, -18 * s, 14 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#67d35a";
    ctx.beginPath();
    ctx.ellipse(0, -16 * s, 22 * s, 16 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    cuteFace(0, -18 * s, s * 0.85, "#1d6b32");
  }
  ctx.restore();
}

function cuteFace(x, y, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x - 7 * s, y - 2 * s, 2.4 * s, 0, Math.PI * 2);
  ctx.arc(x + 7 * s, y - 2 * s, 2.4 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6 * s;
  ctx.beginPath();
  ctx.arc(x, y + 3 * s, 5 * s, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
}

function drawVaccine(x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#d9fff0";
  roundRect(-12 * s, -46 * s, 24 * s, 34 * s, 6 * s);
  ctx.fill();
  ctx.fillStyle = "#1f8f78";
  roundRect(-8 * s, -54 * s, 16 * s, 10 * s, 3 * s);
  ctx.fill();
  ctx.strokeStyle = "#14915c";
  ctx.lineWidth = 3 * s;
  ctx.beginPath();
  ctx.moveTo(0, -38 * s);
  ctx.lineTo(0, -22 * s);
  ctx.moveTo(-6 * s, -30 * s);
  ctx.lineTo(6 * s, -30 * s);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.fillRect(-6 * s, -42 * s, 4 * s, 10 * s);
  ctx.restore();
}

function drawPickup(kind, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  if (kind === "star") {
    ctx.fillStyle = "#ffd15c";
    starPath(0, -18 * s, 16 * s, 7 * s);
    ctx.fill();
  } else if (kind === "gem") {
    ctx.fillStyle = "#5ad7e8";
    ctx.beginPath();
    ctx.moveTo(0, -36 * s);
    ctx.lineTo(14 * s, -18 * s);
    ctx.lineTo(0, -4 * s);
    ctx.lineTo(-14 * s, -18 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath();
    ctx.moveTo(0, -32 * s);
    ctx.lineTo(6 * s, -18 * s);
    ctx.lineTo(0, -22 * s);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle = "#ff9a3c";
    ctx.beginPath();
    ctx.ellipse(0, -16 * s, 14 * s, 12 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3aaa4a";
    ctx.beginPath();
    ctx.ellipse(4 * s, -28 * s, 6 * s, 3 * s, -0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function starPath(x, y, outer, inner) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawEntities() {
  const list = entities.slice().sort((a, b) => a.z - b.z);
  list.forEach((entity) => {
    const s = laneScale(entity.z);
    const x = laneX(entity.lane, entity.z);
    const y = laneY(entity.z);
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.beginPath();
    ctx.ellipse(x, y + 4, 18 * s, 6 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    if (entity.kind.startsWith("virus")) drawVirus(entity.kind, x, y, s * 1.15);
    else if (entity.kind === "vaccine") drawVaccine(x, y, s * 1.2);
    else drawPickup(entity.kind, x, y, s * 1.15);
  });
}

function drawPlayer() {
  const p = playerScreen();
  const running = player.jumpZ <= 0 && state !== "over" && !paused;
  const bob = running ? Math.sin(performance.now() / 90) : 0;
  const sit = state === "over" && character === "dog";
  let img;
  let height;
  let pixel = false;

  if (character === "chick") {
    pixel = true;
    const step = Math.floor(performance.now() / 140) % 2;
    img = state === "over" ? sprites.chick.front : (running && step ? sprites.chick.side2 : sprites.chick.side);
    height = CONFIG.playerHeight.chick;
  } else if (sit) {
    img = sprites.dog.sit;
    height = CONFIG.playerHeight.dogSit;
  } else {
    img = sprites.dog.run;
    height = CONFIG.playerHeight.dog;
  }

  ctx.fillStyle = `rgba(0,0,0,${0.22 - Math.min(0.16, player.jumpZ / 700)})`;
  ctx.beginPath();
  ctx.ellipse(p.x, laneY(1) + 4, 22 - player.jumpZ * 0.02, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  if (invuln > 0 && Math.floor(performance.now() / 80) % 2 === 0) ctx.globalAlpha = 0.35;
  const drawH = height * (1 - bob * 0.05);
  const ratio = img.width / img.height;
  const drawW = drawH * ratio * (1 + bob * 0.04);
  ctx.imageSmoothingEnabled = !pixel;
  ctx.drawImage(img, p.x - drawW / 2, p.y - drawH + bob * 6, drawW, drawH);
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = true;
}

function drawFx() {
  particles.forEach((p) => {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  ctx.font = "700 22px Malgun Gothic, sans-serif";
  ctx.textAlign = "center";
  floaters.forEach((f) => {
    ctx.globalAlpha = Math.max(0, f.life / f.max);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  });
  ctx.globalAlpha = 1;
  if (flash > 0 && state === "play") {
    ctx.fillStyle = `rgba(255, 70, 90, ${flash * 0.35})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function draw() {
  ctx.save();
  if (shake > 0) {
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  }
  drawBackground();
  drawJungleSides();
  drawRoad();
  if (state === "play" || state === "over") drawEntities();
  if (state !== "select") drawPlayer();
  drawFx();
  ctx.restore();
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

function bind() {
  document.getElementById("btn-start").addEventListener("click", () => {
    startRun();
  });
  document.getElementById("btn-select").addEventListener("click", () => {
    show("select");
    ensureMusic();
  });
  document.getElementById("btn-settings").addEventListener("click", openSettings);
  ui.gear.addEventListener("click", openSettings);
  document.getElementById("btn-settings-close").addEventListener("click", closeSettings);
  [ui.optBgm, ui.optSfx].forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.getAttribute("aria-pressed") !== "true";
      button.setAttribute("aria-pressed", next ? "true" : "false");
      readSettings();
    });
  });
  [ui.volBgm, ui.volSfx].forEach((input) => {
    input.addEventListener("input", readSettings);
  });
  ui.volSfx.addEventListener("change", () => {
    if (audioSettings.sfx) playSfx("score", 0.62);
  });
  document.getElementById("btn-back").addEventListener("click", () => {
    show("menu");
    ensureMusic();
  });
  document.getElementById("btn-confirm").addEventListener("click", () => {
    save();
    startRun();
  });
  document.getElementById("btn-retry").addEventListener("click", startRun);
  document.getElementById("btn-reselect").addEventListener("click", () => {
    show("select");
    ensureMusic();
  });
  document.querySelectorAll(".card").forEach((card) => {
    card.addEventListener("click", () => {
      character = card.dataset.character;
      refreshMenu();
      save();
    });
  });

  ui.controls.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.act === "left") moveLane(-1);
    if (button.dataset.act === "right") moveLane(1);
    if (button.dataset.act === "jump") jump();
  });

  window.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) {
      event.preventDefault();
    }
    if (settingsOpen()) {
      if (event.key === "Escape") closeSettings();
      return;
    }
    if (state === "menu" && (event.key === "Enter" || event.key === " ")) {
      startRun();
      return;
    }
    if (state === "over" && (event.key === "Enter" || event.key === " ")) {
      startRun();
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") moveLane(-1);
    if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") moveLane(1);
    if (event.key === "ArrowUp" || event.key === " " || event.key === "w" || event.key === "W") jump();
  });

  const frameEl = document.getElementById("frame");
  let pointer = null;
  frameEl.addEventListener("pointerdown", (event) => {
    if (settingsOpen()) return;
    if (event.target.closest("button, input, label")) return;
    pointer = { x: event.clientX, y: event.clientY, id: event.pointerId };
  });
  frameEl.addEventListener("pointerup", (event) => {
    if (settingsOpen()) {
      pointer = null;
      return;
    }
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    pointer = null;
    if (state !== "play") return;
    if (dy < -28 && Math.abs(dy) > Math.abs(dx)) {
      jump();
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    if (x < rect.width / 3) moveLane(-1);
    else if (x > rect.width * 2 / 3) moveLane(1);
    else jump();
  });
}

async function boot() {
  loadSave();
  syncSettingsUi();
  refreshMenu();
  const [dogFront, dogRun, dogSit, chickFront, chickSide, chickSide2] = await Promise.all([
    loadImage("assets/dog-front.png"),
    loadImage("assets/dog-run.png"),
    loadImage("assets/dog-sit.png"),
    loadImage("assets/chick-front.png"),
    loadImage("assets/chick-side.png"),
    loadImage("assets/chick-side2.png"),
  ]);
  sprites.dog = { front: dogFront, run: dogRun, sit: dogSit };
  sprites.chick = { front: chickFront, side: chickSide, side2: chickSide2 };
  bind();
  show("menu");
  requestAnimationFrame(frame);
}

boot().catch((err) => {
  console.error(err);
});
