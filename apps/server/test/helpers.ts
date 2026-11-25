import { io as connect, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@sam-kong/protocol";
import { loadConfig, type ServerConfig } from "../src/config.js";
import { createGameServer, type GameServer, type GameServerOptions } from "../src/server.js";

export type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface TestServer {
  server: GameServer;
  url: string;
  clients: Client[];
  client(): Promise<Client>;
  stop(): Promise<void>;
}

export async function startTestServer(
  overrides: Partial<ServerConfig> = {},
  options: GameServerOptions = {},
): Promise<TestServer> {
  const base = loadConfig({});
  const config: ServerConfig = {
    ...base,
    hostGraceMs: 200,
    roomIdleTtlMs: 300,
    publicWebUrl: "https://play.example",
    // 1 "second" of arrangement time = 5ms, so a 60s limit runs out in 300ms.
    secondMs: 5,
    deadlineGraceMs: 30,
    offlineAutoSubmitMs: 250,
    rateLimits: {
      reactions: { capacity: 4, refillPerMinute: 30 },
      createRoom: { capacity: 100, refillPerMinute: 100 },
      joinRoom: { capacity: 100, refillPerMinute: 100 },
      socketEvents: { capacity: 500, refillPerMinute: 500 },
    },
    ...overrides,
  };
  const server = createGameServer(config, options);
  const port = await server.listen(0);
  const url = `http://127.0.0.1:${port}`;
  const clients: Client[] = [];
  return {
    server,
    url,
    clients,
    client: () =>
      new Promise((resolve, reject) => {
        const c: Client = connect(url, { transports: ["websocket"], forceNew: true, reconnection: false });
        clients.push(c);
        c.once("connect", () => resolve(c));
        c.once("connect_error", reject);
      }),
    async stop() {
      for (const c of clients) c.disconnect();
      await server.close();
    },
  };
}

/** Resolve on the next `event` matching `predicate`, or fail after `ms`. */
export function next<E extends keyof ServerToClientEvents>(
  c: Client,
  event: E,
  predicate: (p: Parameters<ServerToClientEvents[E]>[0]) => boolean = () => true,
  ms = 2000,
): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      off();
      reject(new Error(`Timed out waiting for ${String(event)}`));
    }, ms);
    const handler = (p: Parameters<ServerToClientEvents[E]>[0]) => {
      if (!predicate(p)) return;
      off();
      resolve(p);
    };
    const anyC = c as unknown as { on(e: string, f: unknown): void; off(e: string, f: unknown): void };
    const off = () => {
      clearTimeout(timer);
      anyC.off(event, handler);
    };
    anyC.on(event, handler);
  });
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Unwrap a successful ack or throw with the error code. */
export function ok<T>(res: { ok: true; data: T } | { ok: false; error: { code: string } }): T {
  if (!res.ok) throw new Error(`Expected ok, got ${res.error.code}`);
  return res.data;
}

export function errCode(res: { ok: boolean; error?: { code: string } }): string | undefined {
  return res.ok ? undefined : res.error?.code;
}
