import type { AvatarId } from "./avatars.js";
import type {
  ArrangementDTO,
  GameFinishedPayload,
  JoinDeniedPayload,
  JoinedPayload,
  RequestJoinResult,
  ServerInfo,
  LeaderboardEntry,
  PrivateHand,
  PublicPlayer,
  PublicRoom,
  ReactionKind,
  ReactionPayload,
  RevealedHand,
  RoundResult,
  SessionRestoredPayload,
} from "./dto.js";
import type { ErrorPayload } from "./errors.js";
import type { RoomSettings } from "./settings.js";
import type { ConnectionStatus, PlayerState } from "./states.js";

/** Every client action is acknowledged with either data or an error. */
export type Ack<T = null> = { ok: true; data: T } | { ok: false; error: ErrorPayload };
export type AckFn<T = null> = (res: Ack<T>) => void;

// ---------- client → server payloads ----------

export interface CreateRoomPayload {
  displayName: string;
  avatar: AvatarId;
  roomName?: string;
  settings?: Partial<RoomSettings>;
  /** Required when the server has an owner key set. */
  ownerKey?: string;
}

export interface OwnerKeyPayload {
  ownerKey: string;
}

export interface RespondJoinPayload {
  requestId: string;
  approve: boolean;
}

export interface JoinRoomPayload {
  roomCode: string;
  displayName: string;
  avatar: AvatarId;
}

export interface ReadyPayload {
  ready: boolean;
}

export interface UpdateRoomSettingsPayload {
  roomName?: string;
  settings?: Partial<RoomSettings>;
}

export interface KickPlayerPayload {
  playerId: string;
}

export interface ConfirmHandPayload {
  arrangement: ArrangementDTO;
  /** Must be true to confirm a fouled arrangement (after the client's foul warning). */
  acceptFoul: boolean;
}

export interface ReconnectPayload {
  sessionToken: string;
}

export interface SendReactionPayload {
  kind: ReactionKind;
  value: string;
}

export type EmptyPayload = Record<string, never>;

export interface ClientToServerEvents {
  server_info: (p: EmptyPayload, ack: AckFn<ServerInfo>) => void;
  verify_owner_key: (p: OwnerKeyPayload, ack: AckFn) => void;
  create_room: (p: CreateRoomPayload, ack: AckFn<JoinedPayload>) => void;
  /** Direct join; only allowed when the server doesn't require host approval. */
  join_room: (p: JoinRoomPayload, ack: AckFn<JoinedPayload>) => void;
  /** Knock to join: joins at once without approval, otherwise waits for the host. */
  request_join: (p: JoinRoomPayload, ack: AckFn<RequestJoinResult>) => void;
  cancel_join_request: (p: EmptyPayload, ack: AckFn) => void;
  respond_join_request: (p: RespondJoinPayload, ack: AckFn) => void;
  leave_room: (p: EmptyPayload, ack: AckFn) => void;
  player_ready: (p: ReadyPayload, ack: AckFn) => void;
  update_room_settings: (p: UpdateRoomSettingsPayload, ack: AckFn<PublicRoom>) => void;
  kick_player: (p: KickPlayerPayload, ack: AckFn) => void;
  /** Host-only, in the lobby: seat a computer player (remove it with kick_player). */
  add_bot: (p: EmptyPayload, ack: AckFn<PublicRoom>) => void;
  start_game: (p: EmptyPayload, ack: AckFn) => void;
  update_arrangement: (p: ArrangementDTO, ack: AckFn) => void;
  request_auto_arrange: (p: EmptyPayload, ack: AckFn<ArrangementDTO>) => void;
  confirm_hand: (p: ConfirmHandPayload, ack: AckFn) => void;
  /** Take a confirmation back to keep arranging, while the round is still open. */
  unconfirm_hand: (p: EmptyPayload, ack: AckFn<PrivateHand>) => void;
  next_round: (p: EmptyPayload, ack: AckFn) => void;
  end_game: (p: EmptyPayload, ack: AckFn) => void;
  play_again: (p: EmptyPayload, ack: AckFn) => void;
  back_to_lobby: (p: EmptyPayload, ack: AckFn) => void;
  reconnect_player: (p: ReconnectPayload, ack: AckFn<SessionRestoredPayload>) => void;
  send_reaction: (p: SendReactionPayload, ack: AckFn) => void;
}

// ---------- server → client payloads ----------

export interface PlayerLeftPayload {
  playerId: string;
  reason: "left" | "kicked" | "expired";
}

export interface PlayerStatusPayload {
  playerId: string;
  playerState: PlayerState;
  connectionStatus: ConnectionStatus;
}

export interface TimerPayload {
  deadlineAt: number | null;
  serverNow: number;
}

export interface HandConfirmedPayload {
  playerId: string;
  auto: boolean;
  confirmedCount: number;
  totalPlayers: number;
}

export interface CardsRevealedPayload {
  roundNumber: number;
  hands: RevealedHand[];
}

export interface ServerToClientEvents {
  room_created: (p: JoinedPayload) => void;
  join_approved: (p: JoinedPayload) => void;
  join_denied: (p: JoinDeniedPayload) => void;
  room_updated: (p: PublicRoom) => void;
  player_joined: (p: { player: PublicPlayer }) => void;
  player_left: (p: PlayerLeftPayload) => void;
  game_started: (p: { roundNumber: number }) => void;
  cards_dealt: (p: PrivateHand) => void;
  arrangement_updated: (p: PrivateHand) => void;
  player_status_updated: (p: PlayerStatusPayload) => void;
  timer_updated: (p: TimerPayload) => void;
  hand_confirmed: (p: HandConfirmedPayload) => void;
  cards_revealed: (p: CardsRevealedPayload) => void;
  round_result: (p: RoundResult) => void;
  leaderboard_updated: (p: { leaderboard: LeaderboardEntry[] }) => void;
  game_finished: (p: GameFinishedPayload) => void;
  session_restored: (p: SessionRestoredPayload) => void;
  reaction_received: (p: ReactionPayload) => void;
  error: (p: ErrorPayload) => void;
}
