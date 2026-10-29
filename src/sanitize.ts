import {
  CURRENCY_MAX, REBIRTHS_MAX, DISTANCE_MAX, PLAY_SECONDS_MAX, LEVEL_MAX, XP_MAX, EPOCH_AHEAD_MS, OWNED_MAX,
  SWELLS_MAX, SWELL_COUNT_MAX, PETS_MAX, PET_SLOTS_MAX, PET_ID_MAX, EGG_KINDS_MAX, EGG_COUNT_MAX, POTIONS_MAX,
  POTION_MULT_MAX, POTION_MINUTES_MAX, CLAIMED_MAX, DAILY_STREAK_MAX, QUEST_PROGRESS_MAX, TUTORIAL_STEP_MAX, ID_PATTERN,
  NAME_ID_PATTERN,
} from "./constants.js";
import type { PlayerDoc, SavedPet, SavedPotion, SavedQuests } from "./db.js";

export function finite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
export function clampNum(v: number, max: number): number {
  return Math.min(max, Math.max(0, v));
}
export function clampInt(v: number, max: number, min = 0): number {
  return Math.min(max, Math.max(min, Math.floor(v)));
}
function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
const isId = (v: unknown): v is string => typeof v === "string" && ID_PATTERN.test(v);
const isEggName = (v: unknown): v is string => typeof v === "string" && NAME_ID_PATTERN.test(v);
// An epoch-ms timestamp: 0 (= never / ready) up to a year ahead of now.
const epoch = (v: number) => clampNum(Math.floor(v), Date.now() + EPOCH_AHEAD_MS);

// Catalog ids (boards, trails, pet kinds): slug strings, no duplicates, bounded count.
export function sanitizeIds(raw: unknown, max = OWNED_MAX): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter(isId))].slice(0, max);
}

// Indexes (playtime rewards claimed): whole numbers below CLAIMED_MAX, no duplicates.
function sanitizeIndexes(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((i): i is number => Number.isInteger(i) && i >= 0 && i < CLAIMED_MAX))];
}

// Owned pets { id, kind, equipped }: integer ids, slug kinds, at most PETS_MAX, and no more than
// `slots` of them equipped (the extra ones are unequipped, never dropped).
export function sanitizePets(raw: unknown, slots = PET_SLOTS_MAX): SavedPet[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedPet[] = [];
  let equipped = 0;
  for (const p of raw) {
    if (out.length >= PETS_MAX) break;
    if (!isObject(p) || !isId(p.kind) || !Number.isInteger(p.id) || (p.id as number) < 0 || (p.id as number) > PET_ID_MAX) continue;
    const on = p.equipped === true && equipped < slots;
    if (on) equipped++;
    out.push({ id: p.id as number, kind: p.kind, equipped: on });
  }
  return out;
}

// Swell purchases per tier: a short list of whole non-negative counts.
function sanitizeSwells(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, SWELLS_MAX).map((n) => (finite(n) ? clampInt(n, SWELL_COUNT_MAX) : 0));
}

// Reward eggs waiting to open { "Shell Egg": n }: display-name keys, whole positive counts.
function sanitizeEggs(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObject(raw)) return out;
  for (const [name, n] of Object.entries(raw)) {
    if (Object.keys(out).length >= EGG_KINDS_MAX) break;
    if (isEggName(name) && finite(n) && n >= 1) out[name] = clampInt(n, EGG_COUNT_MAX);
  }
  return out;
}

// Potions in the bag { id, type, mult, minutes }.
function sanitizePotions(raw: unknown): SavedPotion[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedPotion[] = [];
  for (const p of raw) {
    if (out.length >= POTIONS_MAX) break;
    if (!isObject(p) || !Number.isInteger(p.id) || (p.id as number) < 0 || !isId(p.type) || !finite(p.mult) || !finite(p.minutes)) continue;
    out.push({ id: p.id as number, type: p.type, mult: Math.min(POTION_MULT_MAX, Math.max(1, p.mult)), minutes: clampInt(p.minutes, POTION_MINUTES_MAX, 1) });
  }
  return out;
}

// Running potions by type { wave: { mult, until } | null }.
function sanitizePotionOn(raw: unknown): Record<string, { mult: number; until: number } | null> {
  const out: Record<string, { mult: number; until: number } | null> = {};
  if (!isObject(raw)) return out;
  for (const [type, on] of Object.entries(raw)) {
    if (Object.keys(out).length >= 8) break;
    if (!isId(type)) continue;
    out[type] = isObject(on) && finite(on.mult) && finite(on.until) ? { mult: Math.min(POTION_MULT_MAX, Math.max(1, on.mult)), until: epoch(on.until) } : null;
  }
  return out;
}

function sanitizeQuests(raw: unknown): SavedQuests | undefined {
  if (!isObject(raw) || !finite(raw.since)) return undefined;
  const progress: Record<string, number> = {};
  if (isObject(raw.progress)) {
    for (const [id, n] of Object.entries(raw.progress)) {
      if (Object.keys(progress).length >= CLAIMED_MAX) break;
      if (isId(id) && finite(n)) progress[id] = clampNum(n, QUEST_PROGRESS_MAX);
    }
  }
  const claimed = Array.isArray(raw.claimed) ? [...new Set(raw.claimed.filter(isId))].slice(0, CLAIMED_MAX) : [];
  return { since: epoch(raw.since), progress, claimed, bonus: raw.bonus === true };
}

// The game is client-authoritative -- no server-side gameplay validation. What IS enforced:
// shape and bounds, so a malformed payload can never corrupt this player's own Mongo document.
// A forged number can only ever affect the sender's own save.
export function sanitizeProgress(raw: unknown): Partial<PlayerDoc> | null {
  if (!isObject(raw)) return null;
  const out: Partial<PlayerDoc> = {};

  if (finite(raw.waveHeight)) out.waveHeight = clampNum(raw.waveHeight, CURRENCY_MAX);
  if (finite(raw.trophies)) out.trophies = clampNum(raw.trophies, CURRENCY_MAX);
  if (finite(raw.gems)) out.gems = clampNum(raw.gems, CURRENCY_MAX);
  if (finite(raw.rebirths)) out.rebirths = clampInt(raw.rebirths, REBIRTHS_MAX);
  if (finite(raw.level)) out.level = clampInt(raw.level, LEVEL_MAX, 1);
  if (finite(raw.xp)) out.xp = clampNum(raw.xp, XP_MAX);
  if (raw.swells !== undefined) out.swells = sanitizeSwells(raw.swells);
  if (typeof raw.autoPaddle === "boolean") out.autoPaddle = raw.autoPaddle;
  if (typeof raw.autoDelete === "boolean") out.autoDelete = raw.autoDelete;
  if (finite(raw.bestDistance)) out.bestDistance = clampNum(raw.bestDistance, DISTANCE_MAX);
  if (finite(raw.lastGift)) out.lastGift = epoch(raw.lastGift);
  if (finite(raw.playSeconds)) out.playSeconds = clampInt(raw.playSeconds, PLAY_SECONDS_MAX);
  if (finite(raw.lastSeen)) out.lastSeen = clampInt(raw.lastSeen, Date.now() + 10 * 60 * 1000);
  if (finite(raw.tutorialStep)) out.tutorialStep = clampInt(raw.tutorialStep, TUTORIAL_STEP_MAX);

  // Owned lists + the equipped id, which must be owned (when this save doesn't carry the list,
  // trust the id's shape only).
  for (const [listKey, idKey] of [["boards", "board"], ["trails", "trail"]] as const) {
    if (raw[listKey] !== undefined) out[listKey] = sanitizeIds(raw[listKey]);
    const id = raw[idKey];
    const owned = out[listKey];
    if (isId(id) && (!owned || owned.includes(id))) out[idKey] = id;
  }

  if (isObject(raw.boostUntil)) {
    out.boostUntil = {
      skill: finite(raw.boostUntil.skill) ? epoch(raw.boostUntil.skill) : 0,
      wins: finite(raw.boostUntil.wins) ? epoch(raw.boostUntil.wins) : 0,
    };
  }

  if (finite(raw.petSlots)) out.petSlots = clampInt(raw.petSlots, PET_SLOTS_MAX, 1);
  if (raw.pets !== undefined) out.pets = sanitizePets(raw.pets, out.petSlots ?? PET_SLOTS_MAX);
  if (raw.petsSeen !== undefined) out.petsSeen = sanitizeIds(raw.petsSeen);
  if (finite(raw.nextPetId)) out.nextPetId = clampInt(raw.nextPetId, PET_ID_MAX, 1);
  if (raw.eggs !== undefined) out.eggs = sanitizeEggs(raw.eggs);

  if (raw.potions !== undefined) out.potions = sanitizePotions(raw.potions);
  if (raw.potionOn !== undefined) out.potionOn = sanitizePotionOn(raw.potionOn);
  if (finite(raw.nextPotionId)) out.nextPotionId = clampInt(raw.nextPotionId, PET_ID_MAX, 1);

  if (raw.playtimeClaimed !== undefined) out.playtimeClaimed = sanitizeIndexes(raw.playtimeClaimed);
  if (isObject(raw.daily) && finite(raw.daily.day) && finite(raw.daily.last)) {
    out.daily = { day: clampInt(raw.daily.day, DAILY_STREAK_MAX), last: epoch(raw.daily.last) };
  }
  if (raw.quests !== undefined) {
    const quests = sanitizeQuests(raw.quests);
    if (quests) out.quests = quests;
  }
  return out;
}
