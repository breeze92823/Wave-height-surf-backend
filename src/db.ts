import { MongoClient, type Collection } from "mongodb";

import { LEADERBOARD_STATS } from "./constants.js";

// Bloxity Legion hosting injects MONGODB_URI per game+channel -- an isolated database with
// scoped credentials. A local `npm start` normally has no Mongo reachable, so a missing or
// unreachable URI must degrade to "no persistence" rather than crash the room.

// The persisted client state (what `saveProgress` carries, see sanitize.ts; mirrors the client's
// game.js `fresh()`). The client keeps nothing in the browser: this document is the player's only save.
export interface PlayerDoc {
  _id: string; // Bloxity user id -- see WorldRoom.ts (guests are never saved)
  username?: string; // display name as of the last save
  waveHeight?: number; // Wave Height, built by paddling (reset by a rebirth)
  trophies?: number; // Wins: the shop currency
  gems?: number;
  rebirths?: number;
  level?: number;
  xp?: number;
  swells?: number[]; // purchases per Swell tier (client ECONOMY.swells)
  boards?: string[]; // owned surfboard ids (client ECONOMY.boards)
  board?: string; // the equipped board (an owned one)
  trails?: string[]; // owned trail ids (client ECONOMY.trails)
  trail?: string; // the equipped trail (an owned one)
  autoPaddle?: boolean;
  boostUntil?: { skill: number; wins: number }; // epoch ms the gem boosts run until
  lastGift?: number; // epoch ms of the last free gift, 0 = ready
  bestDistance?: number; // personal best ride, metres (only ever goes up)
  pets?: SavedPet[]; // owned pets (client pets), at most PETS_MAX
  petSlots?: number; // pets equipped at once
  petsSeen?: string[]; // pet kinds ever hatched (the NEW! tag)
  nextPetId?: number;
  autoDelete?: boolean; // hatched commons are dropped
  eggs?: Record<string, number>; // reward eggs waiting to open: egg name -> count
  potions?: SavedPotion[]; // potions in the bag
  potionOn?: Record<string, { mult: number; until: number } | null>; // running potions by type
  nextPotionId?: number;
  playSeconds?: number; // this session's clock (Playtime rewards)
  playtimeClaimed?: number[]; // indexes of ECONOMY.playtime
  daily?: { day: number; last: number }; // Daily Reward streak and epoch ms of the last claim
  quests?: SavedQuests;
  tutorialStep?: number; // index in the client's TUTORIAL; its length = done or skipped
  lastSeen?: number; // epoch ms of the last activity
  version: number;
  updatedAt: Date;
}

// One owned pet: its client-side id, its kind (client PET_KINDS key) and whether it is equipped.
export interface SavedPet {
  id: number;
  kind: string;
  equipped: boolean;
}

export interface SavedPotion {
  id: number;
  type: string; // wave | wins | luck
  mult: number;
  minutes: number;
}

export interface SavedQuests {
  since: number; // epoch ms the current set started
  progress: Record<string, number>; // quest id -> progress
  claimed: string[];
  bonus: boolean;
}

let client: MongoClient | null = null;
let players: Collection<PlayerDoc> | null = null;

export async function connectDb(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn("[db] MONGODB_URI not set -- player progress will not persist");
    return;
  }
  try {
    client = new MongoClient(uri);
    await client.connect();
    // No dbName passed to .db() -- the injected URI already points at this game+channel's database.
    players = client.db().collection<PlayerDoc>("players");
    console.log("[db] connected to MongoDB");
    // The leaderboards sort and count by these (leaderboard.ts).
    for (const stat of LEADERBOARD_STATS) {
      players.createIndex({ [stat]: -1 }).catch((err) => console.warn(`[db] index on ${stat} failed`, err));
    }
  } catch (err) {
    console.warn("[db] connect failed -- player progress will not persist:", err);
    client = null;
    players = null;
  }
}

// Null whenever Mongo is unset/unreachable -- every caller must treat that as "skip persistence".
export function getPlayers(): Collection<PlayerDoc> | null {
  return players;
}

// Test-only seam: exercise the save/load logic against an in-memory fake collection.
export function __setPlayersForTest(fake: Collection<PlayerDoc> | null): void {
  players = fake;
}
