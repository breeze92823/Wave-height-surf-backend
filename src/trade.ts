import { ID_PATTERN, PET_ID_MAX, TRADE_INVITE_MS, TRADE_PETS_MAX } from "./constants.js";

// Pet trading between two players in the same room. Neither Bloxity nor its hosting has a trade
// API, so the room brokers it: who may trade with whom, both offers, and the moment both accept.
// Progress is client-authoritative (see WorldRoom), so the server never edits a save: on `tradeDone`
// each client removes what it gave, adds what it got, and saves at once.
//
// Client -> server: `tradeRequest` { to } (a sessionId), `tradeAnswer` { from, accept },
// `tradeOffer` { pets: [{ id, kind }] }, `tradeAccept` { rev }, `tradeCancel`.
// Server -> client: `tradeInvite` { from, name }, `tradeDeclined` { to, reason }, `tradeOpen`
// { partner, name }, `tradeUpdate` { rev, mine, theirs, myAccept, theirAccept }, `tradeDone`
// { give: [ids], get: [{ kind }] }, `tradeClosed` { reason }.
// Any change to either offer bumps `rev` and clears both accepts, and an accept counts only for
// the rev it was sent against, so nobody can swap an offer out from under a click.

export interface TradePet {
  id: number;
  kind: string;
}
interface Side {
  sid: string;
  offer: TradePet[];
  accepted: boolean;
}
interface Trade {
  a: Side;
  b: Side;
  rev: number;
}

// An offer: whole non-negative ids (unique), slug kinds, at most TRADE_PETS_MAX. null = malformed.
export function sanitizeOffer(raw: unknown): TradePet[] | null {
  if (!Array.isArray(raw) || raw.length > TRADE_PETS_MAX) return null;
  const out: TradePet[] = [];
  const ids = new Set<number>();
  for (const p of raw) {
    const id = (p as { id?: unknown })?.id;
    const kind = (p as { kind?: unknown })?.kind;
    if (!Number.isInteger(id) || (id as number) < 0 || (id as number) > PET_ID_MAX) return null;
    if (typeof kind !== "string" || !ID_PATTERN.test(kind) || ids.has(id as number)) return null;
    ids.add(id as number);
    out.push({ id: id as number, kind });
  }
  return out;
}

export class Trades {
  private invites = new Map<string, { to: string; at: number }>(); // sender sessionId -> its one invite
  private trades = new Map<string, Trade>(); // both sessionIds -> their trade

  constructor(
    private send: (sid: string, type: string, msg: unknown) => void,
    private canTrade: (sid: string) => boolean, // signed in and loaded
    private nameOf: (sid: string) => string,
    private now = () => Date.now(),
  ) {}

  request(from: string, to: unknown) {
    if (typeof to !== "string") return;
    const reason = to === from || !this.canTrade(to) ? "unavailable" : !this.canTrade(from) ? "signin" : this.trades.has(from) || this.trades.has(to) ? "busy" : "";
    if (reason) return this.send(from, "tradeDeclined", { to, reason });
    // Both asked each other: open straight away.
    if (this.live(to)?.to === from) return this.open(to, from);
    this.invites.set(from, { to, at: this.now() });
    this.send(to, "tradeInvite", { from, name: this.nameOf(from) });
  }

  answer(to: string, from: unknown, accept: unknown) {
    if (typeof from !== "string" || this.live(from)?.to !== to) return;
    if (accept !== true) {
      this.invites.delete(from);
      return this.send(from, "tradeDeclined", { to, reason: "declined" });
    }
    if (!this.canTrade(to) || !this.canTrade(from) || this.trades.has(to) || this.trades.has(from)) {
      this.invites.delete(from);
      return this.send(from, "tradeDeclined", { to, reason: "busy" });
    }
    this.open(from, to);
  }

  offer(sid: string, raw: unknown) {
    const t = this.trades.get(sid);
    const pets = sanitizeOffer((raw as { pets?: unknown })?.pets);
    if (!t || !pets) return;
    this.side(t, sid).offer = pets;
    t.a.accepted = t.b.accepted = false;
    t.rev++;
    this.update(t);
  }

  accept(sid: string, rev: unknown) {
    const t = this.trades.get(sid);
    if (!t || rev !== t.rev) return; // stale: the offers changed since this click
    if (!t.a.offer.length && !t.b.offer.length) return;
    this.side(t, sid).accepted = true;
    if (!(t.a.accepted && t.b.accepted)) return this.update(t);
    this.end(t);
    this.send(t.a.sid, "tradeDone", { give: t.a.offer.map((p) => p.id), get: t.b.offer.map(({ kind }) => ({ kind })) });
    this.send(t.b.sid, "tradeDone", { give: t.b.offer.map((p) => p.id), get: t.a.offer.map(({ kind }) => ({ kind })) });
  }

  cancel(sid: string, reason = "cancelled") {
    const t = this.trades.get(sid);
    if (!t) return;
    this.end(t);
    const other = this.other(t, sid).sid;
    this.send(other, "tradeClosed", { reason });
    this.send(sid, "tradeClosed", { reason: reason === "left" ? "left" : "cancelled" });
  }

  // The player left (or changed identity): close their trade and drop their invites.
  leave(sid: string) {
    this.cancel(sid, "left");
    this.invites.delete(sid);
    for (const [from, inv] of this.invites) if (inv.to === sid) this.invites.delete(from);
  }

  private live(from: string) {
    const inv = this.invites.get(from);
    if (inv && this.now() - inv.at > TRADE_INVITE_MS) {
      this.invites.delete(from);
      return undefined;
    }
    return inv;
  }

  private open(a: string, b: string) {
    this.invites.delete(a);
    this.invites.delete(b);
    const t: Trade = { a: { sid: a, offer: [], accepted: false }, b: { sid: b, offer: [], accepted: false }, rev: 0 };
    this.trades.set(a, t);
    this.trades.set(b, t);
    this.send(a, "tradeOpen", { partner: b, name: this.nameOf(b) });
    this.send(b, "tradeOpen", { partner: a, name: this.nameOf(a) });
    this.update(t);
  }

  private end(t: Trade) {
    this.trades.delete(t.a.sid);
    this.trades.delete(t.b.sid);
  }

  private update(t: Trade) {
    for (const [me, them] of [[t.a, t.b], [t.b, t.a]]) {
      this.send(me.sid, "tradeUpdate", { rev: t.rev, mine: me.offer, theirs: them.offer, myAccept: me.accepted, theirAccept: them.accepted });
    }
  }

  private side = (t: Trade, sid: string) => (t.a.sid === sid ? t.a : t.b);
  private other = (t: Trade, sid: string) => (t.a.sid === sid ? t.b : t.a);
}
