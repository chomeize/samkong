import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { errCode, next, ok, sleep, startTestServer, type Client, type TestServer } from "./helpers.js";

const KEY = "owner-secret-123";
let t: TestServer;
beforeEach(async () => {
  t = await startTestServer({ ownerKey: KEY, joinApproval: true });
});
afterEach(async () => {
  await t.stop();
});

async function hostRoom(): Promise<{ host: Client; code: string }> {
  const host = await t.client();
  const created = ok(await host.emitWithAck("create_room", { displayName: "Owner", avatar: "tiger", ownerKey: KEY }));
  return { host, code: created.room.roomCode };
}

describe("owner-only rooms", () => {
  it("tells clients the owner key is required", async () => {
    const c = await t.client();
    expect(ok(await c.emitWithAck("server_info", {}))).toEqual({ ownerKeyRequired: true, joinApproval: true });
  });

  it("refuses to create a room without the right key", async () => {
    const c = await t.client();
    expect(errCode(await c.emitWithAck("create_room", { displayName: "A", avatar: "tiger" }))).toBe("OWNER_KEY_REQUIRED");
    expect(errCode(await c.emitWithAck("create_room", { displayName: "A", avatar: "tiger", ownerKey: "guess" }))).toBe("OWNER_KEY_INVALID");
    expect(ok(await c.emitWithAck("create_room", { displayName: "A", avatar: "tiger", ownerKey: KEY })).room.roomCode).toHaveLength(6);
  });

  it("checks a key and rate-limits guessing", async () => {
    const c = await t.client();
    ok(await c.emitWithAck("verify_owner_key", { ownerKey: KEY }));
    const codes: (string | undefined)[] = [];
    for (let i = 0; i < 6; i++) codes.push(errCode(await c.emitWithAck("verify_owner_key", { ownerKey: `guess${i}` })));
    expect(codes.slice(0, 4)).toEqual(Array(4).fill("OWNER_KEY_INVALID"));
    expect(codes).toContain("RATE_LIMITED");
  });
});

describe("host approves each player", () => {
  it("blocks direct joins", async () => {
    const { code } = await hostRoom();
    const g = await t.client();
    expect(errCode(await g.emitWithAck("join_room", { roomCode: code, displayName: "G", avatar: "cat" }))).toBe("APPROVAL_REQUIRED");
  });

  it("a request waits until the host allows it, then the guest is in", async () => {
    const { host, code } = await hostRoom();
    const g = await t.client();
    const seen = next(host, "room_updated", (r) => r.joinRequests.length === 1);
    const res = ok(await g.emitWithAck("request_join", { roomCode: code, displayName: "Guest", avatar: "cat" }));
    expect(res).toMatchObject({ status: "pending", roomCode: code });
    const room = await seen;
    expect(room.players).toHaveLength(1); // not a player yet
    expect(room.joinRequests[0]).toMatchObject({ displayName: "Guest", avatar: "cat" });

    // A guest still waiting can't act in the room.
    expect(errCode(await g.emitWithAck("player_ready", { ready: true }))).toBe("NOT_IN_ROOM");

    const approved = next(g, "join_approved");
    ok(await host.emitWithAck("respond_join_request", { requestId: room.joinRequests[0]!.requestId, approve: true }));
    const joined = await approved;
    expect(joined.room.players.map((p) => p.displayName)).toEqual(["Owner", "Guest"]);
    expect(joined.room.joinRequests).toHaveLength(0);
    ok(await g.emitWithAck("player_ready", { ready: true }));
  });

  it("a denied guest is told and never joins", async () => {
    const { host, code } = await hostRoom();
    const g = await t.client();
    const r = ok(await g.emitWithAck("request_join", { roomCode: code, displayName: "Stranger", avatar: "owl" }));
    const denied = next(g, "join_denied");
    ok(await host.emitWithAck("respond_join_request", { requestId: (r as { requestId: string }).requestId, approve: false }));
    expect((await denied).reason).toBe("denied");
    expect(t.server.store.getRoom(code)!.players.size).toBe(1);
  });

  it("only the host can answer requests", async () => {
    const { host, code } = await hostRoom();
    const g1 = await t.client();
    const r1 = ok(await g1.emitWithAck("request_join", { roomCode: code, displayName: "G1", avatar: "cat" })) as { requestId: string };
    const approved = next(g1, "join_approved");
    ok(await host.emitWithAck("respond_join_request", { requestId: r1.requestId, approve: true }));
    await approved;
    const g2 = await t.client();
    const r2 = ok(await g2.emitWithAck("request_join", { roomCode: code, displayName: "G2", avatar: "owl" })) as { requestId: string };
    expect(errCode(await g1.emitWithAck("respond_join_request", { requestId: r2.requestId, approve: true }))).toBe("NOT_HOST");
  });

  it("a request disappears when the guest disconnects or cancels", async () => {
    const { host, code } = await hostRoom();
    const g = await t.client();
    const r = ok(await g.emitWithAck("request_join", { roomCode: code, displayName: "G", avatar: "cat" })) as { requestId: string };
    const gone = next(host, "room_updated", (room) => room.joinRequests.length === 0);
    g.disconnect();
    await gone;
    expect(errCode(await host.emitWithAck("respond_join_request", { requestId: r.requestId, approve: true }))).toBe("REQUEST_NOT_FOUND");

    const g2 = await t.client();
    ok(await g2.emitWithAck("request_join", { roomCode: code, displayName: "G2", avatar: "cat" }));
    ok(await g2.emitWithAck("cancel_join_request", {}));
    await sleep(30);
    expect(t.server.store.getRoom(code)!.joinRequests.size).toBe(0);
  });

  it("rejects a waiting name that's already taken", async () => {
    const { code } = await hostRoom();
    const g1 = await t.client();
    ok(await g1.emitWithAck("request_join", { roomCode: code, displayName: "Same", avatar: "cat" }));
    const g2 = await t.client();
    expect(errCode(await g2.emitWithAck("request_join", { roomCode: code, displayName: "same", avatar: "owl" }))).toBe("NICKNAME_TAKEN");
    expect(errCode(await g2.emitWithAck("request_join", { roomCode: code, displayName: "owner", avatar: "owl" }))).toBe("NICKNAME_TAKEN");
  });

  it("starting the game turns away everyone still waiting", async () => {
    const { host, code } = await hostRoom();
    const g1 = await t.client();
    const r1 = ok(await g1.emitWithAck("request_join", { roomCode: code, displayName: "G1", avatar: "cat" })) as { requestId: string };
    const approved = next(g1, "join_approved");
    ok(await host.emitWithAck("respond_join_request", { requestId: r1.requestId, approve: true }));
    await approved;
    ok(await g1.emitWithAck("player_ready", { ready: true }));
    const late = await t.client();
    ok(await late.emitWithAck("request_join", { roomCode: code, displayName: "Late", avatar: "owl" }));
    const denied = next(late, "join_denied");
    ok(await host.emitWithAck("start_game", {}));
    expect((await denied).reason).toBe("game_started");
  });

  it("filling the room turns away the rest", async () => {
    const host = await t.client();
    const created = ok(await host.emitWithAck("create_room", { displayName: "Owner", avatar: "tiger", ownerKey: KEY, settings: { maxPlayers: 2 } }));
    const code = created.room.roomCode;
    const a = await t.client();
    const b = await t.client();
    const ra = ok(await a.emitWithAck("request_join", { roomCode: code, displayName: "A", avatar: "cat" })) as { requestId: string };
    ok(await b.emitWithAck("request_join", { roomCode: code, displayName: "B", avatar: "owl" }));
    const bDenied = next(b, "join_denied");
    ok(await host.emitWithAck("respond_join_request", { requestId: ra.requestId, approve: true }));
    expect((await bDenied).reason).toBe("room_full");
  });

  it("reconnecting with a session token needs no new approval", async () => {
    const { host, code } = await hostRoom();
    const g = await t.client();
    const r = ok(await g.emitWithAck("request_join", { roomCode: code, displayName: "G", avatar: "cat" })) as { requestId: string };
    const approved = next(g, "join_approved");
    ok(await host.emitWithAck("respond_join_request", { requestId: r.requestId, approve: true }));
    const joined = await approved;
    g.disconnect();
    const again = await t.client();
    const restored = ok(await again.emitWithAck("reconnect_player", { sessionToken: joined.session.sessionToken }));
    expect(restored.session.playerId).toBe(joined.session.playerId);
  });
});
