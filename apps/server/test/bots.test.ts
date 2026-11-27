import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { autoArrange, parseCard } from "@sam-kong/engine";
import type { PrivateHand } from "@sam-kong/protocol";
import { errCode, next, ok, sleep, startTestServer, type Client, type TestServer } from "./helpers.js";

let t: TestServer;
beforeEach(async () => {
  t = await startTestServer();
});
afterEach(async () => {
  await t.stop();
});

const validFor = (hand: PrivateHand) => {
  const a = autoArrange(hand.dealtCards.map(parseCard));
  return { front: a.front.map((c) => c.id), middle: a.middle.map((c) => c.id), back: a.back.map((c) => c.id) };
};

async function soloRoom(bots: number, settings = {}): Promise<{ host: Client; code: string }> {
  const host = await t.client();
  const created = ok(await host.emitWithAck("create_room", { displayName: "Me", avatar: "tiger", settings }));
  for (let i = 0; i < bots; i++) ok(await host.emitWithAck("add_bot", {}));
  return { host, code: created.room.roomCode };
}

describe("bot players", () => {
  it("the host seats bots that are ready, named and never host", async () => {
    const { host } = await soloRoom(0);
    const room = ok(await host.emitWithAck("add_bot", {}));
    ok(await host.emitWithAck("add_bot", {}));
    const r = ok(await host.emitWithAck("add_bot", {}));
    expect(r.players).toHaveLength(4);
    const bots = r.players.filter((p) => p.isBot);
    expect(bots).toHaveLength(3);
    expect(bots.every((b) => b.playerState === "READY" && !b.isHost)).toBe(true);
    expect(new Set(bots.map((b) => b.displayName)).size).toBe(3);
    expect(r.canStart).toBe(true);
    expect(room.players[1]!.isBot).toBe(true);
    expect(errCode(await host.emitWithAck("add_bot", {}))).toBe("ROOM_FULL");
  });

  it("only the host can add bots, and only in the lobby", async () => {
    const { host, code } = await soloRoom(0);
    const guest = await t.client();
    ok(await guest.emitWithAck("join_room", { roomCode: code, displayName: "G", avatar: "cat" }));
    expect(errCode(await guest.emitWithAck("add_bot", {}))).toBe("NOT_HOST");
    ok(await host.emitWithAck("add_bot", {}));
    ok(await guest.emitWithAck("player_ready", { ready: true }));
    ok(await host.emitWithAck("start_game", {}));
    expect(errCode(await host.emitWithAck("add_bot", {}))).toBe("INVALID_STATE");
  });

  it("the host can remove a bot", async () => {
    const { host } = await soloRoom(1);
    const r = ok(await host.emitWithAck("add_bot", {}));
    const bot = r.players.find((p) => p.isBot)!;
    const updated = next(host, "room_updated", (room) => room.players.length === 2);
    ok(await host.emitWithAck("kick_player", { playerId: bot.playerId }));
    const after = await updated;
    expect(after.players.filter((p) => p.isBot)).toHaveLength(1);
  });

  it("bots arrange and confirm on their own; a solo round reveals once I confirm", async () => {
    const { host } = await soloRoom(3);
    const dealt = next(host, "cards_dealt");
    ok(await host.emitWithAck("start_game", {}));
    const hand = await dealt;
    // All three bots confirm without any input.
    await next(host, "room_updated", (r) => r.players.filter((p) => p.isBot && p.playerState === "CONFIRMED").length === 3, 3000);
    const result = next(host, "round_result");
    ok(await host.emitWithAck("confirm_hand", { arrangement: validFor(hand), acceptFoul: false }));
    const r = await result;
    expect(r.hands).toHaveLength(4);
    expect(r.hands.filter((h) => h.playerId !== r.hands[0]!.playerId).every((h) => !h.isFoul)).toBe(true);
    expect(Object.values(r.scores).reduce((s, p) => s + p.total, 0)).toBe(0);
  });

  it("bots play again in the next round", async () => {
    const { host } = await soloRoom(1);
    const d1 = next(host, "cards_dealt");
    ok(await host.emitWithAck("start_game", {}));
    const r1 = next(host, "round_result", () => true, 3000);
    ok(await host.emitWithAck("confirm_hand", { arrangement: validFor(await d1), acceptFoul: false }));
    await r1;
    const d2 = next(host, "cards_dealt");
    ok(await host.emitWithAck("next_round", {}));
    const r2 = next(host, "round_result", () => true, 3000);
    ok(await host.emitWithAck("confirm_hand", { arrangement: validFor(await d2), acceptFoul: false }));
    expect((await r2).roundNumber).toBe(2);
  });

  it("a room with only bots left is deleted", async () => {
    const { host, code } = await soloRoom(2);
    ok(await host.emitWithAck("leave_room", {}));
    expect(t.server.store.hasRoom(code)).toBe(false);

    const again = await soloRoom(1);
    ok(await again.host.emitWithAck("start_game", {}));
    ok(await again.host.emitWithAck("leave_room", {}));
    await sleep(50);
    expect(t.server.store.hasRoom(again.code)).toBe(false);
  });

  it("bots don't keep a room alive or become host", async () => {
    const { host, code } = await soloRoom(2);
    host.disconnect();
    await sleep(600); // past the test host-grace (200ms) and idle TTL (300ms)
    expect(t.server.store.hasRoom(code)).toBe(false);
  });
});
