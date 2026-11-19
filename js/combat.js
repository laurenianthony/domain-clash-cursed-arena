import { GAME_STATE, PHASE, shuffle } from "./state.js";
import { CARDS, CHARACTERS, ENEMIES, HEIAN_SUKUNA, ULTIMATES } from "./data.js";

const SWEEP_MS = 1400;
let bfRadius = 7;
let goodRadius = 22;
let enemyHpMult = 1;
let enemyDmgMult = 1;
let difficultyMode = "medium";

let enemy = null;
let intentIndex = 0;
let pendingCard = null;
let timingFrame = 0;
let timingStart = 0;
let timingPosition = 0;
let callbacks = {};
let intentReduction = 0;

const notify = () => callbacks.onUpdate?.(GAME_STATE, enemy);
const activeIntent = () => enemy.intents[intentIndex % enemy.intents.length];
const enemyTemplate = (id) => (id === "sukuna_heian" ? HEIAN_SUKUNA : ENEMIES[id]);

export function setCombatCallbacks(next = {}) {
  callbacks = { ...callbacks, ...next };
}

export function getCurrentEnemy() {
  return enemy;
}

export function getCurrentIntent() {
  return enemy ? activeIntent() : null;
}

export function getTimingPosition() {
  return timingPosition;
}

export function setDifficulty(mode = "medium") {
  const presets = {
    easy: { enemyHpMult: 0.8, enemyDmgMult: 0.8, bfRadius: 10, goodRadius: 26 },
    medium: { enemyHpMult: 1, enemyDmgMult: 1, bfRadius: 7, goodRadius: 22 },
    hard: { enemyHpMult: 1.25, enemyDmgMult: 1.25, bfRadius: 5, goodRadius: 18 },
  };
  difficultyMode = Object.hasOwn(presets, String(mode).toLowerCase())
    ? String(mode).toLowerCase()
    : "medium";
  ({ enemyHpMult, enemyDmgMult, bfRadius, goodRadius } = presets[difficultyMode]);
  return difficultyMode;
}

export function initializeCombat() {
  if (pendingCard) stopTiming();
  if (!GAME_STATE.player) {
    enemy = null;
    GAME_STATE.phase = PHASE.CHAR_SELECT;
    intentIndex = 0;
    intentReduction = 0;
    notify();
    return null;
  }
  GAME_STATE.enemyId =
    GAME_STATE.bossPhase === 2 ? "sukuna_heian" : GAME_STATE.lineup[GAME_STATE.stage - 1];
  if (GAME_STATE.stage === 5 && GAME_STATE.enemyId === "sukuna" && GAME_STATE.bossPhase === 0) {
    GAME_STATE.bossPhase = 1;
  }
  const template = enemyTemplate(GAME_STATE.enemyId);
  if (!template || !template.intents?.length) {
    enemy = null;
    GAME_STATE.phase = PHASE.GAME_OVER;
    notify();
    return null;
  }
  const scaledIntents = template.intents.map((intent) => {
    if (!intent.damage) return { ...intent };
    const damage = Math.max(1, Math.round(intent.damage * enemyDmgMult));
    return {
      ...intent,
      damage,
      label: intent.label?.replace(/\d+/, String(damage)) || intent.label,
    };
  });
  const scaledMaxHp = Math.max(1, Math.round((template.maxHp || template.hp) * enemyHpMult));
  enemy = {
    ...template,
    intents: scaledIntents,
    hp: Math.max(1, Math.round(template.hp * enemyHpMult)),
    maxHp: scaledMaxHp,
    block: 0,
    power: 0,
    vulnerable: 0,
    vulnerableTurns: 0,
    vulnerabilityMultiplier: 1.5,
    stunnedTurns: 0,
    burn: 0,
    burnTurns: 0,
  };
  intentIndex = 0;
  intentReduction = 0;
  GAME_STATE.phase = PHASE.PLAYER_TURN;
  notify();
  return enemy;
}

function damageEnemy(amount, { trueDamage = false, bypassBlock = false } = {}) {
  const player = GAME_STATE.player;
  if (!player || !enemy || enemy.id !== GAME_STATE.enemyId) return 0;
  const vulnerability =
    enemy.vulnerableTurns > 0 ? enemy.vulnerabilityMultiplier || 1.5 : 1;
  const weakened = player.weakened > 0 ? 0.8 : 1;
  let damage = Math.max(0, Math.round(amount * vulnerability * weakened));
  if (!trueDamage && !bypassBlock) {
    const blocked = Math.min(enemy.block, damage);
    enemy.block -= blocked;
    damage -= blocked;
  }
  const applied = Math.min(enemy.hp, damage);
  enemy.hp = Math.max(0, enemy.hp - applied);
  notify();
  return applied;
}

function drawCards(count = 4) {
  while (
    GAME_STATE.hand.length < count &&
    (GAME_STATE.deck.length || GAME_STATE.discard.length)
  ) {
    if (!GAME_STATE.deck.length) {
      GAME_STATE.deck.push(...shuffle(GAME_STATE.discard.splice(0)));
    }
    GAME_STATE.hand.push(GAME_STATE.deck.shift());
  }
}

function removeFromHand(card) {
  const index = GAME_STATE.hand.findIndex(
    (held) => held.instanceId === card.instanceId
  );
  if (index < 0) return false;
  GAME_STATE.hand.splice(index, 1);
  GAME_STATE.discard.push(card);
  return true;
}

function endEncounter() {
  if (
    GAME_STATE.stage === 5 &&
    GAME_STATE.enemyId === "sukuna" &&
    GAME_STATE.bossPhase === 1
  ) {
    GAME_STATE.bossPhase = 2;
    enemy = null;
    callbacks.onHeianPhase?.();
    initializeCombat();
    return;
  }
  if (GAME_STATE.stage >= 5) {
    GAME_STATE.phase = PHASE.VICTORY;
    callbacks.onVictory?.();
    notify();
    return;
  }
  GAME_STATE.phase = PHASE.REWARD;
  const rewardHeal = Math.min(12, GAME_STATE.player.maxHp - GAME_STATE.player.hp);
  GAME_STATE.player.hp += rewardHeal;
  callbacks.onHeal?.({ value: rewardHeal, reward: true });
  const character = CHARACTERS[GAME_STATE.characterId];
  const rewardPool = character.cardPool
    .map((id) => CARDS[id])
    .filter((card) => card && !character.starterDeck.includes(card.id));
  const choices = shuffle(rewardPool)
    .slice(0, 3)
    .map((card, index) => ({
      ...card,
      instanceId: `reward-${GAME_STATE.stage}-${index}-${Date.now()}`,
    }));
  callbacks.onReward?.(choices);
  notify();
}

function checkEnemyDefeated() {
  if (
    enemy &&
    enemy.hp <= 0 &&
    GAME_STATE.phase !== PHASE.VICTORY &&
    GAME_STATE.phase !== PHASE.REWARD
  ) {
    endEncounter();
  }
}

function playCardEffect(card, rating = "NORMAL") {
  const player = GAME_STATE.player;
  if (
    !card ||
    !player ||
    !enemy ||
    enemy.id !== GAME_STATE.enemyId ||
    card.characterId !== GAME_STATE.characterId ||
    GAME_STATE.phase !== PHASE.PLAYER_TURN ||
    GAME_STATE.ce < card.cost
  ) {
    return false;
  }
  if (!GAME_STATE.hand.some((held) => held.instanceId === card.instanceId)) {
    return false;
  }

  const isOffense = card.type === "ATTACK" || Number.isFinite(card.value);
  const effectiveRating =
    isOffense &&
    GAME_STATE.characterId === "yuji" &&
    (player.blackFlashDomainTurns || 0) > 0
      ? "BLACK_FLASH"
      : rating;

  player.ce -= card.cost;
  let totalDamage = 0;

  if (isOffense && card.value) {
    const crit =
      player.domainTurns > 0
        ? player.domainCritMultiplier || 1.75
        : effectiveRating === "BLACK_FLASH"
        ? 2.5
        : effectiveRating === "GOOD"
        ? 1.25
        : 1;
    const passiveDamage =
      effectiveRating === "BLACK_FLASH" && GAME_STATE.characterId === "yuji" ? 4 : 0;
    const resonanceDamage =
      GAME_STATE.characterId === "nobara" && enemy.vulnerableTurns > 0 ? 4 : 0;

    for (let hit = 0; hit < (card.hits || 1); hit++) {
      const added = hit === 0 ? passiveDamage + resonanceDamage : 0;
      totalDamage += damageEnemy(card.value * crit + added, {
        trueDamage: card.trueDamage,
        bypassBlock: player.domainTurns > 0,
      });
    }

    if (card.delayed && enemy.hp > 0) {
      totalDamage += damageEnemy(card.delayed * crit, { trueDamage: true });
    }

    if (card.vulnerable) {
      enemy.vulnerableTurns = Math.max(enemy.vulnerableTurns, card.vulnerable);
      enemy.vulnerable = 1;
    }

    if (card.pushback) {
      const nextAttack = enemy.intents
        .slice(intentIndex)
        .concat(enemy.intents.slice(0, intentIndex))
        .find((intent) => intent.damage);
      intentReduction = Math.ceil((nextAttack?.damage || 0) * 0.3);
    }
  }

  if (card.block) {
    const shadowBonus =
      GAME_STATE.characterId === "megumi" && !player.passiveFlags.shadowGuard
        ? 4
        : 0;
    player.block += card.block + shadowBonus;
    if (GAME_STATE.characterId === "megumi") {
      player.passiveFlags.shadowGuard = true;
    }
    player.debuffProtected = Boolean(card.cleanse);
    callbacks.onShield?.({ ...card, block: card.block + shadowBonus });
  }

  if (card.evade) {
    player.evasionTurns = Math.max(player.evasionTurns || 0, 1);
  }

  if (card.heal) {
    const healed = Math.min(card.heal, player.maxHp - player.hp);
    player.hp += healed;
    callbacks.onHeal?.({ value: healed });
  }

  if (card.energy) {
    player.ce = Math.min(player.maxCe, player.ce + card.energy);
  }

  if (effectiveRating === "BLACK_FLASH") {
    player.domain = Math.min(100, player.domain + 15);
    player.ce = Math.min(player.maxCe, player.ce + 1);
    callbacks.onBlackFlash?.();
  }

  player.domain = Math.min(100, player.domain + (card.domainGain || 0));
  removeFromHand(card);
  if (totalDamage > 0) {
    callbacks.onHit?.({ card, damage: totalDamage, rating: effectiveRating });
  }
  checkEnemyDefeated();
  notify();
  return true;
}

function stopTiming() {
  if (timingFrame) cancelAnimationFrame(timingFrame);
  timingFrame = 0;
  pendingCard = null;
  timingStart = 0;
  callbacks.onTimingEnd?.();
}

function tickTiming(timestamp) {
  if (!pendingCard || GAME_STATE.phase !== PHASE.TIMING_CHECK) return;
  if (!timingStart) timingStart = timestamp;
  const elapsed = (timestamp - timingStart) % (SWEEP_MS * 2);
  const progress =
    elapsed <= SWEEP_MS ? elapsed / SWEEP_MS : 2 - elapsed / SWEEP_MS;
  timingPosition = progress * 100;
  callbacks.onTimingCursor?.(timingPosition);
  timingFrame = requestAnimationFrame(tickTiming);
}

export function playCard(card) {
  if (
    !card ||
    !GAME_STATE.player ||
    !enemy ||
    enemy.id !== GAME_STATE.enemyId ||
    card.characterId !== GAME_STATE.characterId ||
    GAME_STATE.phase !== PHASE.PLAYER_TURN ||
    GAME_STATE.ce < card.cost
  ) {
    return false;
  }
  if (!GAME_STATE.hand.some((held) => held.instanceId === card.instanceId)) {
    return false;
  }
  if (card.type !== "ATTACK") return playCardEffect(card);

  GAME_STATE.phase = PHASE.TIMING_CHECK;
  pendingCard = card;
  timingPosition = 0;
  timingStart = 0;
  callbacks.onTimingStart?.(card);
  timingFrame = requestAnimationFrame(tickTiming);
  notify();
  return true;
}

export function lockTiming(position = timingPosition) {
  if (!pendingCard || GAME_STATE.phase !== PHASE.TIMING_CHECK) return false;
  if (!GAME_STATE.player || !enemy || enemy.id !== GAME_STATE.enemyId) {
    stopTiming();
    GAME_STATE.phase = GAME_STATE.player ? PHASE.PLAYER_TURN : PHASE.CHAR_SELECT;
    notify();
    return false;
  }
  const distance = Math.abs(position - 50);
  const rating =
    distance <= bfRadius
      ? "BLACK_FLASH"
      : distance <= goodRadius
      ? "GOOD"
      : "NORMAL";
  const card = pendingCard;
  stopTiming();
  GAME_STATE.phase = PHASE.PLAYER_TURN;
  callbacks.onTimingResult?.(rating);
  return playCardEffect(card, rating);
}

export function chooseReward(cardId) {
  if (GAME_STATE.phase !== PHASE.REWARD || !GAME_STATE.player || !enemy || enemy.id !== GAME_STATE.enemyId) return false;
  const card = CARDS[cardId];
  const character = CHARACTERS[GAME_STATE.characterId];
  if (
    !card ||
    card.characterId !== GAME_STATE.characterId ||
    !character.cardPool.includes(cardId)
  ) {
    return false;
  }
  GAME_STATE.deck.push({
    ...card,
    instanceId: `reward-${GAME_STATE.stage}-${Date.now()}`,
  });
  GAME_STATE.stage += 1;
  GAME_STATE.turn = 1;
  GAME_STATE.player.ce = Math.min(
    GAME_STATE.player.maxCe,
    GAME_STATE.player.ce + 1
  );
  GAME_STATE.player.block = 0;
  GAME_STATE.player.passiveFlags = {};
  initializeCombat();
  callbacks.onRewardChosen?.(card);
  return true;
}

export function activateDomain() {
  const player = GAME_STATE.player;
  if (!player || !enemy || enemy.id !== GAME_STATE.enemyId || GAME_STATE.phase !== PHASE.PLAYER_TURN || player.domain < 100) {
    return false;
  }
  const characterId = GAME_STATE.characterId;
  const signature = ULTIMATES[characterId];
  if (!signature) return false;

  player.domain = 0;
  player.domainTurns = 3;
  player.domainCritMultiplier = characterId === "yuji" ? 2.5 : 1.75;
  player.ce = Math.min(player.maxCe, player.ce + 3);

  const damage = damageEnemy(signature.damage, { trueDamage: true });

  if (characterId === "yuji") {
    player.blackFlashDomainTurns = 3;
    callbacks.onBlackFlash?.();
  }
  if (characterId === "megumi") {
    player.evasionTurns = 3;
    player.block += 18;
    callbacks.onShield?.({ name: signature.name, block: 18 });
  }
  if (characterId === "nobara") {
    enemy.vulnerableTurns = Math.max(enemy.vulnerableTurns, 3);
    enemy.vulnerabilityMultiplier = 2;
  }
  if (characterId === "gojo") {
    enemy.stunnedTurns = Math.max(enemy.stunnedTurns || 0, 1);
    enemy.vulnerableTurns = Math.max(enemy.vulnerableTurns, 2);
  }

  callbacks.onUltimate?.({ characterId, ultimate: signature, damage });
  callbacks.onDomain?.(3, characterId);
  notify();
  checkEnemyDefeated();
  return true;
}

function executeIntent() {
  if (!GAME_STATE.player || !enemy || enemy.id !== GAME_STATE.enemyId) return false;
  const intent = activeIntent();
  const player = GAME_STATE.player;
  const stunned = enemy.stunnedTurns > 0;

  if (stunned) {
    enemy.stunnedTurns -= 1;
    callbacks.onStun?.();
  } else {
    if (intent.kind === "block") {
      enemy.block += intent.block || 0;
      notify();
    }
    if (intent.kind === "burn" && !player.debuffProtected) {
      player.burnTurns = Math.max(player.burnTurns, intent.turns || 1);
      player.burn = Math.max(player.burn, Math.max(1, Math.round(5 * enemyDmgMult)));
      notify();
    }
    if (intent.kind === "vulnerable" && !player.debuffProtected) {
      player.vulnerableTurns = Math.max(
        player.vulnerableTurns,
        intent.turns || 1
      );
      notify();
    }
  }

  if (!stunned && intent.damage && player.evasionTurns <= 0) {
    const attackDamage = Math.max(
      0,
      intent.damage + (enemy.power || 0) - intentReduction
    );
    for (let hit = 0; hit < (intent.hits || 1); hit++) {
      const incoming = Math.max(
        0,
        Math.round(attackDamage * (player.vulnerableTurns > 0 ? 1.5 : 1))
      );
      const absorbed = Math.min(player.block, incoming);
      player.block -= absorbed;
      const actual = Math.max(0, incoming - absorbed);
      player.hp = Math.max(0, player.hp - actual);
      notify();
      if (actual) callbacks.onPlayerDamage?.(actual);
    }
    intentReduction = 0;
    enemy.power = 0;
  } else if (!stunned && intent.damage && player.evasionTurns > 0) {
    callbacks.onEvade?.();
  }

  intentIndex = (intentIndex + 1) % enemy.intents.length;
  enemy.intentIndex = intentIndex;

  if (player.burnTurns > 0) {
    player.hp = Math.max(0, player.hp - player.burn);
    notify();
    callbacks.onPlayerDamage?.(player.burn);
    player.burnTurns -= 1;
    if (!player.burnTurns) player.burn = 0;
  }

  if (player.vulnerableTurns > 0) player.vulnerableTurns -= 1;
  if (enemy.vulnerableTurns > 0) enemy.vulnerableTurns -= 1;
  if (enemy.vulnerableTurns === 0) enemy.vulnerabilityMultiplier = 1.5;
  if (player.evasionTurns > 0) player.evasionTurns -= 1;

  if (player.domainTurns > 0) {
    player.domainTurns -= 1;
    if (player.domainTurns === 0) {
      player.domainCritMultiplier = 1.75;
      player.blackFlashDomainTurns = 0;
      callbacks.onDomainEnd?.();
    }
  }

  player.debuffProtected = false;
  notify();
  return true;
}

export function endTurn() {
  if (GAME_STATE.phase !== PHASE.PLAYER_TURN || !GAME_STATE.player || !enemy || enemy.id !== GAME_STATE.enemyId) return false;
  GAME_STATE.discard.push(...GAME_STATE.hand.splice(0));
  GAME_STATE.phase = PHASE.ENEMY_TURN;
  if (!executeIntent()) {
    GAME_STATE.phase = PHASE.PLAYER_TURN;
    notify();
    return false;
  }
  if (GAME_STATE.player.hp <= 0) {
    GAME_STATE.phase = PHASE.GAME_OVER;
    callbacks.onGameOver?.();
    notify();
    return true;
  }
  GAME_STATE.player.block = 0;
  GAME_STATE.player.ce = Math.min(
    GAME_STATE.player.maxCe,
    GAME_STATE.player.ce + 2 + (GAME_STATE.characterId === "gojo" ? 1 : 0)
  );
  GAME_STATE.player.passiveFlags = {};
  GAME_STATE.turn += 1;
  drawCards(4);
  GAME_STATE.phase = PHASE.PLAYER_TURN;
  notify();
  return true;
}
