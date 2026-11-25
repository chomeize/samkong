import {
  autoArrange,
  dealHands,
  describeHand,
  evaluateArrangement,
  isValidCardId,
  MIN_PLAYERS,
  ROW_SIZES,
  ROWS,
  scoreRound,
  validateArrangementCards,
  arrangementRoyalty,
  DEFAULT_SCORING_OPTIONS,
  type Arrangement,
  type Card,
  type HandValue,
  type RandomInt,
} from "@sam-kong/engine";
import type {
  ArrangementDTO,
  AvatarId,
  ConnectionStatus,
  GameFinishedPayload,
  GameState,
  HandRankingDTO,
  LeaderboardEntry,
  PlayerState,
  PrivateHand,
  PublicPlayer,
  PublicRoom,
  RevealedHand,
  RoomSettings,
  RoundResult,
} from "@sam-kong/protocol";
import { GameError, nicknameKey } from "./util.js";

/** Server-only player record. `sessionToken` and `socketId` never leave the server. */
export interface PlayerRecord {
  playerId: string;
  displayName: string;
  avatar: AvatarId;
  joinOrder: number;
  sessionToken: string;
  socketId: string | null;
  connectionStatus: ConnectionStatus;
  offlineSince: number | null;
  playerState: PlayerState;
  hasLeft: boolean;
  totalScore: number;
  currentRoundScore: number;
  scoopCount: number;
  foulCount: number;
}

export interface NewPlayer {
  playerId: string;
  displayName: string;
  avatar: AvatarId;
  sessionToken: string;
  socketId: string;
}

/** Private per-player hand for the current round. Never sent to anyone but its owner before reveal. */
export interface HandRecord {
  dealt: Card[];
  /** Latest saved arrangement (may be partial until confirmed). */
  arrangement: Arrangement;
  confirmed: boolean;
  auto: boolean;
}

export interface RoundState {
  roundNumber: number;
  participants: string[];
  hands: Map<string, HandRecord>;
  result: RoundResult | null;
}

export interface RoundOutcome {
  result: RoundResult;
  finished: boolean;
}

const ARRANGING_STATES: GameState[] = ["ARRANGING", "WAITING_FOR_CONFIRMATION"];
const emptyArrangement = (): Arrangement => ({ front: [], middle: [], back: [] });

/**
 * Authoritative state of one room. Every mutating method checks the current
 * state and permissions first and throws GameError when the action isn't allowed.
 * Methods take `now` so behaviour is deterministic in tests.
 */
export class Room {
  readonly players = new Map<string, PlayerRecord>();
  gameState: GameState = "LOBBY";
  currentRound = 0;
  deadlineAt: number | null = null;
  lastActivityAt: number;
  round: RoundState | null = null;
  lastRoundResult: RoundResult | null = null;
  private joinCounter = 0;

  constructor(
    readonly roomCode: string,
    public roomName: string,
    public settings: RoomSettings,
    public hostPlayerId: string,
    readonly createdAt: number,
    private readonly randomInt?: RandomInt,
  ) {
    this.lastActivityAt = createdAt;
  }

  // ---------- queries ----------

  orderedPlayers(): PlayerRecord[] {
    return [...this.players.values()].sort((a, b) => a.joinOrder - b.joinOrder);
  }

  getPlayer(playerId: string): PlayerRecord {
    const p = this.players.get(playerId);
    if (!p) throw new GameError("PLAYER_NOT_FOUND");
    return p;
  }

  isHost(playerId: string) {
    return this.hostPlayerId === playerId;
  }

  anyoneOnline() {
    for (const p of this.players.values()) if (p.connectionStatus === "ONLINE") return true;
    return false;
  }

  /** Host may start when ≥2 players and every non-host player is READY (pressing Start counts as the host's ready). */
  canStart(): boolean {
    if (this.gameState !== "LOBBY" || this.players.size < MIN_PLAYERS) return false;
    for (const p of this.players.values()) if (p.playerId !== this.hostPlayerId && p.playerState !== "READY") return false;
    return true;
  }

  private isFinalRound() {
    return this.settings.totalRounds !== null && this.currentRound >= this.settings.totalRounds;
  }

  // ---------- lobby actions ----------

  addPlayer(np: NewPlayer, now: number): PlayerRecord {
    if (this.gameState !== "LOBBY") throw new GameError("GAME_ALREADY_STARTED");
    if (this.players.size >= this.settings.maxPlayers) throw new GameError("ROOM_FULL");
    const key = nicknameKey(np.displayName);
    for (const p of this.players.values()) if (nicknameKey(p.displayName) === key) throw new GameError("NICKNAME_TAKEN");
    const record: PlayerRecord = {
      ...np,
      joinOrder: this.joinCounter++,
      connectionStatus: "ONLINE",
      offlineSince: null,
      playerState: "NOT_READY",
      hasLeft: false,
      totalScore: 0,
      currentRoundScore: 0,
      scoopCount: 0,
      foulCount: 0,
    };
    this.players.set(np.playerId, record);
    this.touch(now);
    return record;
  }

  /** Removes a player during LOBBY. Returns the new host id if the host changed. */
  removePlayer(playerId: string, now: number): { newHostId: string | null } {
    this.getPlayer(playerId);
    if (this.gameState !== "LOBBY") throw new GameError("INVALID_STATE");
    this.players.delete(playerId);
    this.touch(now);
    if (this.hostPlayerId === playerId && this.players.size > 0) {
      return { newHostId: this.transferHost() };
    }
    return { newHostId: null };
  }

  kick(byPlayerId: string, targetId: string, now: number) {
    this.requireHost(byPlayerId);
    if (byPlayerId === targetId) throw new GameError("CANNOT_KICK_SELF");
    if (this.gameState !== "LOBBY") throw new GameError("INVALID_STATE");
    this.removePlayer(targetId, now);
  }

  setReady(playerId: string, ready: boolean, now: number) {
    const p = this.getPlayer(playerId);
    if (this.gameState !== "LOBBY") throw new GameError("INVALID_STATE");
    p.playerState = ready ? "READY" : "NOT_READY";
    this.touch(now);
  }

  /** Host-only, LOBBY-only. Any real change clears everyone's Ready so players agree to the new rules. */
  updateSettings(byPlayerId: string, settings: RoomSettings, roomName: string, now: number): boolean {
    this.requireHost(byPlayerId);
    if (this.gameState !== "LOBBY") throw new GameError("INVALID_STATE");
    if (settings.maxPlayers < this.players.size) {
      throw new GameError("INVALID_SETTINGS", { field: "maxPlayers", reason: "below_current_players" });
    }
    const changed = JSON.stringify(settings) !== JSON.stringify(this.settings);
    this.settings = settings;
    this.roomName = roomName;
    if (changed) for (const p of this.players.values()) if (p.playerState === "READY") p.playerState = "NOT_READY";
    this.touch(now);
    return changed;
  }

  // ---------- game flow ----------

  startGame(byPlayerId: string, now: number): boolean {
    this.requireHost(byPlayerId);
    if (this.gameState !== "LOBBY") throw new GameError("INVALID_STATE");
    if (this.players.size < MIN_PLAYERS) throw new GameError("NOT_ENOUGH_PLAYERS");
    if (!this.canStart()) throw new GameError("PLAYERS_NOT_READY");
    this.resetScores();
    return this.dealRound(now);
  }

  nextRound(byPlayerId: string, now: number): boolean {
    this.requireHost(byPlayerId);
    if (this.gameState !== "ROUND_RESULT" || this.isFinalRound()) throw new GameError("INVALID_STATE");
    return this.dealRound(now);
  }

  endGame(byPlayerId: string, now: number) {
    this.requireHost(byPlayerId);
    if (this.gameState !== "ROUND_RESULT") throw new GameError("INVALID_STATE");
    this.gameState = "GAME_FINISHED";
    this.touch(now);
  }

  playAgain(byPlayerId: string, now: number): boolean {
    this.requireHost(byPlayerId);
    if (this.gameState !== "GAME_FINISHED") throw new GameError("INVALID_STATE");
    this.resetScores();
    return this.dealRound(now);
  }

  backToLobby(byPlayerId: string, now: number) {
    this.requireHost(byPlayerId);
    if (this.gameState !== "GAME_FINISHED") throw new GameError("INVALID_STATE");
    this.removeLeavers();
    this.toLobby();
    this.resetScores();
    this.touch(now);
  }

  /**
   * Deal a fresh shuffled deck to everyone still in the room. Players who left
   * during the previous round are removed first. Returns false (and goes back
   * to LOBBY) when fewer than 2 players remain.
   */
  private dealRound(now: number): boolean {
    this.removeLeavers();
    const participants = this.orderedPlayers().map((p) => p.playerId);
    if (participants.length < MIN_PLAYERS) {
      this.toLobby();
      this.touch(now);
      return false;
    }
    this.gameState = "DEALING";
    const dealt = dealHands(participants.length, this.randomInt);
    this.currentRound += 1;
    const hands = new Map<string, HandRecord>();
    participants.forEach((id, i) => {
      // Cards land straight in the three piles, in the (shuffled) order dealt: players rearrange by swapping.
      const cards = dealt[i]!;
      const arrangement = { front: cards.slice(0, 3), middle: cards.slice(3, 8), back: cards.slice(8, 13) };
      hands.set(id, { dealt: cards, arrangement, confirmed: false, auto: false });
      const p = this.players.get(id)!;
      p.playerState = "ARRANGING";
      p.currentRoundScore = 0;
    });
    this.round = { roundNumber: this.currentRound, participants, hands, result: null };
    this.gameState = "ARRANGING";
    this.touch(now);
    return true;
  }

  private requireHand(playerId: string): HandRecord {
    this.getPlayer(playerId);
    if (!ARRANGING_STATES.includes(this.gameState)) throw new GameError("INVALID_STATE");
    const hand = this.round?.hands.get(playerId);
    if (!hand) throw new GameError("INVALID_STATE");
    if (hand.confirmed) throw new GameError("ALREADY_CONFIRMED");
    return hand;
  }

  /**
   * Convert untrusted card ids to the player's own dealt cards.
   * `partial` allows rows that aren't full yet (saving a draft).
   */
  private toArrangement(dto: ArrangementDTO, dealt: Card[], partial: boolean): Arrangement {
    const byId = new Map(dealt.map((c) => [c.id, c]));
    const seen = new Set<string>();
    const out = emptyArrangement();
    for (const row of ROWS) {
      const ids = dto[row];
      if (!Array.isArray(ids) || ids.length > ROW_SIZES[row] || (!partial && ids.length !== ROW_SIZES[row])) {
        throw new GameError("INVALID_ARRANGEMENT", { row, reason: "count" });
      }
      for (const id of ids) {
        const card = isValidCardId(id) ? byId.get(id) : undefined;
        if (!card) throw new GameError("INVALID_ARRANGEMENT", { cardId: String(id), reason: "not_dealt" });
        if (seen.has(id)) throw new GameError("INVALID_ARRANGEMENT", { cardId: id, reason: "duplicate" });
        seen.add(id);
        out[row].push(card);
      }
    }
    if (!partial && validateArrangementCards(out, dealt).length > 0) {
      throw new GameError("INVALID_ARRANGEMENT", { reason: "cards" });
    }
    return out;
  }

  /** Save a draft so a refresh or reconnect brings it back. */
  saveDraft(playerId: string, dto: ArrangementDTO, now: number) {
    const hand = this.requireHand(playerId);
    hand.arrangement = this.toArrangement(dto, hand.dealt, true);
    this.touch(now);
  }

  /** Suggest a valid arrangement and save it as the draft; the player still confirms it themselves. */
  autoArrangeDraft(playerId: string, now: number): ArrangementDTO {
    const hand = this.requireHand(playerId);
    hand.arrangement = autoArrange(hand.dealt);
    this.touch(now);
    return toDTO(hand.arrangement);
  }

  confirmHand(playerId: string, dto: ArrangementDTO, acceptFoul: boolean, now: number): RoundOutcome | null {
    const hand = this.requireHand(playerId);
    const arrangement = this.toArrangement(dto, hand.dealt, false);
    const evaluated = evaluateArrangement(arrangement);
    if (evaluated.isFoul && !acceptFoul) {
      throw new GameError("FOUL_NOT_ACCEPTED", { foulReasons: evaluated.foulReasons });
    }
    hand.arrangement = arrangement;
    hand.confirmed = true;
    this.getPlayer(playerId).playerState = "CONFIRMED";
    if (this.gameState === "ARRANGING") this.gameState = "WAITING_FOR_CONFIRMATION";
    this.touch(now);
    return this.revealIfComplete(now);
  }

  /**
   * Confirm for a player who can't (timeout, left the game). Keeps their draft if it is
   * complete and not fouled, otherwise auto-arranges from their own 13 cards.
   */
  autoSubmit(playerId: string, now: number): RoundOutcome | null {
    const hand = this.round?.hands.get(playerId);
    if (!hand || hand.confirmed || !ARRANGING_STATES.includes(this.gameState)) return null;
    const draft = hand.arrangement;
    const draftOk =
      validateArrangementCards(draft, hand.dealt).length === 0 && !evaluateArrangement(draft).isFoul;
    hand.arrangement = draftOk ? draft : autoArrange(hand.dealt);
    hand.confirmed = true;
    hand.auto = true;
    const p = this.players.get(playerId);
    if (p) p.playerState = "AUTO_SUBMITTED";
    if (this.gameState === "ARRANGING") this.gameState = "WAITING_FOR_CONFIRMATION";
    this.touch(now);
    return this.revealIfComplete(now);
  }

  /** Players still arranging this round (not confirmed yet). */
  pendingPlayers(): string[] {
    if (!this.round || !ARRANGING_STATES.includes(this.gameState)) return [];
    return this.round.participants.filter((id) => !this.round!.hands.get(id)!.confirmed);
  }

  /**
   * The arrangement timer ran out: auto-submit everyone still arranging (spec FR-10).
   * A complete, valid draft is kept; anything else is auto-arranged from the same 13 cards.
   */
  expireDeadline(now: number): { autoIds: string[]; outcome: RoundOutcome | null } {
    const autoIds = this.pendingPlayers();
    let outcome: RoundOutcome | null = null;
    for (const id of autoIds) outcome = this.autoSubmit(id, now) ?? outcome;
    return { autoIds, outcome };
  }

  confirmedCount(): number {
    let n = 0;
    for (const h of this.round?.hands.values() ?? []) if (h.confirmed) n++;
    return n;
  }

  private revealIfComplete(now: number): RoundOutcome | null {
    const round = this.round;
    if (!round || round.result) return null;
    for (const h of round.hands.values()) if (!h.confirmed) return null;

    this.gameState = "REVEALING";
    const evaluated = new Map(round.participants.map((id) => [id, evaluateArrangement(round.hands.get(id)!.arrangement)]));

    this.gameState = "SCORING";
    const options = {
      ...DEFAULT_SCORING_OPTIONS,
      enableScoopBonus: this.settings.enableScoopBonus,
      enableRoyaltyBonus: this.settings.enableRoyaltyBonus,
    };
    const scored = scoreRound(round.participants.map((id) => ({ playerId: id, hand: evaluated.get(id)! })), options);

    // Apply exactly once: guarded by round.result being null above.
    for (const id of round.participants) {
      const p = this.players.get(id);
      const s = scored.players[id]!;
      if (!p) continue;
      p.currentRoundScore = s.total;
      p.totalScore += s.total;
      p.scoopCount += s.scoops;
      if (s.isFoul) p.foulCount += 1;
    }

    const ranking = (v: HandValue): HandRankingDTO => ({ category: v.category, name: describeHand(v), isRoyal: v.isRoyal });
    const hands: RevealedHand[] = round.participants.map((id) => {
      const h = round.hands.get(id)!;
      const e = evaluated.get(id)!;
      const royalty = this.settings.enableRoyaltyBonus
        ? arrangementRoyalty(e, options.royaltyTable)
        : { front: 0, middle: 0, back: 0, total: 0 };
      return {
        playerId: id,
        arrangement: toDTO(h.arrangement),
        rankings: { front: ranking(e.front), middle: ranking(e.middle), back: ranking(e.back) },
        isFoul: e.isFoul,
        foulReasons: e.foulReasons,
        isAutoSubmitted: h.auto,
        royalty,
      };
    });
    const totals: Record<string, number> = {};
    for (const p of this.players.values()) totals[p.playerId] = p.totalScore;

    const result: RoundResult = {
      roundNumber: round.roundNumber,
      hands,
      pairwise: scored.pairwise,
      scores: scored.players,
      totals,
    };
    round.result = result;
    this.lastRoundResult = result;
    const finished = this.isFinalRound();
    this.gameState = finished ? "GAME_FINISHED" : "ROUND_RESULT";
    this.deadlineAt = null;
    this.touch(now);
    return { result, finished };
  }

  // ---------- leaving ----------

  /**
   * A player leaves. In LOBBY they are removed at once. During a game they are
   * auto-submitted (if still arranging) and removed at the next round boundary.
   */
  leave(playerId: string, now: number): { removedNow: boolean; outcome: RoundOutcome | null } {
    const p = this.getPlayer(playerId);
    if (this.gameState === "LOBBY") {
      this.removePlayer(playerId, now);
      return { removedNow: true, outcome: null };
    }
    p.hasLeft = true;
    p.socketId = null;
    p.connectionStatus = "OFFLINE";
    p.offlineSince = now;
    if (this.hostPlayerId === playerId) this.transferHost();
    const outcome = this.autoSubmit(playerId, now);
    this.touch(now);
    return { removedNow: false, outcome };
  }

  private removeLeavers() {
    for (const p of [...this.players.values()]) if (p.hasLeft) this.players.delete(p.playerId);
    if (!this.players.has(this.hostPlayerId) && this.players.size > 0) this.transferHost();
  }

  private toLobby() {
    this.gameState = "LOBBY";
    this.round = null;
    this.deadlineAt = null;
    for (const p of this.players.values()) p.playerState = "NOT_READY";
  }

  private resetScores() {
    this.currentRound = 0;
    this.lastRoundResult = null;
    for (const p of this.players.values()) {
      p.totalScore = 0;
      p.currentRoundScore = 0;
      p.scoopCount = 0;
      p.foulCount = 0;
    }
  }

  // ---------- connection ----------

  markOnline(playerId: string, socketId: string, now: number) {
    const p = this.getPlayer(playerId);
    p.socketId = socketId;
    p.connectionStatus = "ONLINE";
    p.offlineSince = null;
    this.touch(now);
  }

  /** Only the player's current socket can take them offline (an old tab disconnecting doesn't count). */
  markOffline(playerId: string, socketId: string, now: number): boolean {
    const p = this.players.get(playerId);
    if (!p || p.socketId !== socketId) return false;
    p.socketId = null;
    p.connectionStatus = "OFFLINE";
    p.offlineSince = now;
    this.touch(now);
    return true;
  }

  /** Move host to the next player by join order, preferring someone online who hasn't left. */
  transferHost(): string {
    const candidates = this.orderedPlayers().filter((p) => p.playerId !== this.hostPlayerId && !p.hasLeft);
    const next = candidates.find((p) => p.connectionStatus === "ONLINE") ?? candidates[0];
    if (next) this.hostPlayerId = next.playerId;
    return this.hostPlayerId;
  }

  // ---------- views ----------

  privateHandFor(playerId: string): PrivateHand | null {
    const hand = this.round?.hands.get(playerId);
    if (!hand || !this.round) return null;
    return {
      roundNumber: this.round.roundNumber,
      dealtCards: hand.dealt.map((c) => c.id),
      arrangement: toDTO(hand.arrangement),
      isConfirmed: hand.confirmed,
      isAutoSubmitted: hand.auto,
    };
  }

  /** Sorted by total score; equal totals share a rank (1, 1, 3). */
  leaderboard(): LeaderboardEntry[] {
    const sorted = this.orderedPlayers().sort((a, b) => b.totalScore - a.totalScore || a.joinOrder - b.joinOrder);
    return sorted.map((p) => {
      const rank = sorted.findIndex((q) => q.totalScore === p.totalScore) + 1;
      return {
        rank,
        tied: sorted.filter((q) => q.totalScore === p.totalScore).length > 1,
        playerId: p.playerId,
        displayName: p.displayName,
        avatar: p.avatar,
        currentRoundScore: p.currentRoundScore,
        totalScore: p.totalScore,
        scoopCount: p.scoopCount,
        foulCount: p.foulCount,
      };
    });
  }

  finishedPayload(): GameFinishedPayload {
    const leaderboard = this.leaderboard();
    return {
      leaderboard,
      winnerIds: leaderboard.filter((e) => e.rank === 1).map((e) => e.playerId),
      roundsPlayed: this.currentRound,
    };
  }

  toPublicPlayer(p: PlayerRecord): PublicPlayer {
    return {
      playerId: p.playerId,
      displayName: p.displayName,
      avatar: p.avatar,
      isHost: p.playerId === this.hostPlayerId,
      joinOrder: p.joinOrder,
      hasLeft: p.hasLeft,
      connectionStatus: p.connectionStatus,
      playerState: p.playerState,
      totalScore: p.totalScore,
      currentRoundScore: p.currentRoundScore,
      scoopCount: p.scoopCount,
      foulCount: p.foulCount,
    };
  }

  toPublic(now: number): PublicRoom {
    return {
      roomCode: this.roomCode,
      roomName: this.roomName,
      hostPlayerId: this.hostPlayerId,
      settings: { ...this.settings },
      gameState: this.gameState,
      currentRound: this.currentRound,
      players: this.orderedPlayers().map((p) => this.toPublicPlayer(p)),
      canStart: this.canStart(),
      deadlineAt: this.deadlineAt,
      serverNow: now,
      createdAt: this.createdAt,
    };
  }

  private requireHost(playerId: string) {
    this.getPlayer(playerId);
    if (!this.isHost(playerId)) throw new GameError("NOT_HOST");
  }

  private touch(now: number) {
    this.lastActivityAt = now;
  }
}

export function toDTO(a: Arrangement): ArrangementDTO {
  return { front: a.front.map((c) => c.id), middle: a.middle.map((c) => c.id), back: a.back.map((c) => c.id) };
}
