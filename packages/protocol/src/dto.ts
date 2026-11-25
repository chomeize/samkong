import type { FoulReason, PairwiseResult, PlayerRoundScore, Row } from "@sam-kong/engine";
import type { AvatarId } from "./avatars.js";
import type { RoomSettings } from "./settings.js";
import type { ConnectionStatus, GameState, PlayerState } from "./states.js";

/** Card id as produced by the engine: rank char + suit char, e.g. "AS", "TD". */
export type CardId = string;

/** Safe to send to everyone in the room. Never contains cards or session tokens. */
export interface PublicPlayer {
  playerId: string;
  displayName: string;
  avatar: AvatarId;
  isHost: boolean;
  joinOrder: number;
  /** Left during a game; removed from the room at the next round boundary. */
  hasLeft: boolean;
  connectionStatus: ConnectionStatus;
  playerState: PlayerState;
  totalScore: number;
  currentRoundScore: number;
  scoopCount: number;
  foulCount: number;
}

export interface PublicRoom {
  roomCode: string;
  roomName: string;
  hostPlayerId: string;
  settings: RoomSettings;
  gameState: GameState;
  currentRound: number;
  /** Ordered by join order. */
  players: PublicPlayer[];
  /** True when the host may press Start Game right now. */
  canStart: boolean;
  /** Arrangement deadline (epoch ms) while a timer runs, else null. */
  deadlineAt: number | null;
  /** Server clock at send time, so clients can correct for clock skew. */
  serverNow: number;
  createdAt: number;
}

/** Private to one player. The session token is the only credential; keep it in the browser. */
export interface SessionInfo {
  sessionToken: string;
  playerId: string;
  roomCode: string;
}

export interface JoinedPayload {
  session: SessionInfo;
  room: PublicRoom;
  inviteUrl: string;
}

export interface ArrangementDTO {
  front: CardId[];
  middle: CardId[];
  back: CardId[];
}

/** Sent only to the owner of the cards. */
export interface PrivateHand {
  roundNumber: number;
  dealtCards: CardId[];
  arrangement: ArrangementDTO;
  isConfirmed: boolean;
  isAutoSubmitted: boolean;
}

export interface SessionRestoredPayload extends JoinedPayload {
  privateHand: PrivateHand | null;
  lastRoundResult: RoundResult | null;
}

export interface HandRankingDTO {
  category: number;
  name: string;
  isRoyal: boolean;
}

/** Revealed only once the room reaches REVEALING. */
export interface RevealedHand {
  playerId: string;
  arrangement: ArrangementDTO;
  rankings: Record<Row, HandRankingDTO>;
  isFoul: boolean;
  foulReasons: FoulReason[];
  isAutoSubmitted: boolean;
  royalty: { front: number; middle: number; back: number; total: number };
}

export interface RoundResult {
  roundNumber: number;
  hands: RevealedHand[];
  pairwise: PairwiseResult[];
  scores: Record<string, PlayerRoundScore>;
  totals: Record<string, number>;
}

export interface LeaderboardEntry {
  rank: number;
  /** True when another player has the same total (shared rank). */
  tied: boolean;
  playerId: string;
  displayName: string;
  avatar: AvatarId;
  currentRoundScore: number;
  totalScore: number;
  scoopCount: number;
  foulCount: number;
}

export interface GameFinishedPayload {
  leaderboard: LeaderboardEntry[];
  winnerIds: string[];
  roundsPlayed: number;
}

export type ReactionKind = "emoji" | "quick";

export interface ReactionPayload {
  playerId: string;
  kind: ReactionKind;
  value: string;
  at: number;
}
