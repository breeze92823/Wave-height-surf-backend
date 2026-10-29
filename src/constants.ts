// Keep in step with the client's src/config.js by hand.
export const ROOM_MAX_CLIENTS = 50;

// Longest accepted strings.
export const NAME_MAX = 64;
// Profile picture URL (Bloxity `pfp`), relayed so other players can draw it.
export const PFP_MAX_LEN = 512;
// Presence (presence.ts): the Bloxity avatar JSON relayed for the others to draw, the most pets
// drawn per player, and the pose bounds (|x|, |y|, |z| up to `xy` m; speed in m/s).
export const AVATAR_MAX_LEN = 3000;
export const PRESENCE_PETS_MAX = 8;
export const POSE_BOUNDS = { xy: 5000, speed: 500 };

// Colyseus drops the whole connection for a WebSocket message above this (default 4 KB).
export const MAX_PAYLOAD_BYTES = 128 * 1024;

// How long a dropped connection (WiFi blip, backgrounded tab) may reconnect with the same session.
export const RECONNECT_SECONDS = 20;

// Upper bounds for saved values, so a forged payload cannot store a bogus number. Generous
// ceilings, not game rules: Wave Height grows without limit (the client's meter tops out at 1e24).
export const CURRENCY_MAX = 1e33; // wave height, trophies (Wins), gems
export const REBIRTHS_MAX = 1e9;
export const DISTANCE_MAX = 1e9; // personal best ride, metres
export const WAVE_MAX = 100; // live surf wave crest, metres (client SURF.waveMax * faceScale ~25)
export const PLAY_SECONDS_MAX = 31_536_000; // ~1 year
export const LEVEL_MAX = 1000; // client ECONOMY.levelMax is 30
export const XP_MAX = 1e9;
export const EPOCH_AHEAD_MS = 366 * 24 * 3600 * 1000; // timed fields (boosts, potions) never lie further ahead

// Owned catalog ids (client ECONOMY.boards ~6, trails ~4), with slack.
export const OWNED_MAX = 256;
// Swell upgrade tiers (client ECONOMY.swells, 3 of them) and the purchases per tier.
export const SWELLS_MAX = 16;
export const SWELL_COUNT_MAX = 1e9;
// Pets (client PETS): at most PETS_MAX owned, PET_SLOTS_MAX the equip-slot counter can grow to.
export const PETS_MAX = 1000;
export const PET_SLOTS_MAX = 50;
export const PET_ID_MAX = 1e9;
// Trading (trade.ts): the most pets one side may offer (client TRADE.maxPets) and how long an
// unanswered trade invite stays valid.
export const TRADE_PETS_MAX = 9;
export const TRADE_INVITE_MS = 30 * 1000;
// Reward eggs waiting to open (name -> count), potions in the bag and the claim lists.
export const EGG_KINDS_MAX = 32;
export const EGG_COUNT_MAX = 1e9;
export const POTIONS_MAX = 512;
export const POTION_MULT_MAX = 1000;
export const POTION_MINUTES_MAX = 10_080; // a week
export const CLAIMED_MAX = 64; // playtime rewards claimed, quests claimed
export const DAILY_STREAK_MAX = 1e6;
export const QUEST_PROGRESS_MAX = 1e6;
export const TUTORIAL_STEP_MAX = 64; // client TUTORIAL has 5 steps; its length = done or skipped

// Leaderboards (leaderboard.ts; client south.js boards): the saved doc fields ranked. The client's
// board ids are rebirths, wave (= waveHeight), trophies and best (= bestDistance).
export const LEADERBOARD_STATS = ["rebirths", "waveHeight", "trophies", "bestDistance"] as const;
export type LeaderboardStat = (typeof LEADERBOARD_STATS)[number];
export const LEADERBOARD_SIZE = 10;
export const LEADERBOARD_EVERY_MS = 60 * 1000;

// Ids from the client's catalogs (boards, trails, pet kinds, potion types): slugs, so nothing odd
// is stored.
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
// Egg names are display names with spaces ("Shell Egg").
export const NAME_ID_PATTERN = /^[A-Za-z0-9 _-]{1,32}$/;

// The client's per-browser fallback id for players who are not signed in to Bloxity.
// Guests are never persisted.
export const GUEST_ID_PREFIX = "guest-";
