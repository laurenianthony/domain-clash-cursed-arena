const canvas = document.getElementById("vfx-canvas");
const context = canvas?.getContext("2d", { alpha: true });
const effects = [];
let width = 0;
let height = 0;
let pixelRatio = 1;
let resizeFrame = 0;
let frame = 0;
let domainMode = false;
let stage = 1;
let hpRatio = 1;
let intentPulse = 0;
let lastTime = 0;
let shake = 0;
let reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

const randomBetween = (min, max) => min + Math.random() * (max - min);
function scheduleResize() {
  if (resizeFrame) cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => { resizeFrame = 0; resize(); });
}
function resize() {
  if (!canvas || !context) return;
  width = window.innerWidth;
  height = window.innerHeight;
  pixelRatio = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}

export function setSigilState(nextStage = 1, nextHpRatio = 1, intent = "") {
  stage = Math.max(1, Math.min(5, Number(nextStage) || 1));
  hpRatio = Math.max(0, Math.min(1, Number(nextHpRatio) || 0));
  intentPulse = /attack|strike|cleave|dismantle|burst/i.test(intent) ? 1 : /shield|guard|buff|armor/i.test(intent) ? 0.55 : 0.25;
}

export function spawnSlash(color = "#f0445a", isBlackFlash = false) {
  const count = isBlackFlash ? 72 : 30;
  const cx = width * randomBetween(0.34, 0.66);
  const cy = height * randomBetween(0.3, 0.58);
  for (let i = 0; i < count; i++) {
    const angle = randomBetween(-Math.PI * 0.9, Math.PI * 0.9);
    const speed = randomBetween(isBlackFlash ? 2 : 1.2, isBlackFlash ? 10 : 6);
    effects.push({ kind: "spark", x: cx, y: cy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, decay: randomBetween(0.018, 0.045), size: randomBetween(1, isBlackFlash ? 4 : 2.5), color });
  }
  const arcCount = isBlackFlash ? 8 : 3;
  for (let i = 0; i < arcCount; i++) effects.push({ kind: "arc", x: cx + randomBetween(-80, 80), y: cy + randomBetween(-50, 50), life: 1, decay: randomBetween(0.06, 0.12), color: isBlackFlash ? "#d9faff" : color, length: randomBetween(35, isBlackFlash ? 180 : 100), angle: randomBetween(-Math.PI, Math.PI) });
  shake = Math.max(shake, isBlackFlash ? 14 : 7);
  if (!reducedMotion && document.body?.animate) document.body.animate([{ transform: "translate3d(0,0,0)" }, { transform: `translate3d(${randomBetween(-1, 1) * shake}px, ${randomBetween(-1, 1) * shake}px, 0)` }, { transform: "translate3d(0,0,0)" }], { duration: isBlackFlash ? 280 : 180, easing: "ease-out" });
}

export function spawnHeal() {
  for (let i = 0; i < 42; i++) effects.push({ kind: "heal", x: width * 0.5 + randomBetween(-100, 100), y: height * 0.72 + randomBetween(-30, 30), vx: randomBetween(-0.7, 0.7), vy: randomBetween(-2.7, -0.8), life: 1, decay: randomBetween(0.006, 0.016), size: randomBetween(2, 5), color: Math.random() > 0.5 ? "#54f2a0" : "#a5ffca" });
}

export function spawnShield() {
  effects.push({ kind: "shield", x: width * 0.5, y: height * 0.52, life: 1, decay: 0.018, radius: 12, color: "#4de5e2" });
}

export function setDomainMode(active) {
  domainMode = Boolean(active);
  document.body.classList.toggle("domain-active", domainMode);
}

function drawSigil(time) {
  if (!context) return;
  const cx = width * 0.5;
  const cy = height * 0.43;
  const base = Math.min(width, height) * (width < 640 ? 0.25 : 0.19);
  const pulse = 1 + Math.sin(time * (1.2 + intentPulse) + (1 - hpRatio) * 4) * (0.025 + intentPulse * 0.025);
  const radius = base * pulse;
  const hue = [345, 280, 145, 18, 0][stage - 1];
  context.save();
  context.translate(cx, cy);
  context.rotate(time * (stage % 2 ? 0.035 : -0.028));
  context.globalCompositeOperation = "lighter";
  context.strokeStyle = `hsla(${hue}, 88%, 62%, ${domainMode ? 0.32 : 0.11 + intentPulse * 0.09})`;
  context.lineWidth = 1;
  context.shadowColor = `hsla(${hue}, 95%, 60%, .55)`;
  context.shadowBlur = domainMode ? 22 : 10;
  for (let ring = 0; ring < 4; ring++) {
    const ringRadius = radius * (0.35 + ring * 0.2);
    context.beginPath(); context.arc(0, 0, ringRadius, 0, Math.PI * 2); context.stroke();
  }
  const sides = [8, 6, 12, 9, 16][stage - 1];
  for (let ring = 0; ring < 3; ring++) {
    const r = radius * (0.5 + ring * 0.22);
    const rotation = (ring % 2 ? -1 : 1) * time * (0.08 + stage * 0.012);
    context.beginPath();
    for (let i = 0; i <= sides; i++) {
      const angle = rotation + (Math.PI * 2 * i) / sides;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.stroke();
  }
  const spokes = 16 + stage * 4;
  for (let i = 0; i < spokes; i++) {
    const a = (Math.PI * 2 * i) / spokes;
    const inner = radius * (i % 2 ? 0.33 : 0.22);
    const outer = radius * (i % 3 ? 0.78 : 1.06);
    context.beginPath(); context.moveTo(Math.cos(a) * inner, Math.sin(a) * inner); context.lineTo(Math.cos(a) * outer, Math.sin(a) * outer); context.stroke();
  }
  // The eye motif sits at the heart of every stage's distinct mandala.
  context.beginPath(); context.ellipse(0, 0, radius * 0.27, radius * (stage === 5 ? 0.12 : 0.18), 0, 0, Math.PI * 2); context.stroke();
  context.beginPath(); context.arc(0, 0, radius * (0.055 + (1 - hpRatio) * 0.025), 0, Math.PI * 2); context.fillStyle = `hsla(${hue}, 100%, 72%, .38)`; context.fill();
  context.restore();
}

function drawDomain(time) {
  if (!domainMode || !context) return;
  context.save(); context.globalCompositeOperation = "lighter";
  const cx = width * 0.5; const cy = height * 0.5;
  for (let i = 0; i < 46; i++) {
    const angle = time * (0.15 + (i % 5) * 0.035) + i * 2.399;
    const orbit = 30 + ((i * 47 + time * 18) % Math.max(100, Math.min(width, height) * 0.48));
    const x = cx + Math.cos(angle) * orbit;
    const y = cy + Math.sin(angle * 1.07) * orbit * 0.64;
    context.beginPath(); context.arc(x, y, i % 8 === 0 ? 2.5 : 1.2, 0, Math.PI * 2);
    context.fillStyle = i % 4 === 0 ? "rgba(248,54,88,.48)" : "rgba(170,43,114,.32)"; context.fill();
  }
  context.restore();
}

function drawEffects(delta) {
  if (!context) return;
  context.save(); context.globalCompositeOperation = "lighter";
  for (let i = effects.length - 1; i >= 0; i--) {
    const item = effects[i];
    item.life -= item.decay * Math.max(0.5, delta / 16.67);
    if (item.life <= 0) { effects.splice(i, 1); continue; }
    context.globalAlpha = Math.max(0, item.life);
    context.strokeStyle = item.color; context.fillStyle = item.color; context.lineWidth = item.kind === "arc" ? 2 : 1.4;
    context.shadowColor = item.color; context.shadowBlur = item.kind === "spark" ? 12 : 16;
    if (item.kind === "spark" || item.kind === "heal") {
      item.x += item.vx * delta * 0.06; item.y += item.vy * delta * 0.06;
      if (item.kind === "spark") item.vy += 0.08;
      context.beginPath(); context.arc(item.x, item.y, item.size * item.life, 0, Math.PI * 2); context.fill();
    } else if (item.kind === "arc") {
      const length = item.length * item.life;
      context.beginPath(); context.moveTo(item.x, item.y);
      for (let j = 1; j <= 5; j++) {
        const t = j / 5; const offset = randomBetween(-9, 9);
        context.lineTo(item.x + Math.cos(item.angle) * length * t + Math.cos(item.angle + Math.PI / 2) * offset, item.y + Math.sin(item.angle) * length * t + Math.sin(item.angle + Math.PI / 2) * offset);
      }
      context.stroke();
    } else if (item.kind === "shield") {
      item.radius += delta * 0.16;
      context.beginPath();
      for (let j = 0; j <= 6; j++) {
        const a = (Math.PI * 2 * j) / 6;
        const x = item.x + Math.cos(a) * item.radius; const y = item.y + Math.sin(a) * item.radius;
        if (j === 0) context.moveTo(x, y); else context.lineTo(x, y);
      }
      context.stroke();
    }
  }
  context.restore();
}

function render(timestamp = 0) {
  if (!context) return;
  const delta = lastTime ? Math.min(40, timestamp - lastTime) : 16.67;
  lastTime = timestamp;
  frame += delta * (reducedMotion ? 0.00015 : 0.001);
  context.clearRect(0, 0, width, height);
  const glow = context.createRadialGradient(width * 0.5, height * 0.43, 0, width * 0.5, height * 0.43, Math.max(width, height) * 0.62);
  glow.addColorStop(0, domainMode ? "rgba(150, 18, 68, .16)" : "rgba(93, 39, 121, .055)");
  glow.addColorStop(1, "rgba(11, 12, 16, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);
  if (shake > 0.2 && !reducedMotion) {
    const offsetX = randomBetween(-shake, shake); const offsetY = randomBetween(-shake * 0.5, shake * 0.5);
    context.save(); context.translate(offsetX, offsetY); drawSigil(frame); drawDomain(frame); context.restore();
    shake *= 0.82;
  } else { shake = 0; drawSigil(frame); drawDomain(frame); }
  drawEffects(delta);
  requestAnimationFrame(render);
}

if (canvas && context) {
  resize();
  window.addEventListener("resize", scheduleResize);
  window.addEventListener("orientationchange", scheduleResize);
  window.visualViewport?.addEventListener("resize", scheduleResize);
  window.matchMedia?.("(prefers-reduced-motion: reduce)").addEventListener?.("change", (event) => { reducedMotion = event.matches; });
  requestAnimationFrame(render);
}



