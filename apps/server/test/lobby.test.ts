import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ROOM_CODE_ALPHABET, type JoinedPayload } from "@sam-kong/protocol";
import { errCode, next, ok, sleep, startTestServer, type Client, type TestServer } from "./helpers.js";

let t: TestServer;
beforeEach(async () => {
  t = await startTestServer();
});
afterEach(async () => {
  await t.stop();
});

async function createRoom(name = "Host", extra: Record<string, unknown> = {}): Promise<{ c: Client; joined: JoinedPayload }> {
  const c = await t.client();
  const joined = ok(await c.emitWithAck("create_room", { displayName: name, avatar: "tiger", ...extra }));
  return { c, joined };
}

async function joinRoom(code: string, name: string): Promise<{ c: Client; joined: JoinedPayload }> {
  const c = await t.client();
  const joined = ok(await c.emitWithAck("join_room", { roomCode: code, displayName: name, avatar: "cat" }));
  return { c, joined };
}

describe("create room (FR-02, AC-01)", () => {
  it("creates a room with a 6-character code, invite link and default settings", async () => {
    const { joined } = await createRoom("Mint");
    const { room, session, inviteUrl } = joined;
    expect(room.roomCode).toMatch(new RegExp(`^[${ROOM_CODE_ALPHABET}]{6}$`));
    expect(inviteUrl).toBe(`https://play.example/join/${room.roomCode}`);
    expect(room.roomName).toBe("ห้องของ Mint");
    expect(room.settings).toEqual({
      maxPlayers: 4, totalRounds: 10, arrangementTimeLimit: 120, enableScoopBonus: true, enableRoyaltyBonus: false,
    });
    expect(room.gameState).toBe("LOBBY");
    expect(room.players).toHaveLength(1);
    expect(room.players[0]).toMatchObject({ playerId: session.playerId, isHost: true, playerState: "NOT_READY" });
    expect(session.sessionToken.length).toBeGreaterThanOrEqual(40);
  });

  it("never puts session tokens in the public room", async () => {
    const { joined } = await createRoom();
    expect(JSON.stringify(joined.room)).not.toContain(joined.session.sessionToken);
  });

  it("accepts custom settings and a room name", async () => {
    const { joined } = await createRoom("A", {
      roomName: "  ก๊วน   วันศุกร์ ",
      settings: { maxPlayers: 2, totalRounds: null, arrangementTimeLimit: 60, enableRoyaltyBonus: true },
    });
    expect(joined.room.roomName).toBe("ก๊วน วันศุกร์");
    expect(joined.room.settings).toMatchObject({ maxPlayers: 2, totalRounds: null, arrangementTimeLimit: 60, enableRoyaltyBonus: true });
  });

  it.each([
    [{ displayName: "", avatar: "tiger" }, "INVALID_NICKNAME"],
    [{ displayName: "​ ‮", avatar: "tiger" }, "INVALID_NICKNAME"],
    [{ displayName: "a".repeat(17), avatar: "tiger" }, "INVALID_NICKNAME"],
    [{ displayName: "A", avatar: "unicorn" }, "INVALID_AVATAR"],
    [{ displayName: "A", avatar: "tiger", settings: { maxPlayers: 5 } }, "INVALID_SETTINGS"],
    [{ displayName: "A", avatar: "tiger", settings: { arrangementTimeLimit: 30 } }, "INVALID_SETTINGS"],
    [{ displayName: "A", avatar: "tiger", roomName: "x".repeat(31) }, "INVALID_ROOM_NAME"],
    [{ displayName: 42, avatar: "tiger" }, "INVALID_PAYLOAD"],
  ])("rejects %j with %s", async (payload, code) => {
    const c = await t.client();
    expect(errCode(await c.emitWithAck("create_room", payload as never))).toBe(code);
  });

  it("counts Thai names by visible characters", async () => {
    const c = await t.client();
    // 16 visible characters including tone marks.
    const res = await c.emitWithAck("create_room", { displayName: "น้ำหนึ่งน้ำสองน้ำ", avatar: "tiger" });
    expect(res.ok).toBe(true);
  });

  it("refuses a second room from the same socket", async () => {
    const { c } = await createRoom();
    expect(errCode(await c.emitWithAck("create_room", { displayName: "B", avatar: "fox" }))).toBe("ALREADY_IN_ROOM");
  });
});

describe("join room (FR-03, AC-01)", () => {
  it("lets up to 4 players join and refuses the 5th", async () => {
    const { joined } = await createRoom("P1");
    const code = joined.room.roomCode;
    await joinRoom(code, "P2");
    await joinRoom(code, "P3");
    const { joined: j4 } = await joinRoom(code, "P4");
    expect(j4.room.players.map((p) => p.displayName)).toEqual(["P1", "P2", "P3", "P4"]);
    const c5 = await t.client();
    expect(errCode(await c5.emitWithAck("join_room", { roomCode: code, displayName: "P5", avatar: "owl" }))).toBe("ROOM_FULL");
  });

  it("respects a smaller max players setting", async () => {
    const { joined } = await createRoom("P1", { settings: { maxPlayers: 2 } });
    await joinRoom(joined.room.roomCode, "P2");
    const c3 = await t.client();
    const res = await c3.emitWithAck("join_room", { roomCode: joined.room.roomCode, displayName: "P3", avatar: "owl" });
    expect(errCode(res)).toBe("ROOM_FULL");
  });

  it("accepts a lowercase code with spaces", async () => {
    const { joined } = await createRoom();
    const c = await t.client();
    const res = await c.emitWithAck("join_room", { roomCode: ` ${joined.room.roomCode.toLowerCase()} `, displayName: "B", avatar: "owl" });
    expect(res.ok).toBe(true);
  });

  it("rejects unknown codes and duplicate nicknames", async () => {
    const { joined } = await createRoom("Mint");
    const c = await t.client();
    expect(errCode(await c.emitWithAck("join_room", { roomCode: "ZZZZZZ", displayName: "B", avatar: "owl" }))).toBe("ROOM_NOT_FOUND");
    expect(errCode(await c.emitWithAck("join_room", { roomCode: "abc", displayName: "B", avatar: "owl" }))).toBe("ROOM_NOT_FOUND");
    expect(errCode(await c.emitWithAck("join_room", { roomCode: joined.room.roomCode, displayName: " MINT ", avatar: "owl" }))).toBe("NICKNAME_TAKEN");
  });

  it("tells everyone in the lobby in real time (FR-04)", async () => {
    const { c: host, joined } = await createRoom("Host");
    const joinedEvt = next(host, "player_joined");
    const updated = next(host, "room_updated", (r) => r.players.length === 2);
    await joinRoom(joined.room.roomCode, "Guest");
    expect((await joinedEvt).player).toMatchObject({ displayName: "Guest", isHost: false, connectionStatus: "ONLINE" });
    expect((await updated).players).toHaveLength(2);
  });
});

describe("lobby actions (FR-04, AC-01)", () => {
  it("tracks Ready and computes canStart", async () => {
    const { c: host, joined } = await createRoom("Host");
    const { c: g1 } = await joinRoom(joined.room.roomCode, "G1");
    const { c: g2 } = await joinRoom(joined.room.roomCode, "G2");
    ok(await g1.emitWithAck("player_ready", { ready: true }));
    const almost = await next(host, "room_updated", () => true, 500).catch(() => null);
    expect(almost?.canStart ?? false).toBe(false);
    const ready = next(host, "room_updated", (r) => r.canStart);
    ok(await g2.emitWithAck("player_ready", { ready: true }));
    expect((await ready).players.filter((p) => p.playerState === "READY")).toHaveLength(2);
  });

  it("only the host can change settings or kick", async () => {
    const { c: host, joined } = await createRoom("Host");
    const { c: guest, joined: gj } = await joinRoom(joined.room.roomCode, "Guest");
    expect(errCode(await guest.emitWithAck("update_room_settings", { settings: { totalRounds: 5 } }))).toBe("NOT_HOST");
    expect(errCode(await guest.emitWithAck("kick_player", { playerId: joined.session.playerId }))).toBe("NOT_HOST");
    expect(errCode(await host.emitWithAck("kick_player", { playerId: joined.session.playerId }))).toBe("CANNOT_KICK_SELF");
    expect(errCode(await host.emitWithAck("kick_player", { playerId: "p_nobody" }))).toBe("PLAYER_NOT_FOUND");
    void gj;
  });

  it("changing settings clears Ready", async () => {
    const { c: host, joined } = await createRoom("Host");
    const { c: guest } = await joinRoom(joined.room.roomCode, "Guest");
    ok(await guest.emitWithAck("player_ready", { ready: true }));
    const room = ok(await host.emitWithAck("update_room_settings", { roomName: "ใหม่", settings: { totalRounds: 20 } }));
    expect(room.roomName).toBe("ใหม่");
    expect(room.settings.totalRounds).toBe(20);
    expect(room.players.find((p) => !p.isHost)?.playerState).toBe("NOT_READY");
  });

  it("won't lower max players below the current count", async () => {
    const { c: host, joined } = await createRoom("Host");
    await joinRoom(joined.room.roomCode, "G1");
    await joinRoom(joined.room.roomCode, "G2");
    expect(errCode(await host.emitWithAck("update_room_settings", { settings: { maxPlayers: 2 } }))).toBe("INVALID_SETTINGS");
  });

  it("kicks a player: they are told, removed, and their session stops working", async () => {
    const { c: host, joined } = await createRoom("Host");
    const { c: guest, joined: gj } = await joinRoom(joined.room.roomCode, "Guest");
    const kicked = next(guest, "player_left", (p) => p.reason === "kicked");
    const updated = next(host, "room_updated", (r) => r.players.length === 1);
    ok(await host.emitWithAck("kick_player", { playerId: gj.session.playerId }));
    expect((await kicked).playerId).toBe(gj.session.playerId);
    await updated;
    expect(errCode(await guest.emitWithAck("player_ready", { ready: true }))).toBe("NOT_IN_ROOM");
    const other = await t.client();
    expect(errCode(await other.emitWithAck("reconnect_player", { sessionToken: gj.session.sessionToken }))).toBe("INVALID_SESSION");
  });

  it("leaving moves host to the next player; the last one out deletes the room", async () => {
    const { c: host, joined } = await createRoom("Host");
    const { c: guest, joined: gj } = await joinRoom(joined.room.roomCode, "Guest");
    const updated = next(guest, "room_updated", (r) => r.hostPlayerId === gj.session.playerId);
    ok(await host.emitWithAck("leave_room", {}));
    expect((await updated).players).toHaveLength(1);
    ok(await guest.emitWithAck("leave_room", {}));
    expect(t.server.store.hasRoom(joined.room.roomCode)).toBe(false);
  });

  it("rejects room actions from a socket that never joined", async () => {
    const c = await t.client();
    expect(errCode(await c.emitWithAck("player_ready", { ready: true }))).toBe("NOT_IN_ROOM");
    expect(errCode(await c.emitWithAck("player_ready", { ready: "yes" } as never))).toBe("INVALID_PAYLOAD");
  });
});

describe("sessions and reconnect (FR-16, AC-07)", () => {
  it("restores the same player after a disconnect, without duplicates", async () => {
    const { c: host, joined } = await createRoom("Host");
    const { c: guest, joined: gj } = await joinRoom(joined.room.roomCode, "Guest");
    ok(await guest.emitWithAck("player_ready", { ready: true }));

    const offline = next(host, "player_status_updated", (p) => p.playerId === gj.session.playerId && p.connectionStatus === "OFFLINE");
    guest.disconnect();
    expect((await offline).playerState).toBe("READY"); // connection status never overwrites player state

    const again = await t.client();
    const online = next(host, "room_updated", (r) => r.players.every((p) => p.connectionStatus === "ONLINE"));
    const restored = ok(await again.emitWithAck("reconnect_player", { sessionToken: gj.session.sessionToken }));
    expect(restored.session.playerId).toBe(gj.session.playerId);
    expect(restored.room.players).toHaveLength(2);
    expect((await online).players.find((p) => p.playerId === gj.session.playerId)?.playerState).toBe("READY");
  });

  it("newest tab wins: the old socket is told and disconnected", async () => {
    const { joined } = await createRoom("Host");
    const { c: tab1, joined: gj } = await joinRoom(joined.room.roomCode, "Guest");
    const replaced = next(tab1, "error", (e) => e.code === "SESSION_REPLACED");
    const tab2 = await t.client();
    const restored = ok(await tab2.emitWithAck("reconnect_player", { sessionToken: gj.session.sessionToken }));
    await replaced;
    await sleep(50);
    expect(tab1.connected).toBe(false);
    expect(restored.room.players).toHaveLength(2);
    ok(await tab2.emitWithAck("player_ready", { ready: true }));
  });

  it("rejects an unknown session token", async () => {
    const c = await t.client();
    expect(errCode(await c.emitWithAck("reconnect_player", { sessionToken: "nope" }))).toBe("INVALID_SESSION");
  });

  it("moves host after the host has been offline past the grace period", async () => {
    const { c: host, joined } = await createRoom("Host");
    const { c: guest, joined: gj } = await joinRoom(joined.room.roomCode, "Guest");
    const transferred = next(guest, "room_updated", (r) => r.hostPlayerId === gj.session.playerId, 2000);
    host.disconnect();
    const room = await transferred;
    expect(room.players.find((p) => p.isHost)?.displayName).toBe("Guest");

    // The old host comes back as a regular player.
    const back = await t.client();
    const restored = ok(await back.emitWithAck("reconnect_player", { sessionToken: joined.session.sessionToken }));
    expect(restored.room.hostPlayerId).toBe(gj.session.playerId);
  });

  it("keeps host if they come back within the grace period", async () => {
    const { c: host, joined } = await createRoom("Host");
    await joinRoom(joined.room.roomCode, "Guest");
    host.disconnect();
    await sleep(50);
    const back = await t.client();
    ok(await back.emitWithAck("reconnect_player", { sessionToken: joined.session.sessionToken }));
    await sleep(300);
    expect(t.server.store.getRoom(joined.room.roomCode)?.hostPlayerId).toBe(joined.session.playerId);
  });

  it("expires a room after nobody has been online for the idle TTL", async () => {
    const { c: host, joined } = await createRoom("Host");
    host.disconnect();
    await sleep(100);
    expect(t.server.store.hasRoom(joined.room.roomCode)).toBe(true);
    await sleep(400);
    expect(t.server.store.hasRoom(joined.room.roomCode)).toBe(false);
  });
});

describe("rate limiting", () => {
  it("limits room creation per IP", async () => {
    await t.stop();
    t = await startTestServer({
      rateLimits: {
        reactions: { capacity: 4, refillPerMinute: 30 },
        createRoom: { capacity: 2, refillPerMinute: 1 },
        joinRoom: { capacity: 100, refillPerMinute: 100 },
        socketEvents: { capacity: 500, refillPerMinute: 500 },
      },
    });
    const codes: (string | undefined)[] = [];
    for (let i = 0; i < 3; i++) {
      const c = await t.client();
      codes.push(errCode(await c.emitWithAck("create_room", { displayName: `H${i}`, avatar: "tiger" })));
    }
    expect(codes).toEqual([undefined, undefined, "RATE_LIMITED"]);
  });
});
