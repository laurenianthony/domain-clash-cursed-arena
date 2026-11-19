import { CARDS, CHARACTERS, ENEMIES, ENEMY_POOL } from "./data.js";

export const PHASE = Object.freeze({
  CHAR_SELECT: "CHAR_SELECT", PLAYER_TURN: "PLAYER_TURN", TIMING_CHECK: "TIMING_CHECK",
  ENEMY_TURN: "ENEMY_TURN", REWARD: "REWARD", GAME_OVER: "GAME_OVER", VICTORY: "VICTORY",
});

export const GAME_STATE = {
  phase: PHASE.CHAR_SELECT, characterId: null, player: null, stage: 1,
  lineup: [], deck: [], hand: [], discard: [], enemyId: null,
  bossPhase: 0, turn: 1,
};
Object.defineProperties(GAME_STATE, {
  ce: { get() { return this.player?.ce ?? 0; }, set(value) { if (this.player) this.player.ce = value; } },
  domain: { get() { return this.player?.domain ?? 0; }, set(value) { if (this.player) this.player.domain = value; } },
  domainTurns: { get() { return this.player?.domainTurns ?? 0; }, set(value) { if (this.player) this.player.domainTurns = value; } },
});

export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function selectCharacter(characterId) {
  if (!CHARACTERS[characterId]) return false;
  GAME_STATE.characterId = characterId;
  GAME_STATE.phase = PHASE.CHAR_SELECT;
  return true;
}

export function initRun(characterId = GAME_STATE.characterId, random = Math.random) {
  const fighter = CHARACTERS[characterId];
  if (!fighter) throw new Error(`Unknown character: ${characterId}`);
  const shuffledPool = shuffle(ENEMY_POOL, random);
  const chosen = shuffledPool.filter((id) => id !== "sukuna").slice(0, 4);
  const lineup = [...shuffle(chosen, random), "sukuna"];
  const deck = shuffle(fighter.starterDeck.map((id, index) => ({ ...CARDS[id], instanceId: `${id}-${index}-${Math.floor(random() * 1e9)}` })), random);
  Object.assign(GAME_STATE, {
    phase: PHASE.PLAYER_TURN,
    characterId,
    player: {
      hp: fighter.maxHp,
      maxHp: fighter.maxHp,
      block: 0,
      ce: fighter.maxCe,
      maxCe: fighter.maxCe,
      domain: 0,
      domainTurns: 0,
      blackFlashDomainTurns: 0,
      domainCritMultiplier: 1.75,
      evasionTurns: 0,
      burn: 0,
      burnTurns: 0,
      vulnerable: 0,
      vulnerableTurns: 0,
      weakened: 0,
      debuffProtected: false,
      passiveFlags: {},
    },
    stage: 1, lineup, deck, hand: deck.splice(0, 4), discard: [],
    enemyId: null, bossPhase: 0, turn: 1,
  });
  return GAME_STATE;
}
