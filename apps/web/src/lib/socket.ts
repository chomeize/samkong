import { io, type Socket } from "socket.io-client";
import {
  errorMessage,
  type Ack,
  type AckFn,
  type ClientToServerEvents,
  type ErrorPayload,
  type ServerToClientEvents,
} from "@sam-kong/protocol";

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

function serverUrl(): string | undefined {
  const fromEnv = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (fromEnv) return fromEnv;
  // Dev: the Vite site (5173) and the game server (3001) run separately — same host, so it
  // also works from a phone on the same Wi-Fi.
  if (import.meta.env.DEV) return `${window.location.protocol}//${window.location.hostname}:3001`;
  // Production: the server hosts this page, so connect to the page's own origin.
  return undefined;
}

const url = serverUrl();
export const socket: GameSocket = (url ? io(url, socketOptions()) : io(socketOptions()));

function socketOptions() {
  return {
    autoConnect: true,
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
  };
}

type AckData<E extends keyof ClientToServerEvents> =
  Parameters<ClientToServerEvents[E]>[1] extends AckFn<infer T> ? T : never;

export class ActionError extends Error {
  constructor(public readonly payload: ErrorPayload) {
    super(payload.message);
  }
}

/**
 * Resolve once the socket is connected. A free-tier server that went to sleep can
 * take up to a minute to wake, so actions wait for it instead of failing at once.
 */
export function waitForConnection(timeoutMs = 75_000): Promise<void> {
  if (socket.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("connect", onConnect);
      reject(new Error("connect timeout"));
    }, timeoutMs);
    const onConnect = () => {
      clearTimeout(timer);
      resolve();
    };
    socket.once("connect", onConnect);
    if (!socket.active) socket.connect();
  });
}

/** Emit an action and resolve with its data, or reject with ActionError (Thai message). */
export async function call<E extends keyof ClientToServerEvents>(
  event: E,
  payload: Parameters<ClientToServerEvents[E]>[0],
  timeoutMs = 8000,
): Promise<AckData<E>> {
  let res: Ack<AckData<E>>;
  try {
    await waitForConnection();
    // The typed generic overloads can't take a union event name, so call through a narrow shape.
    const timed = socket.timeout(timeoutMs) as unknown as {
      emitWithAck(ev: string, p: unknown): Promise<Ack<AckData<E>>>;
    };
    res = await timed.emitWithAck(event, payload);
  } catch {
    throw new ActionError({ code: "INTERNAL", message: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่" });
  }
  if (!res.ok) throw new ActionError({ ...res.error, message: res.error.message || errorMessage(res.error.code) });
  return res.data;
}
