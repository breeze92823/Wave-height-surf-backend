import assert from "assert";
import type { ColyseusTestServer } from "@colyseus/testing";

import type appConfig from "../src/app.config.js";
import { WorldState } from "../src/rooms/schema/WorldState.js";
import { TRADE_PETS_MAX } from "../src/constants.js";
import { sanitizeOffer } from "../src/trade.js";
import { sleep } from "./fakePlayers.js";
import { testServer } from "./server.js";

// Every message a test client got, by type (latest last).
function inbox(c: any) {
  const got: Record<string, any[]> = {};
  for (const t of ["tradeInvite", "tradeDeclined", "tradeOpen", "tradeUpdate", "tradeDone", "tradeClosed"]) {
    got[t] = [];
    c.onMessage(t, (m: any) => got[t].push(m));
  }
  return got;
}
const last = (a: any[]) => a[a.length - 1];

describe("trade", () => {
  let colyseus: ColyseusTestServer<typeof appConfig>;
  before(async () => (colyseus = await testServer()));
  beforeEach(async () => await colyseus.cleanup());

  async function pair() {
    const room = await colyseus.createRoom<WorldState>("world", {});
    const a = await colyseus.connectTo(room, { userId: "ua", username: "Ann" });
    const b = await colyseus.connectTo(room, { userId: "ub", username: "Bob" });
    const ga = inbox(a);
    const gb = inbox(b);
    await sleep(80);
    return { room, a, b, ga, gb };
  }
  async function open() {
    const p = await pair();
    p.a.send("tradeRequest", { to: p.b.sessionId });
    await sleep(60);
    p.b.send("tradeAnswer", { from: p.a.sessionId, accept: true });
    await sleep(60);
    return p;
  }

  it("invites, opens, swaps offers and finishes when both accept the same offers", async () => {
    const { a, b, ga, gb } = await open();
    assert.deepStrictEqual(gb.tradeInvite[0], { from: a.sessionId, name: "Ann" });
    assert.strictEqual(last(ga.tradeOpen).name, "Bob");
    assert.strictEqual(last(gb.tradeOpen).partner, a.sessionId);

    a.send("tradeOffer", { pets: [{ id: 4, kind: "shark" }] });
    b.send("tradeOffer", { pets: [{ id: 9, kind: "crab" }, { id: 10, kind: "frog" }] });
    await sleep(80);
    const u = last(ga.tradeUpdate);
    assert.deepStrictEqual(u.mine, [{ id: 4, kind: "shark" }]);
    assert.strictEqual(u.theirs.length, 2);

    a.send("tradeAccept", { rev: u.rev });
    await sleep(60);
    assert.strictEqual(last(gb.tradeUpdate).theirAccept, true);
    b.send("tradeAccept", { rev: u.rev });
    await sleep(60);
    assert.deepStrictEqual(last(ga.tradeDone), { give: [4], get: [{ kind: "crab" }, { kind: "frog" }] });
    assert.deepStrictEqual(last(gb.tradeDone), { give: [9, 10], get: [{ kind: "shark" }] });
  });

  it("ignores an accept sent against an offer that has since changed", async () => {
    const { a, b, ga, gb } = await open();
    a.send("tradeOffer", { pets: [{ id: 1, kind: "narwhal" }] });
    await sleep(60);
    const rev = last(gb.tradeUpdate).rev;
    b.send("tradeAccept", { rev });
    a.send("tradeOffer", { pets: [{ id: 2, kind: "chick" }] }); // swapped right after
    await sleep(60);
    a.send("tradeAccept", { rev: last(ga.tradeUpdate).rev });
    b.send("tradeAccept", { rev }); // stale
    await sleep(80);
    assert.strictEqual(ga.tradeDone.length + gb.tradeDone.length, 0);
    assert.strictEqual(last(gb.tradeUpdate).myAccept, false, "the swap cleared B's accept");
  });

  it("opens at once when both invite each other, and declines are reported", async () => {
    const { a, b, ga, gb } = await pair();
    b.send("tradeRequest", { to: a.sessionId });
    await sleep(40);
    a.send("tradeAnswer", { from: b.sessionId, accept: false });
    await sleep(60);
    assert.strictEqual(last(gb.tradeDeclined).reason, "declined");

    a.send("tradeRequest", { to: b.sessionId });
    b.send("tradeRequest", { to: a.sessionId });
    await sleep(80);
    assert.strictEqual(ga.tradeOpen.length, 1);
    assert.strictEqual(gb.tradeOpen.length, 1);
  });

  it("closes the trade for the partner when a trader cancels or leaves", async () => {
    const { a, b, ga, gb } = await open();
    a.send("tradeCancel", {});
    await sleep(60);
    assert.strictEqual(last(gb.tradeClosed).reason, "cancelled");
    assert.strictEqual(last(ga.tradeClosed).reason, "cancelled");

    a.send("tradeRequest", { to: b.sessionId });
    await sleep(40);
    b.send("tradeAnswer", { from: a.sessionId, accept: true });
    await sleep(60);
    await a.leave(true);
    await sleep(80);
    assert.strictEqual(last(gb.tradeClosed).reason, "left");
  });

  it("refuses guests, self-trades and players already trading", async () => {
    const { room, a, b, ga } = await open();
    const g = await colyseus.connectTo(room, { userId: "guest-x" });
    const c = await colyseus.connectTo(room, { userId: "uc" });
    const gg = inbox(g);
    const gc = inbox(c);
    await sleep(80);
    g.send("tradeRequest", { to: c.sessionId });
    c.send("tradeRequest", { to: g.sessionId });
    c.send("tradeRequest", { to: c.sessionId });
    await sleep(60);
    assert.strictEqual(gg.tradeDeclined[0].reason, "signin");
    assert.deepStrictEqual(gc.tradeDeclined.map((m: any) => m.reason), ["unavailable", "unavailable"]);
    c.send("tradeRequest", { to: a.sessionId });
    await sleep(60);
    assert.strictEqual(last(gc.tradeDeclined).reason, "busy");
    assert.strictEqual(ga.tradeInvite.length, 0);
    void b;
  });

  it("bounds offers", () => {
    assert.deepStrictEqual(sanitizeOffer([{ id: 3, kind: "seal" }]), [{ id: 3, kind: "seal" }]);
    assert.strictEqual(sanitizeOffer(Array.from({ length: TRADE_PETS_MAX + 1 }, (_, i) => ({ id: i, kind: "crab" }))), null);
    assert.strictEqual(sanitizeOffer([{ id: 1, kind: "crab" }, { id: 1, kind: "frog" }]), null, "duplicate ids");
    assert.strictEqual(sanitizeOffer([{ id: -1, kind: "crab" }]), null);
    assert.strictEqual(sanitizeOffer([{ id: 1, kind: "Bad Id!" }]), null);
    assert.strictEqual(sanitizeOffer("x"), null);
  });
});
