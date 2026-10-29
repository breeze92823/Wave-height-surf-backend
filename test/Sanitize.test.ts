import assert from "assert";

import { CURRENCY_MAX, EPOCH_AHEAD_MS, POTION_MULT_MAX, TUTORIAL_STEP_MAX } from "../src/constants.js";
import { sanitizeProgress } from "../src/sanitize.js";

describe("sanitizeProgress", () => {
  it("rejects non-objects and bounds numbers", () => {
    assert.strictEqual(sanitizeProgress(null), null);
    assert.strictEqual(sanitizeProgress([1]), null);
    const out = sanitizeProgress({ waveHeight: 1e40, trophies: 1e40, gems: -5, rebirths: 3.7, level: 0, autoPaddle: "yes", hack: "x" })!;
    assert.strictEqual(out.waveHeight, CURRENCY_MAX);
    assert.strictEqual(out.trophies, CURRENCY_MAX);
    assert.strictEqual(out.gems, 0);
    assert.strictEqual(out.rebirths, 3);
    assert.strictEqual(out.level, 1);
    assert.strictEqual(out.autoPaddle, undefined);
    assert.ok(!("hack" in out));
  });

  it("keeps well-formed catalog ids and only equips an owned one", () => {
    const out = sanitizeProgress({ boards: ["foam", "bamboo", "bamboo", "Bad Id!", 7], board: "bamboo", trails: ["foam"], trail: "rainbow" })!;
    assert.deepStrictEqual(out.boards, ["foam", "bamboo"]);
    assert.strictEqual(out.board, "bamboo");
    assert.deepStrictEqual(out.trails, ["foam"]);
    assert.strictEqual(out.trail, undefined, "an unowned trail is not equipped");
    assert.strictEqual(sanitizeProgress({ trail: "aqua" })!.trail, "aqua");
  });

  it("keeps well-formed pets and caps the equipped ones at the slots", () => {
    const out = sanitizeProgress({
      petSlots: 2,
      pets: [
        { id: 1, kind: "chick", equipped: true },
        { id: 2.5, kind: "crab", equipped: true },
        { id: 3, kind: "Bad Id!" },
        { id: 4, kind: "shark", equipped: true },
        { id: 5, kind: "frog", equipped: true },
        "x",
      ],
      petsSeen: ["chick", "chick", "Bad Id!", "shark"],
    })!;
    assert.deepStrictEqual(out.pets, [
      { id: 1, kind: "chick", equipped: true },
      { id: 4, kind: "shark", equipped: true },
      { id: 5, kind: "frog", equipped: false },
    ]);
    assert.deepStrictEqual(out.petsSeen, ["chick", "shark"]);
  });

  it("bounds swells, eggs, potions and the claim lists", () => {
    const out = sanitizeProgress({
      swells: [3, -1, "x", 2.9],
      eggs: { "Shell Egg": 2.9, "Bad<Egg>": 1, "Kelp Egg": 0 },
      potions: [{ id: 1, type: "wave", mult: 5000, minutes: 10 }, { id: 2, type: "Bad Id!", mult: 2, minutes: 10 }, { id: 3, type: "luck", mult: 2 }],
      potionOn: { wave: { mult: 2, until: Date.now() + 5 * EPOCH_AHEAD_MS }, wins: null, "Bad Id!": null },
      playtimeClaimed: [0, 0, 3, 99, "1"],
      nextPetId: 0,
    })!;
    assert.deepStrictEqual(out.swells, [3, 0, 0, 2]);
    assert.deepStrictEqual(out.eggs, { "Shell Egg": 2 });
    assert.deepStrictEqual(out.potions, [{ id: 1, type: "wave", mult: POTION_MULT_MAX, minutes: 10 }]);
    assert.deepStrictEqual(Object.keys(out.potionOn!), ["wave", "wins"]);
    assert.ok(out.potionOn!.wave!.until <= Date.now() + EPOCH_AHEAD_MS);
    assert.strictEqual(out.potionOn!.wins, null);
    assert.deepStrictEqual(out.playtimeClaimed, [0, 3]);
    assert.strictEqual(out.nextPetId, 1);
  });

  it("bounds timers, the daily streak and quests", () => {
    const out = sanitizeProgress({
      boostUntil: { skill: -5, wins: 123 },
      lastGift: "now",
      daily: { day: 3, last: 1000 },
      quests: { since: 5, progress: { play: 3.5, "Bad Id!": 1, surf: "x" }, claimed: ["play", "play", "Bad Id!"], bonus: true },
    })!;
    assert.deepStrictEqual(out.boostUntil, { skill: 0, wins: 123 });
    assert.strictEqual(out.lastGift, undefined);
    assert.deepStrictEqual(out.daily, { day: 3, last: 1000 });
    assert.deepStrictEqual(out.quests, { since: 5, progress: { play: 3.5 }, claimed: ["play"], bonus: true });
    assert.strictEqual(sanitizeProgress({ quests: "x", daily: { day: "a" } })!.quests, undefined);
  });

  it("bounds the tutorial step", () => {
    assert.strictEqual(sanitizeProgress({ tutorialStep: 3.6 })!.tutorialStep, 3);
    assert.strictEqual(sanitizeProgress({ tutorialStep: -2 })!.tutorialStep, 0);
    assert.strictEqual(sanitizeProgress({ tutorialStep: 1e9 })!.tutorialStep, TUTORIAL_STEP_MAX);
    assert.strictEqual(sanitizeProgress({ tutorialStep: "2" })!.tutorialStep, undefined);
  });
});
