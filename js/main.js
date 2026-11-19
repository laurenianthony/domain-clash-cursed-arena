import { GAME_STATE, PHASE, initRun, selectCharacter } from "./state.js";
import { CHARACTERS, ULTIMATES } from "./data.js";
import { spawnSlash, spawnHeal, spawnShield, setDomainMode, setSigilState } from "./vfx.js";
import {
  activateAudio,
  toggleMute,
  playCardSelect,
  playBlackFlash,
  playHit,
  playShield,
  playDomainExpansion,
  playVictory,
} from "./audio.js";
import {
  initializeCombat,
  getCurrentEnemy,
  getCurrentIntent,
  playCard,
  lockTiming,
  getTimingPosition,
  setDifficulty,
  activateDomain,
  endTurn,
  chooseReward,
  setCombatCallbacks,
} from "./combat.js";

const $ = (selector) => document.querySelector(selector);
const shell = $("#game-shell");
const characterScreen = $("#character-select");
const runOverlay = $("#run-overlay");
const handEl = $("#hand");
const rewardPanel = $("#reward-panel");
const rewardChoices = $("#reward-choices");
const timingPanel = $("#timing-panel");
const cursor = $("#timing-cursor");
const STORAGE_KEY = "domain_clash_stats";

let selectedCharacter = null;
let selectedDifficulty = "medium";
let enemyPortraitId = null;
let isHeianMode = false;
let run = { stagesCleared: 0, blackFlashes: 0, peakDamage: 0 };
let totals = loadStats();

function loadStats() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      bestStage: Math.max(1, Number(saved.bestStage) || 1),
      totalBlackFlashes: Math.max(0, Number(saved.totalBlackFlashes) || 0),
      clears: Math.max(0, Number(saved.clears) || 0),
    };
  } catch {
    return { bestStage: 1, totalBlackFlashes: 0, clears: 0 };
  }
}

function saveStats() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(totals));
  } catch {
    /* Browser storage may be unavailable. */
  }
  updateStatsViews();
}

function updateStatsViews() {
  $("#record-best").textContent = String(totals.bestStage).padStart(2, "0");
  $("#record-flashes").textContent = String(totals.totalBlackFlashes);
  $("#record-clears").textContent = String(totals.clears);
  $("#modal-best").textContent = String(totals.bestStage).padStart(2, "0");
  $("#modal-flashes").textContent = String(totals.totalBlackFlashes);
  $("#modal-clears").textContent = String(totals.clears);
}

function createPortrait(container, imagePath, label, color, sigil) {
  container.replaceChildren();
  container.style.setProperty("--fallback-color", color);
  const fallback = document.createElement("div");
  fallback.className = "portrait-fallback";
  fallback.setAttribute("aria-label", `${label} portrait fallback`);
  fallback.innerHTML = sigil
    ? `<span class="fallback-ring" aria-hidden="true"></span><span class="fallback-mark" aria-hidden="true">${sigil}</span>`
    : "";

  const image = document.createElement("img");
  image.className = "portrait-image";
  image.alt = label;
  image.loading = "lazy";
  image.decoding = "async";
  image.onerror = () => {
    image.hidden = true;
    fallback.hidden = false;
    container.classList.remove("has-image");
  };
  image.onload = () => {
    image.hidden = false;
    fallback.hidden = true;
    container.classList.add("has-image");
  };
  image.src = imagePath;
  container.append(image, fallback);
  return image;
}

function buildCharacterChoices() {
  const grid = $("#character-grid");
  grid.replaceChildren(
    ...Object.values(CHARACTERS).map((fighter) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "character-choice";
      button.dataset.characterId = fighter.id;
      button.style.setProperty("--fighter-accent", fighter.accent);
      button.setAttribute("aria-pressed", "false");

      const art = document.createElement("div");
      art.className = "character-image";
      createPortrait(
        art,
        fighter.portrait,
        fighter.name,
        fighter.accent,
        fighter.name.slice(0, 1)
      );

      const ultimate = ULTIMATES[fighter.id];
      const copy = document.createElement("div");
      copy.className = "character-copy";
      copy.innerHTML = `<span class="eyebrow">${fighter.title}</span><h2>${fighter.name}</h2><p>${fighter.passiveText}</p><p class="muted">Domain: ${ultimate ? `${ultimate.name} (${ultimate.preview})` : "Cursed Surge"}</p><div class="character-stats"><span>HP <strong>${fighter.maxHp}</strong></span><span>MAX CE <strong>${fighter.maxCe}</strong></span></div>`;

      button.append(art, copy);
      button.addEventListener("click", () => {
        selectedCharacter = fighter.id;
        selectCharacter(fighter.id);
        grid.querySelectorAll(".character-choice").forEach((option) => {
          const selected = option === button;
          option.classList.toggle("selected", selected);
          option.setAttribute("aria-pressed", String(selected));
        });
        $("#start-run").disabled = false;
        $("#start-run").innerHTML = `START AS ${fighter.name.toUpperCase()} <span aria-hidden="true">↗</span>`;
      });
      return button;
    })
  );
}

function startRun(characterId = selectedCharacter) {
  if (!characterId || !CHARACTERS[characterId]) return;
  activateAudio();
  setDifficulty(selectedDifficulty);
  isHeianMode = false;
  enemyPortraitId = null;
  setDomainMode(false);
  run = { stagesCleared: 0, blackFlashes: 0, peakDamage: 0 };
  selectedCharacter = characterId;
  characterScreen.classList.remove("is-visible");
  runOverlay.classList.remove("is-visible");
  shell.hidden = false;
  initRun(characterId);
  initializeCombat();
  createPortrait(
    $("#fighter-hud-portrait"),
    CHARACTERS[characterId].portrait,
    CHARACTERS[characterId].name,
    CHARACTERS[characterId].accent,
    CHARACTERS[characterId].name.slice(0, 1)
  );
  $("#fighter-title").textContent = CHARACTERS[characterId].title;
  $("#fighter-name").textContent = CHARACTERS[characterId].name;
  render();
}

function setMeter(selector, ratio) {
  const meter = $(selector);
  const percent = Math.max(0, Math.min(100, ratio * 100));
  meter.style.width = `${percent}%`;
  meter.parentElement.setAttribute("aria-valuenow", String(Math.round(percent)));
}

function renderEnemyPortrait(enemy) {
  if (enemyPortraitId === enemy.id) return;
  enemyPortraitId = enemy.id;
  createPortrait($("#enemy-portrait"), enemy.image, enemy.name, enemy.color, "");
}

function describeIntent(intent) {
  if (!intent) return "No intent is visible.";
  if (intent.kind === "block") return `Shield: gain ${intent.block || 0} Block.`;
  if (intent.kind === "burn") {
    return `Burn: deal ${intent.damage || 5} damage and apply burn for ${intent.turns} turn(s).`;
  }
  if (intent.kind === "vulnerable") {
    return `Expose: deal ${intent.damage || 0} damage and leave you Vulnerable for ${intent.turns} turn(s).`;
  }
  return `${intent.hits > 1 ? `${intent.hits} hits · ` : ""}Attack for ${intent.damage || 0} damage${intent.hits > 1 ? " per hit" : ""}.`;
}

function renderBattle() {
  const player = GAME_STATE.player;
  if (!player) return;
  const enemy = getCurrentEnemy();
  const intent = getCurrentIntent();
  const ultimate = ULTIMATES[GAME_STATE.characterId];

  $("#stage-value").textContent = String(GAME_STATE.stage).padStart(2, "0");
  $("#boss-phase-label").hidden = GAME_STATE.bossPhase !== 2;
  $("#player-hp-label").textContent = `${player.hp} / ${player.maxHp}`;
  setMeter("#player-hp-fill", player.hp / player.maxHp);
  $("#player-block").textContent = `BLOCK ${player.block}`;

  const statuses = [];
  if (player.burnTurns) statuses.push(`BURN ${player.burnTurns}`);
  if (player.vulnerableTurns) statuses.push(`VULNERABLE ${player.vulnerableTurns}`);
  if (player.weakened) statuses.push("WEAKENED");
  if (player.evasionTurns) statuses.push(`EVADE ${player.evasionTurns}`);
  if (player.blackFlashDomainTurns) statuses.push(`BLACK FLASH AURA ${player.blackFlashDomainTurns}`);
  $("#player-statuses").textContent = statuses.join(" · ");

  $("#ce-label").textContent = `${String(GAME_STATE.ce).padStart(2, "0")} / ${player.maxCe}`;
  $("#ce-orbs").setAttribute("aria-label", `${GAME_STATE.ce} of ${player.maxCe} cursed energy`);
  $("#ce-orbs").replaceChildren(
    ...Array.from({ length: player.maxCe }, (_, index) => {
      const orb = document.createElement("i");
      orb.className = `orb${index < GAME_STATE.ce ? " filled" : ""}`;
      return orb;
    })
  );

  $("#domain-label").textContent = `${String(GAME_STATE.domain).padStart(2, "0")}%`;
  setMeter("#domain-fill", GAME_STATE.domain / 100);
  $(".domain-meter").setAttribute("aria-valuenow", String(GAME_STATE.domain));

  if (enemy) {
    renderEnemyPortrait(enemy);
    $("#enemy-card").style.setProperty("--enemy-color", enemy.color);
    $("#enemy-rank").textContent = enemy.rank;
    $("#enemy-name").textContent = enemy.name;
    $("#enemy-hp-label").textContent = `${enemy.hp} / ${enemy.maxHp}`;
    setMeter("#enemy-hp-fill", enemy.hp / enemy.maxHp);
    $(".enemy-meter").setAttribute("aria-valuemax", String(enemy.maxHp));
    $(".enemy-meter").setAttribute("aria-valuenow", String(enemy.hp));
    $("#enemy-block").textContent = enemy.block ? `BLOCK ${enemy.block}` : `TURN ${GAME_STATE.turn}`;
    $("#intent-text").textContent = intent?.label || "EXORCISED";
    const description = describeIntent(intent);
    $("#intent-tooltip").textContent = description;
    $("#enemy-intent").setAttribute("aria-label", `Enemy intent: ${description}`);
    $("#enemy-intent").title = description;

    const enemyStatuses = [];
    if (enemy.stunnedTurns) enemyStatuses.push(`STUNNED ${enemy.stunnedTurns}`);
    if (enemy.vulnerableTurns) enemyStatuses.push(`VULNERABLE ${enemy.vulnerableTurns}`);
    if (enemy.burnTurns) enemyStatuses.push(`BURN ${enemy.burnTurns}`);
    $("#enemy-statuses").textContent = enemyStatuses.join(" · ");
    setSigilState(GAME_STATE.stage, enemy.hp / enemy.maxHp, intent?.kind || intent?.label || "");
  }

  $("#turn-label").textContent =
    GAME_STATE.phase === PHASE.PLAYER_TURN
      ? `TURN ${GAME_STATE.turn} · YOUR MOVE`
      : GAME_STATE.phase.replaceAll("_", " ");
  $("#hand-count").textContent = `${String(GAME_STATE.hand.length).padStart(2, "0")} CARDS`;
  $("#deck-count").innerHTML = `DECK ${String(GAME_STATE.deck.length).padStart(2, "0")} <span class="muted">·</span> DISCARD ${String(GAME_STATE.discard.length).padStart(2, "0")}`;

  const domainReady = GAME_STATE.domain >= 100 && GAME_STATE.phase === PHASE.PLAYER_TURN;
  $("#domain-button").disabled = !domainReady;
  $("#domain-button").title = ultimate ? `${ultimate.name}: ${ultimate.effect}` : "Unleash Domain Expansion";
  $("#domain-button-hint").textContent = domainReady
    ? `${ultimate?.name?.toUpperCase() || "DOMAIN READY"} · ${ultimate?.preview || "UNLEASH"}`
    : ultimate
    ? `${ultimate.name.toUpperCase()} · ${GAME_STATE.domain}%`
    : `GAUGE REQUIRED · ${GAME_STATE.domain}%`;

  $("#end-turn").disabled = GAME_STATE.phase !== PHASE.PLAYER_TURN;
  $(".action-dock").hidden = [PHASE.REWARD, PHASE.VICTORY, PHASE.GAME_OVER].includes(GAME_STATE.phase);
  timingPanel.hidden = GAME_STATE.phase !== PHASE.TIMING_CHECK;
  rewardPanel.hidden = GAME_STATE.phase !== PHASE.REWARD;
  handEl.hidden = [PHASE.REWARD, PHASE.VICTORY, PHASE.GAME_OVER].includes(GAME_STATE.phase);
  handEl.replaceChildren(...GAME_STATE.hand.map(makeCard));
}

function makeCard(card, index) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `card${
    GAME_STATE.ce < card.cost || GAME_STATE.phase !== PHASE.PLAYER_TURN ? " disabled" : ""
  }`;
  button.style.setProperty("--card-accent", card.color);
  button.setAttribute(
    "aria-label",
    `${card.name}, cost ${card.cost}. ${card.desc}. Hotkey ${index + 1}`
  );
  button.innerHTML = `<span class="card-top"><span class="card-type">${card.type}</span><span class="card-cost">${card.cost}</span></span><span><h3>${card.name}</h3><p>${card.desc}</p></span><span class="card-bottom"><span>${card.timing ? "RHYTHM ATTACK" : card.theme ? card.theme.toUpperCase() : card.type}</span><span class="card-key">${index + 1}</span></span>`;
  button.addEventListener("click", () => {
    activateAudio();
    playCardSelect();
    playCard(card);
  });
  return button;
}

function showRewards(cards) {
  rewardChoices.replaceChildren(
    ...cards.map((card) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "card reward-card";
      button.style.setProperty("--card-accent", card.color);
      button.innerHTML = `<span class="card-top"><span class="card-type">${card.type}</span><span class="card-cost">${card.cost}</span></span><span><h3>${card.name}</h3><p>${card.desc}</p></span><span class="card-bottom"><span>ADD TO DECK</span><span>↗</span></span>`;
      button.addEventListener("click", () => {
        activateAudio();
        playCardSelect();
        chooseReward(card.id);
      });
      return button;
    })
  );
  $("#battle-status").textContent = "CURSED SPIRIT EXORCISED";
  $("#battle-message").textContent = "Choose one technique. Your wounds ease by 12 HP.";
}

function showFloating(selector, value, kind, label = "") {
  const anchor = $(selector);
  if (!anchor || !value) return;
  const bounds = anchor.getBoundingClientRect();
  const number = document.createElement("span");
  number.className = `floating-number ${kind}`;
  number.textContent = `${kind === "damage" ? "−" : "+"}${Math.round(Math.abs(value))}${label}`;
  number.style.left = `${bounds.left + bounds.width * 0.72}px`;
  number.style.top = `${bounds.top + bounds.height * 0.35}px`;
  document.body.append(number);
  number.addEventListener("animationend", () => number.remove(), { once: true });
  window.setTimeout(() => number.remove(), 1250);
}

function updateRunBest() {
  const old = totals.bestStage;
  totals.bestStage = Math.max(totals.bestStage, GAME_STATE.stage);
  if (old !== totals.bestStage) saveStats();
}

function showRunScreen(outcome) {
  const cleared = outcome === "VICTORY" ? 5 : run.stagesCleared;
  $("#run-outcome").textContent = outcome === "VICTORY" ? "EXPEDITION COMPLETE" : "EXPEDITION ENDED";
  $("#run-title").textContent = outcome === "VICTORY" ? "THE VEIL IS BROKEN" : "THE CURSE PREVAILS";
  $("#summary-stages").textContent = `${cleared} / 5`;
  $("#summary-flashes").textContent = String(run.blackFlashes);
  $("#summary-damage").textContent = String(run.peakDamage);
  runOverlay.hidden = false;
  runOverlay.classList.add("is-visible");
  $("#play-again").focus();
}

function render() {
  updateRunBest();
  renderBattle();
}

setCombatCallbacks({
  onUpdate: () => render(),
  onTimingStart: () => {
    $("#battle-status").textContent = "BLACK FLASH · FIND THE BEAT";
  },
  onTimingCursor: (position) => {
    cursor.style.left = `${position}%`;
  },
  onTimingEnd: () => {
    timingPanel.hidden = true;
  },
  onTimingResult: (rating) => {
    $("#battle-status").textContent =
      rating === "BLACK_FLASH"
        ? "BLACK FLASH · PERFECT"
        : rating === "GOOD"
        ? "GOOD HIT"
        : "STRIKE · TIMING MISSED";
    $("#timing-readout").textContent = rating;
  },
  onHit: ({ card, damage, rating }) => {
    spawnSlash(card.color || "#f0445a", false);
    if (rating !== "BLACK_FLASH") playHit();
    run.peakDamage = Math.max(run.peakDamage, Math.round(damage));
    showFloating("#enemy-card", damage, "damage");
    render();
  },
  onPlayerDamage: (damage) => {
    showFloating("#fighter-hud-portrait", damage, "damage");
    render();
  },
  onShield: (card) => {
    spawnShield();
    playShield();
    showFloating("#fighter-hud-portrait", card.block, "shield", " BLOCK");
    render();
  },
  onHeal: (card) => {
    spawnHeal();
    showFloating("#fighter-hud-portrait", card.value, "heal", " HP");
    render();
  },
  onBlackFlash: () => {
    run.blackFlashes += 1;
    totals.totalBlackFlashes += 1;
    saveStats();
    $("#battle-message").textContent = "A black spark tears through the veil.";
    shell.animate(
      [{ filter: "brightness(1)" }, { filter: "brightness(2.4)" }, { filter: "brightness(1)" }],
      { duration: 330 }
    );
    spawnSlash("#f0445a", true);
    playBlackFlash();
  },
  onUltimate: ({ ultimate, damage }) => {
    if (!ultimate) return;
    run.peakDamage = Math.max(run.peakDamage, Math.round(damage));
    spawnSlash(ultimate.color || "#f0445a", true);
    showFloating("#enemy-card", damage, "damage");
    $("#battle-message").textContent = `${ultimate.name}: ${ultimate.effect}`;
    render();
  },
  onDomain: (_turns, characterId) => {
    const ultimate = ULTIMATES[characterId];
    setDomainMode(true);
    playDomainExpansion();
    $("#battle-status").textContent = `${ultimate?.name?.toUpperCase() || "DOMAIN EXPANSION"} · 3 TURNS`;
  },
  onDomainEnd: () => {
    if (!isHeianMode) setDomainMode(false);
  },
  onReward: (cards) => {
    run.stagesCleared += 1;
    showRewards(cards);
  },
  onRewardChosen: () => {
    rewardPanel.hidden = true;
    handEl.hidden = false;
    $("#battle-status").textContent = "NEXT STAGE";
  },
  onHeianPhase: () => {
    isHeianMode = true;
    setDomainMode(true);
    playDomainExpansion();
    $("#battle-status").textContent = "RYOMEN SUKUNA · HEIAN ERA";
    $("#battle-message").textContent = "A second cursed presence unfolds from the King of Curses.";
  },
  onVictory: () => {
    isHeianMode = false;
    setDomainMode(false);
    run.stagesCleared = 5;
    totals.clears += 1;
    totals.bestStage = Math.max(totals.bestStage, 5);
    saveStats();
    playVictory();
    $("#battle-status").textContent = "CURSED ARENA CLEARED";
    $("#battle-message").textContent = "The veil lifts. You survived Domain Clash.";
    window.setTimeout(() => showRunScreen("VICTORY"), 550);
  },
  onGameOver: () => {
    setDomainMode(false);
    $("#battle-status").textContent = "YOU HAVE FALLEN";
    $("#battle-message").textContent = "The veil closes around the arena.";
    window.setTimeout(() => showRunScreen("DEFEAT"), 450);
  },
});

buildCharacterChoices();
document.querySelectorAll("[data-difficulty]").forEach((button) => {
  button.addEventListener("click", () => {
    selectedDifficulty = button.dataset.difficulty;
    document.querySelectorAll("[data-difficulty]").forEach((option) => {
      const active = option === button;
      option.classList.toggle("is-active", active);
      option.setAttribute("aria-pressed", String(active));
    });
  });
});
$("#start-run").addEventListener("click", () => startRun());
$("#play-again").addEventListener("click", () => {
  runOverlay.hidden = true;
  startRun(selectedCharacter);
});
$("#change-fighter").addEventListener("click", () => {
  runOverlay.hidden = true;
  shell.hidden = true;
  characterScreen.classList.add("is-visible");
});
$("#stats-button").addEventListener("click", () => $("#stats-modal").showModal());
$("#close-stats").addEventListener("click", () => $("#stats-modal").close());
$("#mute-toggle").addEventListener("click", () => {
  activateAudio();
  const muted = toggleMute();
  $("#mute-toggle").setAttribute("aria-pressed", String(muted));
  $("#mute-toggle").setAttribute("aria-label", muted ? "Unmute audio" : "Mute audio");
  $(".mute-icon").textContent = muted ? "♪̸" : "♫";
  $(".mute-label").textContent = muted ? "SOUND OFF" : "SOUND ON";
});
$("#end-turn").addEventListener("click", () => {
  activateAudio();
  playCardSelect();
  endTurn();
});
$("#domain-button").addEventListener("click", () => {
  activateAudio();
  activateDomain();
});
$("#timing-hit").addEventListener("click", () => lockTiming(getTimingPosition()));
window.addEventListener("keydown", (event) => {
  if (event.code === "Space" && GAME_STATE.phase === PHASE.TIMING_CHECK) {
    event.preventDefault();
    lockTiming(getTimingPosition());
    return;
  }
  if (event.code === "Escape" && $("#stats-modal").open) {
    $("#stats-modal").close();
    return;
  }
  if (event.repeat || $("#stats-modal").open || GAME_STATE.phase !== PHASE.PLAYER_TURN) return;
  if (/^Digit[1-4]$/.test(event.code)) {
    const card = GAME_STATE.hand[Number(event.code.slice(-1)) - 1];
    if (card) {
      activateAudio();
      playCardSelect();
      playCard(card);
    }
  } else if (event.code === "KeyE") {
    activateAudio();
    endTurn();
  } else if (event.code === "KeyD") {
    activateAudio();
    activateDomain();
  }
});

updateStatsViews();
