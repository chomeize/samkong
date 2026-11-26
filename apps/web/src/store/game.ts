import { create } from "zustand";
import type {
  ArrangementDTO,
  AvatarId,
  GameFinishedPayload,
  JoinedPayload,
  LeaderboardEntry,
  PrivateHand,
  PublicRoom,
  ReactionKind,
  RoomSettings,
  RoundResult,
  ServerInfo,
  SessionInfo,
} from "@sam-kong/protocol";
import { ActionError, call, socket } from "../lib/socket";
import { sound } from "../lib/sound";
import { tap } from "../lib/haptics";
import { ownerKeyStore, sessionStore } from "../lib/session";
import { emptyDraft, sanitizeDraft } from "../lib/arrange";
import { t } from "../i18n";

export interface Toast {
  id: number;
  text: string;
  tone: "info" | "error" | "success";
}

export interface LiveReaction {
  id: number;
  playerId: string;
  kind: ReactionKind;
  value: string;
}

interface GameState {
  connected: boolean;
  /** True while a saved session is being restored after load or a network drop. */
  restoring: boolean;
  session: SessionInfo | null;
  room: PublicRoom | null;
  hand: PrivateHand | null;
  draft: ArrangementDTO;
  result: RoundResult | null;
  finished: GameFinishedPayload | null;
  leaderboard: LeaderboardEntry[];
  toasts: Toast[];
  /** serverNow − Date.now(), so every phone shows the same countdown despite clock skew. */
  clockOffset: number;
  reactions: LiveReaction[];
  soundOn: boolean;
  /** What the server requires (owner key for creating rooms, host approval for joining). */
  serverInfo: ServerInfo | null;
  /** This device's saved owner key, if the site owner entered it here. */
  ownerKey: string | null;
  /** Waiting at a room's door for the host to allow us in. */
  pendingJoin: { roomCode: string; roomName: string } | null;

  toast(text: string, tone?: Toast["tone"]): void;
  /** Check an owner key with the server and remember it on this device. */
  saveOwnerKey(key: string): Promise<void>;
  forgetOwnerKey(): void;
  cancelJoin(): Promise<void>;
  respondJoin(requestId: string, approve: boolean): Promise<void>;
  toggleSound(): void;
  sendReaction(kind: ReactionKind, value: string): Promise<void>;
  /** Save the draft right now (used just before the arrangement deadline). */
  flushDraft(): void;
  dismissToast(id: number): void;
  createRoom(p: { displayName: string; avatar: AvatarId; roomName?: string; settings: Partial<RoomSettings> }): Promise<void>;
  joinRoom(p: { roomCode: string; displayName: string; avatar: AvatarId }): Promise<void>;
  restore(token: string): Promise<boolean>;
  leave(): Promise<void>;
  setReady(ready: boolean): Promise<void>;
  updateSettings(p: { roomName?: string; settings?: Partial<RoomSettings> }): Promise<void>;
  kick(playerId: string): Promise<void>;
  start(): Promise<void>;
  setDraft(d: ArrangementDTO): void;
  confirm(acceptFoul: boolean): Promise<void>;
  /** Take back a confirmation to keep swapping (only while the round is still open). */
  unconfirm(): Promise<void>;
  nextRound(): Promise<void>;
  endGame(): Promise<void>;
  playAgain(): Promise<void>;
  backToLobby(): Promise<void>;
  reset(): void;
}

let toastId = 0;
let draftTimer: ReturnType<typeof setTimeout> | undefined;

export const useGame = create<GameState>((set, get) => {
  const fail = (e: unknown) => {
    get().toast(e instanceof ActionError ? e.message : t.common.error, "error");
    throw e;
  };
  /** Run an action; show the server's Thai error message as a toast on failure. */
  const act = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      return fail(e);
    }
  };

  const enterRoom = (j: JoinedPayload) => {
    sessionStore.save(j.session);
    set({ session: j.session, room: j.room });
  };

  return {
    connected: socket.connected,
    restoring: false,
    session: null,
    room: null,
    hand: null,
    draft: emptyDraft(),
    result: null,
    finished: null,
    leaderboard: [],
    toasts: [],
    clockOffset: 0,
    reactions: [],
    soundOn: sound.isOn(),
    serverInfo: null,
    ownerKey: ownerKeyStore.get(),
    pendingJoin: null,

    saveOwnerKey: (key) =>
      act(async () => {
        const k = key.trim();
        await call("verify_owner_key", { ownerKey: k });
        ownerKeyStore.save(k);
        set({ ownerKey: k });
      }),
    forgetOwnerKey() {
      ownerKeyStore.save(null);
      set({ ownerKey: null });
    },
    cancelJoin: async () => {
      set({ pendingJoin: null });
      await call("cancel_join_request", {}).catch(() => {});
    },
    respondJoin: (requestId, approve) => act(async () => void (await call("respond_join_request", { requestId, approve }))),

    toggleSound() {
      const on = !get().soundOn;
      sound.setOn(on);
      set({ soundOn: on });
    },
    sendReaction: (kind, value) => act(async () => void (await call("send_reaction", { kind, value }))),
    flushDraft() {
      clearTimeout(draftTimer);
      const { hand, draft } = get();
      if (hand && !hand.isConfirmed) call("update_arrangement", draft).catch(() => {});
    },

    toast(text, tone = "info") {
      const id = ++toastId;
      set((s) => ({ toasts: [...s.toasts.slice(-2), { id, text, tone }] }));
      setTimeout(() => get().dismissToast(id), 3200);
    },
    dismissToast(id) {
      set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
    },

    createRoom: (p) =>
      act(async () => {
        try {
          enterRoom(await call("create_room", { ...p, ownerKey: get().ownerKey ?? undefined }));
        } catch (e) {
          // A saved key that no longer matches (the owner changed it): forget it on this device.
          if (e instanceof ActionError && e.payload.code === "OWNER_KEY_INVALID") get().forgetOwnerKey();
          throw e;
        }
      }),
    /** Knock on a room's door; enter at once if the server doesn't require approval. */
    joinRoom: (p) =>
      act(async () => {
        const r = await call("request_join", p);
        if (r.status === "joined") enterRoom(r.joined);
        else set({ pendingJoin: { roomCode: r.roomCode, roomName: r.roomName } });
      }),

    async restore(token) {
      set({ restoring: true });
      try {
        const r = await call("reconnect_player", { sessionToken: token });
        sessionStore.save(r.session);
        set({
          session: r.session,
          room: r.room,
          hand: r.privateHand,
          draft: r.privateHand ? sanitizeDraft(r.privateHand.arrangement, r.privateHand.dealtCards) : emptyDraft(),
          result: r.lastRoundResult,
          finished: null,
        });
        return true;
      } catch (e) {
        if (e instanceof ActionError && e.payload.code === "INVALID_SESSION") {
          sessionStore.clear();
          get().reset();
        }
        return false;
      } finally {
        set({ restoring: false });
      }
    },

    leave: () =>
      act(async () => {
        await call("leave_room", {});
        sessionStore.clear();
        get().reset();
      }),
    setReady: (ready) => act(async () => void (await call("player_ready", { ready }))),
    updateSettings: (p) => act(async () => set({ room: await call("update_room_settings", p) })),
    kick: (playerId) => act(async () => void (await call("kick_player", { playerId }))),
    start: () => act(async () => void (await call("start_game", {}))),

    setDraft(d) {
      set({ draft: d });
      // Save drafts to the server shortly after changes, so a refresh brings them back.
      clearTimeout(draftTimer);
      draftTimer = setTimeout(() => {
        const { hand } = get();
        if (hand && !hand.isConfirmed) call("update_arrangement", get().draft).catch(() => {});
      }, 400);
    },
    confirm: (acceptFoul) =>
      act(async () => {
        clearTimeout(draftTimer);
        await call("confirm_hand", { arrangement: get().draft, acceptFoul });
        sound.play("confirm");
        const { hand } = get();
        if (hand) set({ hand: { ...hand, isConfirmed: true, arrangement: get().draft } });
      }),
    unconfirm: () =>
      act(async () => {
        const hand = await call("unconfirm_hand", {});
        set({ hand, draft: sanitizeDraft(hand.arrangement, hand.dealtCards) });
      }),
    nextRound: () => act(async () => void (await call("next_round", {}))),
    endGame: () => act(async () => void (await call("end_game", {}))),
    playAgain: () => act(async () => void (await call("play_again", {}))),
    backToLobby: () => act(async () => void (await call("back_to_lobby", {}))),

    reset() {
      clearTimeout(draftTimer);
      set({ session: null, room: null, hand: null, draft: emptyDraft(), result: null, finished: null, leaderboard: [] });
    },
  };
});

// ---------- server → client events ----------

socket.on("connect", () => {
  useGame.setState({ connected: true });
  call("server_info", {})
    .then((serverInfo) => useGame.setState({ serverInfo }))
    .catch(() => {});
  // After a network drop the server sees a new socket: re-bind it to our session.
  const s = useGame.getState().session ?? sessionStore.getTab();
  if (s && useGame.getState().room) void useGame.getState().restore(s.sessionToken);
});
socket.on("disconnect", () => {
  // The server drops a waiting request when the connection goes; ask the visitor to knock again.
  if (useGame.getState().pendingJoin) {
    useGame.setState({ pendingJoin: null });
    useGame.getState().toast(t.access.requestLost, "error");
  }
  useGame.setState({ connected: false });
});

socket.on("join_approved", (joined) => {
  sessionStore.save(joined.session);
  useGame.setState({ session: joined.session, room: joined.room, pendingJoin: null });
  useGame.getState().toast(t.access.approved, "success");
  sound.play("confirm");
});

socket.on("join_denied", ({ reason }) => {
  useGame.setState({ pendingJoin: null });
  useGame.getState().toast(t.access.denied[reason], "error");
});

/** Request ids the host has already been alerted about, so each knock rings once. */
const announcedRequests = new Set<string>();

socket.on("room_updated", (room) => {
  const { session } = useGame.getState();
  if (!session || room.roomCode !== session.roomCode) return;
  // Host: ring and buzz when someone new knocks.
  if (room.hostPlayerId === session.playerId) {
    for (const r of room.joinRequests) {
      if (announcedRequests.has(r.requestId)) continue;
      announcedRequests.add(r.requestId);
      useGame.getState().toast(t.access.knocked(r.displayName));
      sound.play("reaction");
      tap(40);
    }
  }
  const patch: Partial<GameState> = { room, clockOffset: room.serverNow - Date.now() };
  if (room.gameState === "LOBBY") Object.assign(patch, { hand: null, result: null, finished: null, draft: emptyDraft() });
  useGame.setState(patch);
});

socket.on("cards_dealt", (hand) => {
  useGame.setState({ hand, draft: sanitizeDraft(hand.arrangement, hand.dealtCards), result: null, finished: null });
  sound.play("deal");
});

socket.on("arrangement_updated", (hand) => {
  const wasOpen = useGame.getState().hand?.isConfirmed === false;
  useGame.setState({ hand, draft: sanitizeDraft(hand.arrangement, hand.dealtCards) });
  if (wasOpen && hand.isAutoSubmitted) useGame.getState().toast(t.game.timeUpAuto, "info");
});

socket.on("timer_updated", ({ deadlineAt, serverNow }) => {
  const { room } = useGame.getState();
  useGame.setState({ clockOffset: serverNow - Date.now(), ...(room ? { room: { ...room, deadlineAt } } : {}) });
});

socket.on("hand_confirmed", ({ playerId }) => {
  if (playerId !== useGame.getState().session?.playerId) sound.play("tick");
});

// The result table plays flip and win/lose sounds itself, in step with its reveal.
socket.on("round_result", (result) => useGame.setState({ result }));

let reactionId = 0;
socket.on("reaction_received", ({ playerId, kind, value }) => {
  const id = ++reactionId;
  useGame.setState((s) => ({ reactions: [...s.reactions.slice(-4), { id, playerId, kind, value }] }));
  sound.play("reaction");
  setTimeout(() => useGame.setState((s) => ({ reactions: s.reactions.filter((r) => r.id !== id) })), 3200);
});
socket.on("leaderboard_updated", ({ leaderboard }) => useGame.setState({ leaderboard }));
socket.on("game_finished", (finished) => {
  useGame.setState({ finished, leaderboard: finished.leaderboard });
  const me = useGame.getState().session?.playerId;
  setTimeout(() => sound.play(me && finished.winnerIds.includes(me) ? "scoop" : "win"), 600);
});

socket.on("player_left", ({ playerId, reason }) => {
  const { session, toast, reset } = useGame.getState();
  if (session?.playerId === playerId && reason === "kicked") {
    sessionStore.clear();
    reset();
    toast(t.room.kicked, "error");
  }
});

socket.on("error", (err) => {
  const { toast, reset } = useGame.getState();
  if (err.code === "SESSION_REPLACED") {
    reset();
    toast(t.room.replaced, "error");
    return;
  }
  toast(err.message, "error");
});
