import { afterEach, describe, expect, it } from "vitest";
import {
  autoArrange,
  evaluateArrangement,
  parseCard,
  shuffle,
  type Arrangement,
} from "@sam-kong/engine";
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
  roomCode: string;
  hand?: PrivateHand;
  /** Every event this client received, in order, for payload inspection. */
  log: Array<{ event: string; payload: unknown }>;
}

const toDTO = (a: Arrangement): ArrangementDTO => ({
  front: a.front.map((c) => c.id),
  middle: a.middle.map((c) => c.id),
  back: a.back.map((c) => c.id),
});
const validFor = (hand: PrivateHand) => toDTO(autoArrange(hand.dealtCards.map(parseCard)));

/** A fouled arrangement of the given cards, found by trying shuffled splits. */
function foulFor(hand: PrivateHand): ArrangementDTO {
  const cards = hand.dealtCards.map(parseCard);
  for (let i = 0; i < 500; i++) {
    const s = shuffle(cards);
    const a = { front: s.slice(0, 3), middle: s.slice(3, 8), back: s.slice(8) };
    if (evaluateArrangement(a).isFoul) return toDTO(a);
  }
  throw new Error("no foul found");
}

/** Create a room with `n` players, everyone ready, and start round 1. */
async function startGame(n: number, settings: Partial<RoomSettings> = {}): Promise<Seat[]> {
  t = await startTestServer();
  const seats: Seat[] = [];
  const track = (c: Client) => {
    const log: Seat["log"] = [];
    c.onAny((event, payload) => log.push({ event, payload }));
    return log;
  };
  const host = await t.client();
  const hostLog = track(host);
  const created = ok(await host.emitWithAck("create_room", { displayName: "P0", avatar: "tiger", settings }));
  const roomCode = created.room.roomCode;
  seats.push({ c: host, playerId: created.session.playerId, token: created.session.sessionToken, roomCode, log: hostLog });
  for (let i = 1; i < n; i++) {
    const c = await t.client();
    const log = track(c);
    const j = ok(await c.emitWithAck("join_room", { roomCode: created.room.roomCode, displayName: `P${i}`, avatar: "cat" }));
    ok(await c.emitWithAck("player_ready", { ready: true }));
    seats.push({ c, playerId: j.session.playerId, token: j.session.sessionToken, roomCode, log });
  }
  const dealt = seats.map((s) => next(s.c, "cards_dealt"));
  ok(await host.emitWithAck("start_game", {}));
  (await Promise.all(dealt)).forEach((h, i) => (seats[i]!.hand = h));
  return seats;
}

async function dealNext(seats: Seat[], event: "next_round" | "play_again") {
  const dealt = seats.map((s) => next(s.c, "cards_dealt"));
  ok(await seats[0]!.c.emitWithAck(event, {}));
  (await Promise.all(dealt)).forEach((h, i) => (seats[i]!.hand = h));
}

async function playRound(seats: Seat[]) {
  const results = seats.map((s) => next(s.c, "round_result"));
  for (const s of seats) ok(await s.c.emitWithAck("confirm_hand", { arrangement: validFor(s.hand!), acceptFoul: false }));
  return Promise.all(results);
}

describe("start game (FR-05, AC-01)", () => {
  it("only the host can start, with at least 2 players who are all ready", async () => {
    t = await startTestServer();
    const host = await t.client();
    const created = ok(await host.emitWithAck("create_room", { displayName: "H", avatar: "tiger" }));
    expect(errCode(await host.emitWithAck("start_game", {}))).toBe("NOT_ENOUGH_PLAYERS");
    const guest = await t.client();
    ok(await guest.emitWithAck("join_room", { roomCode: created.room.roomCode, displayName: "G", avatar: "cat" }));
    expect(errCode(await host.emitWithAck("start_game", {}))).toBe("PLAYERS_NOT_READY");
    ok(await guest.emitWithAck("player_ready", { ready: true }));
    expect(errCode(await guest.emitWithAck("start_game", {}))).toBe("NOT_HOST");
    ok(await host.emitWithAck("start_game", {}));
    expect(errCode(await host.emitWithAck("start_game", {}))).toBe("INVALID_STATE"); // no double start
    const late = await t.client();
    const res = await late.emitWithAck("join_room", { roomCode: created.room.roomCode, displayName: "Late", avatar: "owl" });
    expect(errCode(res)).toBe("GAME_ALREADY_STARTED");
  });
});

describe("dealing (AC-02)", () => {
  it.each([2, 3, 4])("deals 13 unique cards to each of %i players, only to their owner", async (n) => {
    const seats = await startGame(n);
    const all = seats.flatMap((s) => s.hand!.dealtCards);
    expect(all).toHaveLength(n * 13);
    expect(new Set(all).size).toBe(n * 13);
    for (const s of seats) {
      expect(s.hand).toMatchObject({ roundNumber: 1, isConfirmed: false });
      // Dealt straight into the piles in dealt order (3/5/5), unsorted: the player rearranges.
      const d = s.hand!.dealtCards;
      expect(s.hand!.arrangement).toEqual({ front: d.slice(0, 3), middle: d.slice(3, 8), back: d.slice(8, 13) });
    }

    // Nothing any client received so far contains another player's card ids.
    for (const s of seats) {
      const raw = JSON.stringify(s.log);
      for (const other of seats) {
        if (other === s) continue;
        for (const id of other.hand!.dealtCards) expect(raw).not.toMatch(new RegExp(`"${id}"`));
      }
    }
  });
});

describe("arrange and confirm (FR-06, FR-09, AC-03)", () => {
  it("saves drafts, validates cards and blocks edits after confirm", async () => {
    const [a] = await startGame(2);
    const h = a!.hand!;
    const draft = { front: h.dealtCards.slice(0, 2), middle: [], back: [] };
    ok(await a!.c.emitWithAck("update_arrangement", draft));
    expect(errCode(await a!.c.emitWithAck("update_arrangement", { front: h.dealtCards.slice(0, 4), middle: [], back: [] }))).toBe("INVALID_ARRANGEMENT");
    expect(errCode(await a!.c.emitWithAck("update_arrangement", { front: [h.dealtCards[0]!, h.dealtCards[0]!], middle: [], back: [] }))).toBe("INVALID_ARRANGEMENT");

    const stranger = ["2S", "3S", "4S", "5S", "6S", "7S", "8S", "9S", "TS", "JS", "QS", "KS", "AS"].find((id) => !h.dealtCards.includes(id))!;
    expect(errCode(await a!.c.emitWithAck("update_arrangement", { front: [stranger], middle: [], back: [] }))).toBe("INVALID_ARRANGEMENT");

    const incomplete = { front: h.dealtCards.slice(0, 3), middle: h.dealtCards.slice(3, 8), back: h.dealtCards.slice(8, 12) };
    expect(errCode(await a!.c.emitWithAck("confirm_hand", { arrangement: incomplete, acceptFoul: true }))).toBe("INVALID_ARRANGEMENT");

    ok(await a!.c.emitWithAck("confirm_hand", { arrangement: validFor(h), acceptFoul: false }));
    expect(errCode(await a!.c.emitWithAck("confirm_hand", { arrangement: validFor(h), acceptFoul: false }))).toBe("ALREADY_CONFIRMED");
    expect(errCode(await a!.c.emitWithAck("update_arrangement", draft))).toBe("ALREADY_CONFIRMED");
  });

  it("requires accepting a foul before confirming one", async () => {
    const [a, b] = await startGame(2);
    const foul = foulFor(a!.hand!);
    const res = await a!.c.emitWithAck("confirm_hand", { arrangement: foul, acceptFoul: false });
    expect(errCode(res)).toBe("FOUL_NOT_ACCEPTED");
    expect(res.ok ? null : res.error.detail?.foulReasons).toBeTruthy();
    ok(await a!.c.emitWithAck("confirm_hand", { arrangement: foul, acceptFoul: true }));
    const result = next(b!.c, "round_result");
    ok(await b!.c.emitWithAck("confirm_hand", { arrangement: validFor(b!.hand!), acceptFoul: false }));
    const r = await result;
    expect(r.hands.find((h) => h.playerId === a!.playerId)?.isFoul).toBe(true);
    expect(r.scores[a!.playerId]!.total).toBe(-6);
  });

  it("auto arrange returns a valid draft without confirming", async () => {
    const [a] = await startGame(2);
    const updated = next(a!.c, "arrangement_updated");
    const dto = ok(await a!.c.emitWithAck("request_auto_arrange", {}));
    expect((await updated).isConfirmed).toBe(false);
    expect(dto.front).toHaveLength(3);
    const cards = { front: dto.front.map(parseCard), middle: dto.middle.map(parseCard), back: dto.back.map(parseCard) };
    expect(evaluateArrangement(cards).isFoul).toBe(false);
  });
});

describe("edit after confirming", () => {
  it("lets a player take back a confirmation while the round is open", async () => {
    const [a, b] = await startGame(2);
    ok(await a!.c.emitWithAck("confirm_hand", { arrangement: validFor(a!.hand!), acceptFoul: false }));
    const reopened = ok(await a!.c.emitWithAck("unconfirm_hand", {}));
    expect(reopened.isConfirmed).toBe(false);
    expect(reopened.arrangement).toEqual(validFor(a!.hand!)); // keeps what they had
    const room = t.server.store.getRoom(a!.roomCode)!;
    expect(room.players.get(a!.playerId)!.playerState).toBe("ARRANGING");
    expect(room.gameState).toBe("ARRANGING");

    // B confirming alone must not reveal: A is arranging again.
    ok(await b!.c.emitWithAck("confirm_hand", { arrangement: validFor(b!.hand!), acceptFoul: false }));
    await sleep(50);
    expect(room.gameState).toBe("WAITING_FOR_CONFIRMATION");
    const result = next(b!.c, "round_result");
    ok(await a!.c.emitWithAck("confirm_hand", { arrangement: validFor(a!.hand!), acceptFoul: false }));
    expect((await result).roundNumber).toBe(1);
  });

  it("can't take back a confirmation that wasn't made, or after the reveal", async () => {
    const [a, b] = await startGame(2);
    expect(errCode(await a!.c.emitWithAck("unconfirm_hand", {}))).toBe("INVALID_STATE");
    ok(await a!.c.emitWithAck("confirm_hand", { arrangement: validFor(a!.hand!), acceptFoul: false }));
    const result = next(a!.c, "round_result");
    ok(await b!.c.emitWithAck("confirm_hand", { arrangement: validFor(b!.hand!), acceptFoul: false }));
    await result;
    expect(errCode(await a!.c.emitWithAck("unconfirm_hand", {}))).toBe("INVALID_STATE");
  });
});

describe("reveal and scoring (FR-11, FR-12, AC-05, AC-06)", () => {
  it("reveals only after everyone confirms, then scores once with a zero sum", async () => {
    const seats = await startGame(4);
    const revealed = seats.map((s) => next(s.c, "cards_revealed"));
    const leaderboard = next(seats[0]!.c, "leaderboard_updated");

    const firstConfirm = next(seats[1]!.c, "hand_confirmed");
    ok(await seats[0]!.c.emitWithAck("confirm_hand", { arrangement: validFor(seats[0]!.hand!), acceptFoul: false }));
    expect(await firstConfirm).toMatchObject({ playerId: seats[0]!.playerId, confirmedCount: 1, totalPlayers: 4, auto: false });
    await sleep(50);
    expect(seats[1]!.log.some((e) => e.event === "cards_revealed")).toBe(false);

    const results = seats.map((s) => next(s.c, "round_result"));
    for (const s of seats.slice(1)) ok(await s.c.emitWithAck("confirm_hand", { arrangement: validFor(s.hand!), acceptFoul: false }));
    const [r] = await Promise.all(results);
    await Promise.all(revealed);

    expect(r!.pairwise).toHaveLength(6);
    expect(Object.values(r!.scores).reduce((s, p) => s + p.total, 0)).toBe(0);
    expect(r!.hands).toHaveLength(4);
    for (const h of r!.hands) expect(h.rankings.back.name).toBeTruthy();

    const board = (await leaderboard).leaderboard;
    expect(board.map((e) => e.totalScore)).toEqual([...board.map((e) => e.totalScore)].sort((x, y) => y - x));
    for (const e of board) expect(e.totalScore).toBe(r!.scores[e.playerId]!.total);
    expect(t.server.store.getRoom(seats[0]!.roomCode)?.gameState).toBe("ROUND_RESULT");
  });

  it("keeps totals across rounds and refuses next round from non-hosts or mid-round", async () => {
    const seats = await startGame(3);
    expect(errCode(await seats[0]!.c.emitWithAck("next_round", {}))).toBe("INVALID_STATE");
    const [r1] = await playRound(seats);
    expect(errCode(await seats[1]!.c.emitWithAck("next_round", {}))).toBe("NOT_HOST");
    await dealNext(seats, "next_round");
    expect(seats[0]!.hand!.roundNumber).toBe(2);
    const [r2] = await playRound(seats);
    for (const s of seats) {
      expect(r2!.totals[s.playerId]).toBe(r1!.scores[s.playerId]!.total + r2!.scores[s.playerId]!.total);
    }
  });
});

describe("end game (FR-14, FR-15)", () => {
  it("finishes automatically after the last round, then Play Again resets scores", async () => {
    const seats = await startGame(2, { totalRounds: 5 });
    for (let round = 1; round <= 5; round++) {
      if (round > 1) await dealNext(seats, "next_round");
      const finished = round === 5 ? next(seats[1]!.c, "game_finished") : null;
      await playRound(seats);
      if (finished) {
        const f = await finished;
        expect(f.roundsPlayed).toBe(5);
        expect(f.winnerIds.length).toBeGreaterThanOrEqual(1);
        expect(f.leaderboard[0]!.rank).toBe(1);
      }
    }
    expect(errCode(await seats[0]!.c.emitWithAck("next_round", {}))).toBe("INVALID_STATE");
    const restarted = next(seats[1]!.c, "room_updated", (r) => r.gameState === "ARRANGING");
    await dealNext(seats, "play_again");
    const room = await restarted;
    expect(room.currentRound).toBe(1);
    expect(room.players.every((p) => p.totalScore === 0)).toBe(true);
  });

  it("host can end after any round and go back to the lobby", async () => {
    const seats = await startGame(2);
    await playRound(seats);
    const finished = next(seats[1]!.c, "game_finished");
    ok(await seats[0]!.c.emitWithAck("end_game", {}));
    expect((await finished).roundsPlayed).toBe(1);
    const lobby = next(seats[1]!.c, "room_updated", (r) => r.gameState === "LOBBY");
    ok(await seats[0]!.c.emitWithAck("back_to_lobby", {}));
    const room = await lobby;
    expect(room.players.every((p) => p.playerState === "NOT_READY" && p.totalScore === 0)).toBe(true);
  });
});

describe("reconnect and leaving mid-game (FR-16, AC-07)", () => {
  it("restores cards and the saved draft after a refresh", async () => {
    const [a] = await startGame(2);
    const h = a!.hand!;
    const draft = { front: h.dealtCards.slice(0, 3), middle: h.dealtCards.slice(3, 5), back: [] };
    ok(await a!.c.emitWithAck("update_arrangement", draft));
    a!.c.disconnect();
    const again = await t.client();
    const restored = ok(await again.emitWithAck("reconnect_player", { sessionToken: a!.token }));
    expect(restored.privateHand?.dealtCards).toEqual(h.dealtCards);
    expect(restored.privateHand?.arrangement).toEqual(draft);
  });

  it("a player leaving mid-round is auto-submitted and removed at the next round", async () => {
    const seats = await startGame(3);
    const [a, b, c] = seats;
    ok(await a!.c.emitWithAck("confirm_hand", { arrangement: validFor(a!.hand!), acceptFoul: false }));
    ok(await b!.c.emitWithAck("confirm_hand", { arrangement: validFor(b!.hand!), acceptFoul: false }));
    const result = next(a!.c, "round_result");
    ok(await c!.c.emitWithAck("leave_room", {}));
    const r = await result;
    expect(r.hands.find((h) => h.playerId === c!.playerId)?.isAutoSubmitted).toBe(true);
    expect(r.hands.find((h) => h.playerId === c!.playerId)?.isFoul).toBe(false);

    const dealt = [a, b].map((s) => next(s!.c, "cards_dealt"));
    ok(await a!.c.emitWithAck("next_round", {}));
    await Promise.all(dealt);
    const live = t.server.store.getRoom(a!.roomCode)!;
    expect(live.players.has(c!.playerId)).toBe(false);
    expect(live.players.size).toBe(2);
  });

  it("returns to the lobby when fewer than 2 players remain", async () => {
    const seats = await startGame(2);
    const [a, b] = seats;
    const result = next(a!.c, "round_result");
    ok(await a!.c.emitWithAck("confirm_hand", { arrangement: validFor(a!.hand!), acceptFoul: false }));
    ok(await b!.c.emitWithAck("leave_room", {}));
    await result;
    const lobby = next(a!.c, "room_updated", (r) => r.gameState === "LOBBY");
    ok(await a!.c.emitWithAck("next_round", {}));
    expect((await lobby).players).toHaveLength(1);
  });

  it("the host leaving mid-game hands host to the next player", async () => {
    const seats = await startGame(3);
    const updated = next(seats[1]!.c, "room_updated", (r) => r.hostPlayerId === seats[1]!.playerId);
    ok(await seats[0]!.c.emitWithAck("leave_room", {}));
    expect((await updated).players.find((p) => p.playerId === seats[0]!.playerId)?.hasLeft).toBe(true);
  });
});
