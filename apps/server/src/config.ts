import { fileURLToPath } from "node:url";

export interface ServerConfig {
  port: number;
  /** `true` allows any origin (development only, so phones on the same Wi-Fi can connect). */
  corsOrigins: string[] | true;
  publicWebUrl: string;
  trustProxy: boolean;
  /** Built website (apps/web/dist). Served from this server when the folder exists. */
  webDistDir: string;
  maxRooms: number;
  /** How long the host may be offline before host moves to the next online player. */
  hostGraceMs: number;
  /** How long a room with nobody online is kept before it expires. */
  roomIdleTtlMs: number;
  /** Length of one "second" of arrangement time. 1000 in production; tests shrink it. */
  secondMs: number;
  /** Extra time the server waits past the shown deadline, to absorb network latency. */
  deadlineGraceMs: number;
  /** With an Unlimited time limit, auto-submit a player who has been offline this long. */
  offlineAutoSubmitMs: number;
  rateLimits: {
    reactions: { capacity: number; refillPerMinute: number };
    createRoom: { capacity: number; refillPerMinute: number };
    joinRoom: { capacity: number; refillPerMinute: number };
    socketEvents: { capacity: number; refillPerMinute: number };
  };
}

const int = (v: string | undefined, fallback: number) => {
  const n = v ? Number.parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  // Railway sets RAILWAY_ENVIRONMENT; treat it as production behind Railway's proxy.
  const onRailway = !!env.RAILWAY_ENVIRONMENT;
  const production = env.NODE_ENV === "production" || onRailway;
  return {
    port: int(env.PORT, 3001),
    // The website is served by this same server in production, so no cross-origin access is
    // needed there; CORS_ORIGINS only matters if the website is hosted somewhere else.
    corsOrigins:
      !env.CORS_ORIGINS && !production
        ? true
        : (env.CORS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    publicWebUrl: (env.PUBLIC_WEB_URL ?? "http://localhost:5173").replace(/\/+$/, ""),
    // Behind Railway's proxy every request would otherwise share one IP and one rate limit.
    trustProxy: env.TRUST_PROXY ? env.TRUST_PROXY === "true" : onRailway,
    webDistDir: env.WEB_DIST_DIR ?? fileURLToPath(new URL("../../web/dist", import.meta.url)),
    maxRooms: int(env.MAX_ROOMS, 500),
    hostGraceMs: int(env.HOST_GRACE_MS, 60_000),
    roomIdleTtlMs: int(env.ROOM_IDLE_TTL_MS, 30 * 60_000),
    secondMs: 1000,
    deadlineGraceMs: 750,
    offlineAutoSubmitMs: int(env.OFFLINE_AUTO_SUBMIT_MS, 60_000),
    rateLimits: {
      reactions: { capacity: 4, refillPerMinute: 30 },
      createRoom: { capacity: 5, refillPerMinute: 5 },
      joinRoom: { capacity: 20, refillPerMinute: 20 },
      socketEvents: { capacity: 40, refillPerMinute: 240 },
    },
  };
}
