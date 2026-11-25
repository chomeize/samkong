import { afterEach, describe, expect, it } from "vitest";
import { autoArrange, evaluateArrangement, parseCard } from "@sam-kong/engine";
import type { ArrangementDTO, PrivateHand, RoomSettings } from "@sam-kong/protocol";
import { errCode, next, ok, sleep, startTestServer, type Client, type TestServer } from "./helpers.js";

let t: TestServer;
afterEach(async () => {
  await t?.stop();
});

interface Seat {
  c: Client;
  playerId: string;
  token: string;
  hand: PrivateHand;
}

const toDTO = (a: { front: { id: string }[]; middle: { id: string }[]; back: { id: string }[] }): ArrangementDTO => ({
  front: a.front.map((c) => c.id),
  middle: a.middle.map((c) => c.id),
  back: a.back.map((c) => c.id),
});
const validFor = (hand: PrivateHand) => toDTO(autoArrange(hand.dealtCards.map(parseCard)));
const isFoul = (d: ArrangementDTO) =>
  evaluateArrangement({ front: d.front.map(parseCard), middle: d.middle.map(parseCard), back: d.back.map(parseCard) }).isFoul;

async function startGame(n: number, settings: Partial<RoomSettings>): Promise<{ seats: Seat[]; roomCode: string }> {
  t = await startTestServer();
  const host = await t.client();
  const created = ok(await host.emitWithAck("create_room", { displayName: "P0", avatar: "tiger", settings }));
  const raw: Array<Omit<Seat, "hand">> = [{ c: host, playerId: created.session.playerId, token: created.session.sessionToken }];
  for (let i = 1; i < n; i++) {
    const c = await t.client();
    const j = ok(await c.emitWithAck("join_room", { roomCode: created.room.roomCode, displayName: `P${i}`, avatar: "cat" }));
    ok(await c.emitWithAck("player_ready", { ready: true }));
    raw.push({ c, playerId: j.session.playerId, token: j.session.sessionToken });
  }
  const dealt = raw.map((s) => next(s.c, "cards_dealt"));
  ok(await host.emitWithAck("start_game", {}));
  const hands = await Promise.all(dealt);
  return { seats: raw.map((s, i) => ({ ...s, hand: hands[i]! })), roomCode: created.room.roomCode };
}

describe("arrangement timer (FR-10, AC-06)", () => {
  it("sets a shared deadline and clears it at the reveal", async () => {
    t = await startTestServer();
    const host = await t.client();
    const created = ok(await host.emitWithAck("create_room", { displayName: "H", avatar: "tiger", settings: { arrangementTimeLimit: 60 } }));
    const g = await t.client();
    ok(await g.emitWithAck("join_room", { roomCode: created.room.roomCode, displayName: "G", avatar: "cat" }));
    ok(await g.emitWithAck("player_ready", { ready: true }));
    const timer = next(g, "timer_updated", (p) => p.deadlineAt !== null);
    const roomWithDeadline = next(g, "room_updated", (r) => r.gameState === "ARRANGING");
    ok(await host.emitWithAck("start_game", {}));
    const tp = await timer;
    expect(tp.deadlineAt! - tp.serverNow).toBeGreaterThan(250);
    expect(tp.deadlineAt! - tp.serverNow).toBeLessThanOrEqual(300);
    expect((await roomWithDeadline).deadlineAt).toBe(tp.deadlineAt);
    const cleared = next(g, "timer_updated", (p) => p.deadlineAt === null, 2000);
    await cleared;
  });

  it("auto-submits unconfirmed players at the deadline and reveals", async () => {
    const { seats } = await startGame(3, { arrangementTimeLimit: 60 });
    const [a, b, c] = seats;
    ok(await a!.c.emitWithAck("confirm_hand", { arrangement: validFor(a!.hand), acceptFoul: false }));
    // b leaves a partial draft; c has a complete valid draft but never confirms.
    ok(await b!.c.emitWithAck("update_arrangement", { front: b!.hand.dealtCards.slice(0, 2), middle: [], back: [] }));
    const cDraft = validFor(c!.hand);
    ok(await c!.c.emitWithAck("update_arrangement", cDraft));

    const autoConfirms: string[] = [];
    a!.c.on("hand_confirmed", (p) => p.auto && autoConfirms.push(p.playerId));
    const bOwn = next(b!.c, "arrangement_updated", (h) => h.isConfirmed && h.isAutoSubmitted);
    const result = next(a!.c, "round_result", () => true, 2000);

    const r = await result;
    expect(autoConfirms.sort()).toEqual([b!.playerId, c!.playerId].sort());
    const bHand = r.hands.find((h) => h.playerId === b!.playerId)!;
    const cHand = r.hands.find((h) => h.playerId === c!.playerId)!;
    expect(bHand.isAutoSubmitted).toBe(true);
    expect(bHand.isFoul).toBe(false); // incomplete draft → auto arranged, never a foul
    expect(cHand.arrangement).toEqual(cDraft); // complete valid draft is kept
    expect(r.hands.find((h) => h.playerId === a!.playerId)!.isAutoSubmitted).toBe(false);
    expect((await bOwn).arrangement.front).toHaveLength(3);
  });

  it("a fouled draft is replaced by a valid auto arrangement at timeout", async () => {
    const { seats } = await startGame(2, { arrangementTimeLimit: 60 });
    const [a, b] = seats;
    const d = b!.hand.dealtCards;
    // Find a fouled full split by trying rotations of the dealt order.
    let foul: ArrangementDTO | null = null;
    for (let k = 0; k < 13 && !foul; k++) {
      const s = [...d.slice(k), ...d.slice(0, k)];
      const cand = { front: s.slice(0, 3), middle: s.slice(3, 8), back: s.slice(8) };
      if (isFoul(cand)) foul = cand;
    }
    if (foul) ok(await b!.c.emitWithAck("update_arrangement", foul));
    ok(await a!.c.emitWithAck("confirm_hand", { arrangement: validFor(a!.hand), acceptFoul: false }));
    const r = await next(a!.c, "round_result", () => true, 2000);
    expect(r.hands.find((h) => h.playerId === b!.playerId)!.isFoul).toBe(false);
  });

  it("a confirm just before the deadline still counts as the player's own", async () => {
    const { seats, roomCode } = await startGame(2, { arrangementTimeLimit: 60 });
    const [a, b] = seats;
    ok(await a!.c.emitWithAck("confirm_hand", { arrangement: validFor(a!.hand), acceptFoul: false }));
    // Confirm ~10ms after the shown deadline: still inside the server's grace window.
    // (Compute the arrangement first: autoArrange takes ~60ms of CPU.)
    const arrangement = validFor(b!.hand);
    const deadlineAt = t.server.store.getRoom(roomCode)!.deadlineAt!;
    await sleep(Math.max(0, deadlineAt - Date.now() + 10));
    const result = next(a!.c, "round_result", () => true, 2000);
    ok(await b!.c.emitWithAck("confirm_hand", { arrangement, acceptFoul: false }));
    const r = await result;
    expect(r.hands.every((h) => !h.isAutoSubmitted)).toBe(true);
  });

  it("an Unlimited room never times out on its own", async () => {
    const { seats, roomCode } = await startGame(2, { arrangementTimeLimit: null });
    const [a] = seats;
    ok(await a!.c.emitWithAck("confirm_hand", { arrangement: validFor(a!.hand), acceptFoul: false }));
    await sleep(400);
    const room = t.server.store.getRoom(roomCode)!;
    expect(room.gameState).toBe("WAITING_FOR_CONFIRMATION");
    expect(room.deadlineAt).toBeNull();
  });
});

describe("offline players with Unlimited time (FR-16)", () => {
  it("auto-submits a player who stays offline past the grace period", async () => {
    const { seats } = await startGame(2, { arrangementTimeLimit: null });
    const [a, b] = seats;
    ok(await a!.c.emitWithAck("confirm_hand", { arrangement: validFor(a!.hand), acceptFoul: false }));
    const result = next(a!.c, "round_result", () => true, 2000);
    b!.c.disconnect();
    const r = await result;
    expect(r.hands.find((h) => h.playerId === b!.playerId)!.isAutoSubmitted).toBe(true);
  });

  it("does not auto-submit if the player comes back in time", async () => {
    const { seats, roomCode } = await startGame(2, { arrangementTimeLimit: null });
    const [, b] = seats;
    b!.c.disconnect();
    await sleep(80);
    const back = await t.client();
    const restored = ok(await back.emitWithAck("reconnect_player", { sessionToken: b!.token }));
    expect(restored.privateHand?.isConfirmed).toBe(false);
    await sleep(350);
    expect(t.server.store.getRoom(roomCode)!.pendingPlayers()).toContain(b!.playerId);
  });
});

describe("reactions (FR-17)", () => {
  it("broadcasts allowed emoji and quick messages to the room", async () => {
    const { seats } = await startGame(2, { arrangementTimeLimit: null });
    const [a, b] = seats;
    const got = next(b!.c, "reaction_received", (r) => r.kind === "emoji");
    ok(await a!.c.emitWithAck("send_reaction", { kind: "emoji", value: "🔥" }));
    expect(await got).toMatchObject({ playerId: a!.playerId, kind: "emoji", value: "🔥" });
    const quick = next(b!.c, "reaction_received", (r) => r.kind === "quick");
    ok(await a!.c.emitWithAck("send_reaction", { kind: "quick", value: "nice" }));
    expect((await quick).value).toBe("nice");
  });

  it("rejects unknown reactions and free text", async () => {
    const { seats } = await startGame(2, { arrangementTimeLimit: null });
    const [a] = seats;
    expect(errCode(await a!.c.emitWithAck("send_reaction", { kind: "emoji", value: "💩" }))).toBe("INVALID_PAYLOAD");
    expect(errCode(await a!.c.emitWithAck("send_reaction", { kind: "quick", value: "<script>" }))).toBe("INVALID_PAYLOAD");
    const stranger = await t.client();
    expect(errCode(await stranger.emitWithAck("send_reaction", { kind: "emoji", value: "👍" }))).toBe("NOT_IN_ROOM");
  });

  it("rate-limits reaction spam per player", async () => {
    const { seats } = await startGame(2, { arrangementTimeLimit: null });
    const [a] = seats;
    const codes: (string | undefined)[] = [];
    for (let i = 0; i < 6; i++) codes.push(errCode(await a!.c.emitWithAck("send_reaction", { kind: "emoji", value: "👍" })));
    expect(codes.slice(0, 4).every((c) => c === undefined)).toBe(true);
    expect(codes.slice(4)).toContain("RATE_LIMITED");
  });
});
