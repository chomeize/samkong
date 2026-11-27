import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer, type Server as HttpServer } from "node:http";
import path from "node:path";
import type { AddressInfo } from "node:net";
import express from "express";
import { Server, type Socket } from "socket.io";
import { z } from "zod";
import {
  DEFAULT_ROOM_SETTINGS,
  isAvatarId,
  isValidReaction,
  parseRoomSettings,
  type AckFn,
  type AvatarId,
  type ClientToServerEvents,
  type JoinDeniedPayload,
  type JoinedPayload,
  type PlayerLeftPayload,
  type ServerToClientEvents,
  type SessionRestoredPayload,
} from "@sam-kong/protocol";
import { autoArrange, type RandomInt } from "@sam-kong/engine";
import type { ServerConfig } from "./config.js";
import { RateLimiter } from "./rateLimit.js";
import { Room, toDTO, type PlayerRecord, type RoundOutcome } from "./room.js";
import { InMemoryRoomStore, type RoomStore } from "./store.js";
import { RoomTimers } from "./timers.js";
import {
  cleanNickname,
  cleanRoomName,
  GameError,
  generatePlayerId,
  generateRoomCode,
  generateSessionToken,
  normalizeRoomCode,
} from "./util.js";

interface SocketData {
  ip: string;
  roomCode?: string;
  playerId?: string;
  /** Set while this socket is waiting for a host to allow it into a room. */
  pendingJoin?: { roomCode: string; requestId: string };
}

type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type AckDataOf<E extends keyof ClientToServerEvents> =
  Parameters<ClientToServerEvents[E]>[1] extends AckFn<infer T> ? T : never;

export interface GameServer {
  httpServer: HttpServer;
  io: IO;
  store: RoomStore;
  listen(port?: number): Promise<number>;
  close(): Promise<void>;
}

export interface GameServerOptions {
  store?: RoomStore;
  now?: () => number;
  /** Shuffle source; defaults to the engine's crypto-backed secure random. Tests may inject a seeded one. */
  randomInt?: RandomInt;
}

// ---------- payload schemas (untrusted input) ----------
const avatarSchema = z.string().refine(isAvatarId);
const createRoomSchema = z.object({
  displayName: z.string(),
  avatar: z.string(),
  roomName: z.string().optional(),
  settings: z.record(z.unknown()).optional(),
  ownerKey: z.string().max(200).optional(),
});
const joinRoomSchema = z.object({ roomCode: z.string(), displayName: z.string(), avatar: z.string() });
const ownerKeySchema = z.object({ ownerKey: z.string().max(200) });
const respondJoinSchema = z.object({ requestId: z.string().max(64), approve: z.boolean() });

/** Constant-time comparison, so response timing doesn't leak how much of the key matched. */
function keyMatches(given: string | undefined, expected: string): boolean {
  const a = createHash("sha256").update(given ?? "").digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
const readySchema = z.object({ ready: z.boolean() });
const updateSettingsSchema = z.object({
  roomName: z.string().optional(),
  settings: z.record(z.unknown()).optional(),
});
const kickSchema = z.object({ playerId: z.string().max(64) });
const cardIds = z.array(z.string().max(3)).max(5);
const arrangementSchema = z.object({ front: cardIds, middle: cardIds, back: cardIds });
const confirmSchema = z.object({ arrangement: arrangementSchema, acceptFoul: z.boolean() });
const reconnectSchema = z.object({ sessionToken: z.string().min(1).max(128) });
const reactionSchema = z
  .object({ kind: z.enum(["emoji", "quick"]), value: z.string().max(16) })
  .refine((r) => isValidReaction(r.kind, r.value));

function parse<T>(schema: z.ZodType<T>, payload: unknown): T {
  const r = schema.safeParse(payload ?? {});
  if (!r.success) throw new GameError("INVALID_PAYLOAD");
  return r.data;
}

const roomChannel = (code: string) => `room:${code}`;

export function createGameServer(config: ServerConfig, options: GameServerOptions = {}): GameServer {
  const now = options.now ?? Date.now;
  const store = options.store ?? new InMemoryRoomStore();
  const timers = new RoomTimers();
  const createLimiter = new RateLimiter(config.rateLimits.createRoom.capacity, config.rateLimits.createRoom.refillPerMinute, now);
  const joinLimiter = new RateLimiter(config.rateLimits.joinRoom.capacity, config.rateLimits.joinRoom.refillPerMinute, now);
  const eventLimiter = new RateLimiter(config.rateLimits.socketEvents.capacity, config.rateLimits.socketEvents.refillPerMinute, now);
  const reactionLimiter = new RateLimiter(config.rateLimits.reactions.capacity, config.rateLimits.reactions.refillPerMinute, now);
  /** Guessing the owner key: 5 tries, then 5 more per minute, per IP. */
  const ownerKeyLimiter = new RateLimiter(5, 5, now);

  const app = express();
  app.set("trust proxy", config.trustProxy);
  app.disable("x-powered-by");
  app.get("/health", (_req, res) => {
    res.json({ ok: true, rooms: store.roomCount() });
  });

  // Production: this server also serves the built website, so the game is one URL.
  const indexHtml = path.join(config.webDistDir, "index.html");
  if (existsSync(indexHtml)) {
    app.use(
      express.static(config.webDistDir, {
        index: false,
        setHeaders(res, filePath) {
          // Hashed bundles never change; everything else is revalidated.
          res.setHeader("Cache-Control", filePath.includes(`${path.sep}assets${path.sep}`) ? "public, max-age=31536000, immutable" : "no-cache");
        },
      }),
    );
    // Single-page app: /join/ABC123, /room/ABC123 etc. all load index.html.
    app.get(/^\/(?!socket\.io\/|health$).*/, (_req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(indexHtml);
    });
  }

  const httpServer = createServer(app);
  const io: IO = new Server(httpServer, {
    cors: { origin: config.corsOrigins, methods: ["GET", "POST"] },
    maxHttpBufferSize: 16 * 1024,
    pingInterval: 10_000,
    pingTimeout: 8_000,
  });

  // ---------- helpers ----------
  const inviteUrl = (code: string) => `${config.publicWebUrl}/join/${code}`;

  const broadcastRoom = (room: Room) => {
    io.to(roomChannel(room.roomCode)).emit("room_updated", room.toPublic(now()));
  };

  const broadcastStatus = (room: Room, p: PlayerRecord) => {
    io.to(roomChannel(room.roomCode)).emit("player_status_updated", {
      playerId: p.playerId,
      playerState: p.playerState,
      connectionStatus: p.connectionStatus,
    });
  };

  const bindSocket = (socket: GameSocket, room: Room, playerId: string) => {
    socket.data.roomCode = room.roomCode;
    socket.data.playerId = playerId;
    void socket.join(roomChannel(room.roomCode));
  };

  const unbindSocket = (socket: GameSocket | undefined, roomCode: string) => {
    if (!socket) return;
    void socket.leave(roomChannel(roomCode));
    delete socket.data.roomCode;
    delete socket.data.playerId;
  };

  /** Turn away everyone still waiting to join this room, telling each one why. */
  const denyAllRequests = (room: Room, reason: JoinDeniedPayload["reason"]) => {
    for (const req of room.joinRequests.values()) {
      const s = io.sockets.sockets.get(req.socketId);
      if (s) {
        delete s.data.pendingJoin;
        s.emit("join_denied", { reason });
      }
    }
    room.joinRequests.clear();
  };

  const deleteRoom = (code: string) => {
    const room = store.getRoom(code);
    if (room) denyAllRequests(room, "room_closed");
    timers.clearRoom(code);
    store.deleteRoom(code);
  };

  /** Seat a socket in a room as a new player (direct join, or once the host allows a request). */
  const addToRoom = (sock: GameSocket, room: Room, displayName: string, avatar: AvatarId): JoinedPayload => {
    const playerId = generatePlayerId();
    const sessionToken = generateSessionToken();
    const record = room.addPlayer({ playerId, displayName, avatar, sessionToken, socketId: sock.id }, now());
    store.saveSession(sessionToken, { roomCode: room.roomCode, playerId });
    timers.clear(room.roomCode, "idle");
    sock.to(roomChannel(room.roomCode)).emit("player_joined", { player: room.toPublicPlayer(record) });
    bindSocket(sock, room, playerId);
    broadcastRoom(room);
    return { session: { sessionToken, playerId, roomCode: room.roomCode }, room: room.toPublic(now()), inviteUrl: inviteUrl(room.roomCode) };
  };

  /** A socket stops waiting (cancelled, disconnected, or joining somewhere else). */
  const dropPendingJoin = (sock: GameSocket) => {
    const pending = sock.data.pendingJoin;
    if (!pending) return;
    delete sock.data.pendingJoin;
    const room = store.getRoom(pending.roomCode);
    if (room?.joinRequests.delete(pending.requestId)) broadcastRoom(room);
  };

  /**
   * Every in-room action goes through here: the socket must be bound to a live
   * session and be that player's current socket (the token was verified at bind time).
   */
  const requireSession = (socket: GameSocket) => {
    const { roomCode, playerId } = socket.data;
    if (!roomCode || !playerId) throw new GameError("NOT_IN_ROOM");
    const room = store.getRoom(roomCode);
    const player = room?.players.get(playerId);
    if (!room || !player) {
      unbindSocket(socket, roomCode);
      throw new GameError("INVALID_SESSION");
    }
    if (player.socketId !== socket.id) throw new GameError("SESSION_REPLACED");
    return { room, player };
  };

  const scheduleHostTransfer = (room: Room) => {
    timers.set(room.roomCode, "host", config.hostGraceMs, () => {
      const r = store.getRoom(room.roomCode);
      if (!r) return;
      const host = r.players.get(r.hostPlayerId);
      if (host && host.connectionStatus === "ONLINE") return;
      const before = r.hostPlayerId;
      r.transferHost();
      if (r.hostPlayerId !== before) broadcastRoom(r);
    });
  };

  const scheduleIdleExpiry = (room: Room) => {
    timers.set(room.roomCode, "idle", config.roomIdleTtlMs, () => {
      const r = store.getRoom(room.roomCode);
      if (r && !r.anyoneOnline()) deleteRoom(r.roomCode);
    });
  };

  /** Remove a player from a LOBBY room and tell everyone. Deletes the room when it empties. */
  const removeFromRoom = (room: Room, player: PlayerRecord, reason: PlayerLeftPayload["reason"]) => {
    const targetSocket = player.socketId ? io.sockets.sockets.get(player.socketId) : undefined;
    if (reason === "kicked") targetSocket?.emit("player_left", { playerId: player.playerId, reason });
    store.deleteSession(player.sessionToken);
    unbindSocket(targetSocket, room.roomCode);
    // A room with nobody left but bots has no one to play for.
    if (!room.hasHumans()) {
      deleteRoom(room.roomCode);
      return;
    }
    io.to(roomChannel(room.roomCode)).emit("player_left", { playerId: player.playerId, reason });
    broadcastRoom(room);
  };

  /** New round dealt: everyone hears the round started; each player gets only their own cards. */
  const emitDeal = (room: Room, dealt: boolean) => {
    if (dealt && room.round) {
      startRoundTimers(room);
      io.to(roomChannel(room.roomCode)).emit("game_started", { roundNumber: room.round.roundNumber });
      for (const id of room.round.participants) {
        const p = room.players.get(id);
        const hand = room.privateHandFor(id);
        if (p?.socketId && hand) io.to(p.socketId).emit("cards_dealt", hand);
        if (p?.isBot) scheduleBotTurn(room, id);
      }
    }
    broadcastRoom(room);
  };

  /**
   * A bot "thinks" for a few seconds, then confirms an auto-arranged hand (never a foul).
   * It always finishes before the arrangement deadline.
   */
  const scheduleBotTurn = (room: Room, botId: string) => {
    const { min, max } = config.botDelayMs;
    let delay = min + Math.floor(Math.random() * Math.max(1, max - min));
    if (room.deadlineAt) delay = Math.max(0, Math.min(delay, room.deadlineAt - now() - 1000));
    const code = room.roomCode;
    const roundNumber = room.round?.roundNumber;
    timers.set(code, `bot:${botId}`, delay, () => {
      const r = store.getRoom(code);
      const hand = r?.round?.hands.get(botId);
      if (!r || !hand || hand.confirmed || r.round?.roundNumber !== roundNumber) return;
      try {
        const outcome = r.confirmHand(botId, toDTO(autoArrange(hand.dealt)), true, now());
        emitConfirmed(r, botId, false);
        emitReveal(r, outcome);
      } catch (err) {
        if (!(err instanceof GameError)) console.error("[bot]", err);
      }
    });
  };

  /** Auto-submitted players: tell the room, and give each player their final (possibly auto-arranged) hand. */
  const emitAutoSubmitted = (room: Room, ids: string[], outcome: RoundOutcome | null) => {
    for (const id of ids) {
      emitConfirmed(room, id, true);
      const p = room.players.get(id);
      const hand = room.privateHandFor(id);
      if (p?.socketId && hand) io.to(p.socketId).emit("arrangement_updated", hand);
    }
    emitReveal(room, outcome);
  };

  /**
   * Arrangement timer (FR-10). The deadline shown to players is `deadlineAt`; the server
   * fires a little later (deadlineGraceMs) so a confirm sent at the last second still counts.
   * With Unlimited time, players who are already offline get the offline auto-submit instead.
   */
  const startRoundTimers = (room: Room) => {
    const code = room.roomCode;
    timers.clear(code, "deadline");
    const limit = room.settings.arrangementTimeLimit;
    if (limit) {
      const ms = limit * config.secondMs;
      room.deadlineAt = now() + ms;
      timers.set(code, "deadline", ms + config.deadlineGraceMs, () => {
        const r = store.getRoom(code);
        if (!r) return;
        const { autoIds, outcome } = r.expireDeadline(now());
        if (autoIds.length) emitAutoSubmitted(r, autoIds, outcome);
      });
    } else {
      room.deadlineAt = null;
      for (const p of room.players.values()) if (p.connectionStatus === "OFFLINE") scheduleOfflineAutoSubmit(room, p.playerId);
    }
    io.to(roomChannel(code)).emit("timer_updated", { deadlineAt: room.deadlineAt, serverNow: now() });
  };

  /** Unlimited time only: a player offline for offlineAutoSubmitMs is auto-submitted so the game can't stall (FR-16). */
  const scheduleOfflineAutoSubmit = (room: Room, playerId: string) => {
    if (room.settings.arrangementTimeLimit !== null) return;
    if (!room.pendingPlayers().includes(playerId)) return;
    const code = room.roomCode;
    timers.set(code, `offline:${playerId}`, config.offlineAutoSubmitMs, () => {
      const r = store.getRoom(code);
      const p = r?.players.get(playerId);
      if (!r || !p || p.connectionStatus !== "OFFLINE" || !r.pendingPlayers().includes(playerId)) return;
      emitAutoSubmitted(r, [playerId], r.autoSubmit(playerId, now()));
    });
  };

  const emitConfirmed = (room: Room, playerId: string, auto: boolean) => {
    io.to(roomChannel(room.roomCode)).emit("hand_confirmed", {
      playerId,
      auto,
      confirmedCount: room.confirmedCount(),
      totalPlayers: room.round?.participants.length ?? 0,
    });
    const p = room.players.get(playerId);
    if (p) broadcastStatus(room, p);
  };

  /** Cards leave the server for other players only here, after every hand is confirmed. */
  const emitReveal = (room: Room, outcome: RoundOutcome | null) => {
    if (outcome) {
      timers.clear(room.roomCode, "deadline");
      io.to(roomChannel(room.roomCode)).emit("timer_updated", { deadlineAt: null, serverNow: now() });
      const channel = io.to(roomChannel(room.roomCode));
      channel.emit("cards_revealed", { roundNumber: outcome.result.roundNumber, hands: outcome.result.hands });
      channel.emit("round_result", outcome.result);
      channel.emit("leaderboard_updated", { leaderboard: room.leaderboard() });
      if (outcome.finished) channel.emit("game_finished", room.finishedPayload());
    }
    broadcastRoom(room);
  };

  const clientIp = (socket: GameSocket) => {
    if (config.trustProxy) {
      const fwd = socket.handshake.headers["x-forwarded-for"];
      const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0]?.trim();
      if (first) return first;
    }
    return socket.handshake.address;
  };

  // ---------- connection ----------
  io.on("connection", (socket: GameSocket) => {
    socket.data.ip = clientIp(socket);

    const register = <E extends keyof ClientToServerEvents>(event: E, handler: (payload: unknown) => AckDataOf<E>) => {
      const listener = (payload: unknown, ack: unknown) => {
        const reply = (typeof ack === "function" ? ack : () => {}) as AckFn<AckDataOf<E>>;
        if (!eventLimiter.take(socket.id)) {
          reply({ ok: false, error: new GameError("RATE_LIMITED").toPayload() });
          return;
        }
        try {
          reply({ ok: true, data: handler(payload) });
        } catch (err) {
          if (err instanceof GameError) {
            reply({ ok: false, error: err.toPayload() });
          } else {
            console.error(`[${event}]`, err);
            reply({ ok: false, error: new GameError("INTERNAL").toPayload() });
          }
        }
      };
      // Socket.IO's typed `on` can't express a generic event name; the listener shape matches every event.
      (socket as unknown as { on(ev: string, fn: typeof listener): void }).on(event, listener);
    };

    register("server_info", () => ({
      ownerKeyRequired: config.ownerKey !== null,
      joinApproval: config.joinApproval,
    }));

    register("verify_owner_key", (payload) => {
      if (!ownerKeyLimiter.take(socket.data.ip)) throw new GameError("RATE_LIMITED");
      const { ownerKey } = parse(ownerKeySchema, payload);
      if (config.ownerKey !== null && !keyMatches(ownerKey, config.ownerKey)) throw new GameError("OWNER_KEY_INVALID");
      return null;
    });

    register("create_room", (payload) => {
      if (!createLimiter.take(socket.data.ip)) throw new GameError("RATE_LIMITED");
      if (socket.data.roomCode) throw new GameError("ALREADY_IN_ROOM");
      const p = parse(createRoomSchema, payload);
      // Only the site owner may open rooms when an owner key is configured.
      if (config.ownerKey !== null) {
        if (!p.ownerKey) throw new GameError("OWNER_KEY_REQUIRED");
        if (!keyMatches(p.ownerKey, config.ownerKey)) throw new GameError("OWNER_KEY_INVALID");
      }
      dropPendingJoin(socket);
      const displayName = cleanNickname(p.displayName);
      if (!avatarSchema.safeParse(p.avatar).success) throw new GameError("INVALID_AVATAR");
      const roomName = cleanRoomName(p.roomName, `ห้องของ ${displayName}`);
      const settings = parseRoomSettings(p.settings ?? {}, DEFAULT_ROOM_SETTINGS);
      if (!settings.ok) throw new GameError("INVALID_SETTINGS", { field: settings.field });
      if (store.roomCount() >= config.maxRooms) throw new GameError("TOO_MANY_ROOMS");

      let code = generateRoomCode();
      for (let i = 0; store.hasRoom(code); i++) {
        if (i > 50) throw new GameError("TOO_MANY_ROOMS");
        code = generateRoomCode();
      }
      const playerId = generatePlayerId();
      const sessionToken = generateSessionToken();
      const room = new Room(code, roomName, settings.value, playerId, now(), options.randomInt);
      room.addPlayer({ playerId, displayName, avatar: p.avatar as AvatarId, sessionToken, socketId: socket.id }, now());
      store.saveRoom(room);
      store.saveSession(sessionToken, { roomCode: code, playerId });
      bindSocket(socket, room, playerId);

      const joined: JoinedPayload = {
        session: { sessionToken, playerId, roomCode: code },
        room: room.toPublic(now()),
        inviteUrl: inviteUrl(code),
      };
      socket.emit("room_created", joined);
      return joined;
    });

    /** Shared checks for join_room and request_join. */
    const parseJoin = (payload: unknown) => {
      if (!joinLimiter.take(socket.data.ip)) throw new GameError("RATE_LIMITED");
      if (socket.data.roomCode) throw new GameError("ALREADY_IN_ROOM");
      const p = parse(joinRoomSchema, payload);
      const code = normalizeRoomCode(p.roomCode);
      const room = code ? store.getRoom(code) : undefined;
      if (!room) throw new GameError("ROOM_NOT_FOUND");
      const displayName = cleanNickname(p.displayName);
      if (!avatarSchema.safeParse(p.avatar).success) throw new GameError("INVALID_AVATAR");
      return { room, displayName, avatar: p.avatar as AvatarId };
    };

    register("join_room", (payload) => {
      const { room, displayName, avatar } = parseJoin(payload);
      if (config.joinApproval) throw new GameError("APPROVAL_REQUIRED");
      return addToRoom(socket, room, displayName, avatar);
    });

    register("request_join", (payload) => {
      const { room, displayName, avatar } = parseJoin(payload);
      dropPendingJoin(socket); // knocking on a new door cancels the previous knock
      if (!config.joinApproval) return { status: "joined" as const, joined: addToRoom(socket, room, displayName, avatar) };
      const requestId = "r_" + randomBytes(9).toString("base64url");
      room.addJoinRequest({ requestId, displayName, avatar, socketId: socket.id, requestedAt: now() }, config.maxJoinRequests, now());
      socket.data.pendingJoin = { roomCode: room.roomCode, requestId };
      broadcastRoom(room);
      return { status: "pending" as const, requestId, roomCode: room.roomCode, roomName: room.roomName };
    });

    register("cancel_join_request", () => {
      dropPendingJoin(socket);
      return null;
    });

    register("respond_join_request", (payload) => {
      const { requestId, approve } = parse(respondJoinSchema, payload);
      const { room, player } = requireSession(socket);
      const req = room.takeJoinRequest(player.playerId, requestId);
      const requester = io.sockets.sockets.get(req.socketId);
      if (!requester || requester.data.pendingJoin?.requestId !== requestId) {
        broadcastRoom(room);
        throw new GameError("REQUEST_NOT_FOUND");
      }
      delete requester.data.pendingJoin;
      if (!approve) {
        requester.emit("join_denied", { reason: "denied" });
        broadcastRoom(room);
        return null;
      }
      try {
        requester.emit("join_approved", addToRoom(requester, room, req.displayName, req.avatar));
      } catch (err) {
        // Full or started meanwhile: tell the requester, then report to the host.
        requester.emit("join_denied", { reason: err instanceof GameError && err.code === "ROOM_FULL" ? "room_full" : "game_started" });
        broadcastRoom(room);
        throw err;
      }
      if (room.players.size >= room.settings.maxPlayers) {
        denyAllRequests(room, "room_full");
        broadcastRoom(room);
      }
      return null;
    });

    register("leave_room", () => {
      const { room, player } = requireSession(socket);
      const wasArranging = !!room.round?.hands.get(player.playerId) && !room.round.hands.get(player.playerId)!.confirmed;
      const { removedNow, outcome } = room.leave(player.playerId, now());
      if (removedNow) {
        removeFromRoom(room, player, "left");
        return null;
      }
      // Mid-game: the player stays in this round's results and is removed at the next round boundary.
      store.deleteSession(player.sessionToken);
      unbindSocket(socket, room.roomCode);
      if (!room.hasHumans()) {
        deleteRoom(room.roomCode); // only bots left: nobody to play for
        return null;
      }
      io.to(roomChannel(room.roomCode)).emit("player_left", { playerId: player.playerId, reason: "left" });
      if (wasArranging) emitConfirmed(room, player.playerId, true);
      broadcastStatus(room, player);
      emitReveal(room, outcome);
      if (!room.anyoneOnline()) scheduleIdleExpiry(room);
      return null;
    });

    register("start_game", () => {
      const { room, player } = requireSession(socket);
      const dealt = room.startGame(player.playerId, now());
      denyAllRequests(room, "game_started");
      emitDeal(room, dealt);
      return null;
    });

    register("update_arrangement", (payload) => {
      const dto = parse(arrangementSchema, payload);
      const { room, player } = requireSession(socket);
      room.saveDraft(player.playerId, dto, now());
      return null;
    });

    register("request_auto_arrange", () => {
      const { room, player } = requireSession(socket);
      const dto = room.autoArrangeDraft(player.playerId, now());
      const hand = room.privateHandFor(player.playerId);
      if (hand) socket.emit("arrangement_updated", hand);
      return dto;
    });

    register("confirm_hand", (payload) => {
      const { arrangement, acceptFoul } = parse(confirmSchema, payload);
      const { room, player } = requireSession(socket);
      const outcome = room.confirmHand(player.playerId, arrangement, acceptFoul, now());
      emitConfirmed(room, player.playerId, false);
      emitReveal(room, outcome);
      return null;
    });

    register("unconfirm_hand", () => {
      const { room, player } = requireSession(socket);
      const hand = room.unconfirmHand(player.playerId, now());
      broadcastStatus(room, player);
      broadcastRoom(room);
      return hand;
    });

    register("next_round", () => {
      const { room, player } = requireSession(socket);
      emitDeal(room, room.nextRound(player.playerId, now()));
      return null;
    });

    register("end_game", () => {
      const { room, player } = requireSession(socket);
      room.endGame(player.playerId, now());
      io.to(roomChannel(room.roomCode)).emit("game_finished", room.finishedPayload());
      broadcastRoom(room);
      return null;
    });

    register("play_again", () => {
      const { room, player } = requireSession(socket);
      emitDeal(room, room.playAgain(player.playerId, now()));
      return null;
    });

    register("send_reaction", (payload) => {
      const { kind, value } = parse(reactionSchema, payload);
      const { room, player } = requireSession(socket);
      if (!reactionLimiter.take(player.playerId)) throw new GameError("RATE_LIMITED");
      io.to(roomChannel(room.roomCode)).emit("reaction_received", { playerId: player.playerId, kind, value, at: now() });
      return null;
    });

    register("back_to_lobby", () => {
      const { room, player } = requireSession(socket);
      room.backToLobby(player.playerId, now());
      broadcastRoom(room);
      return null;
    });

    register("player_ready", (payload) => {
      const { ready } = parse(readySchema, payload);
      const { room, player } = requireSession(socket);
      room.setReady(player.playerId, ready, now());
      broadcastStatus(room, player);
      broadcastRoom(room);
      return null;
    });

    register("update_room_settings", (payload) => {
      const p = parse(updateSettingsSchema, payload);
      const { room, player } = requireSession(socket);
      const settings = parseRoomSettings(p.settings ?? {}, room.settings);
      if (!settings.ok) throw new GameError("INVALID_SETTINGS", { field: settings.field });
      const roomName = cleanRoomName(p.roomName, room.roomName);
      room.updateSettings(player.playerId, settings.value, roomName, now());
      broadcastRoom(room);
      return room.toPublic(now());
    });

    register("add_bot", () => {
      const { room, player } = requireSession(socket);
      const bot = room.addBot(player.playerId, generatePlayerId(), now());
      io.to(roomChannel(room.roomCode)).emit("player_joined", { player: room.toPublicPlayer(bot) });
      if (room.players.size >= room.settings.maxPlayers) denyAllRequests(room, "room_full");
      broadcastRoom(room);
      return room.toPublic(now());
    });

    register("kick_player", (payload) => {
      const { playerId: targetId } = parse(kickSchema, payload);
      const { room, player } = requireSession(socket);
      const target = room.getPlayer(targetId);
      room.kick(player.playerId, targetId, now());
      removeFromRoom(room, target, "kicked");
      return null;
    });

    register("reconnect_player", (payload) => {
      const { sessionToken } = parse(reconnectSchema, payload);
      const ref = store.getSession(sessionToken);
      const room = ref ? store.getRoom(ref.roomCode) : undefined;
      const player = ref ? room?.players.get(ref.playerId) : undefined;
      if (!ref || !room || !player || player.sessionToken !== sessionToken) throw new GameError("INVALID_SESSION");
      if (socket.data.roomCode && (socket.data.roomCode !== room.roomCode || socket.data.playerId !== player.playerId)) {
        throw new GameError("ALREADY_IN_ROOM");
      }

      // Newest connection wins: close the older tab/device for the same player.
      if (player.socketId && player.socketId !== socket.id) {
        const old = io.sockets.sockets.get(player.socketId);
        if (old) {
          old.emit("error", new GameError("SESSION_REPLACED").toPayload());
          unbindSocket(old, room.roomCode);
          old.disconnect(true);
        }
      }

      room.markOnline(player.playerId, socket.id, now());
      bindSocket(socket, room, player.playerId);
      timers.clear(room.roomCode, "idle");
      timers.clear(room.roomCode, `offline:${player.playerId}`);
      if (room.isHost(player.playerId)) timers.clear(room.roomCode, "host");

      const restored: SessionRestoredPayload = {
        session: { sessionToken, playerId: player.playerId, roomCode: room.roomCode },
        room: room.toPublic(now()),
        inviteUrl: inviteUrl(room.roomCode),
        privateHand: room.privateHandFor(player.playerId),
        lastRoundResult: room.lastRoundResult,
      };
      socket.emit("session_restored", restored);
      broadcastStatus(room, player);
      broadcastRoom(room);
      return restored;
    });

    socket.on("disconnect", () => {
      dropPendingJoin(socket);
      const { roomCode, playerId } = socket.data;
      if (!roomCode || !playerId) return;
      const room = store.getRoom(roomCode);
      if (!room || !room.markOffline(playerId, socket.id, now())) return;
      const player = room.getPlayer(playerId);
      broadcastStatus(room, player);
      broadcastRoom(room);
      if (room.isHost(playerId)) scheduleHostTransfer(room);
      if (!room.anyoneOnline()) scheduleIdleExpiry(room);
      scheduleOfflineAutoSubmit(room, playerId);
    });
  });

  return {
    httpServer,
    io,
    store,
    listen(port = config.port) {
      return new Promise((resolve) => {
        httpServer.listen(port, () => resolve((httpServer.address() as AddressInfo).port));
      });
    },
    close() {
      timers.clearAll();
      return new Promise((resolve) => {
        io.close(() => resolve());
      });
    },
  };
}
