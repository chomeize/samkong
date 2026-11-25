import type { Room } from "./room.js";

export interface SessionRef {
  roomCode: string;
  playerId: string;
}

/**
 * Where rooms and sessions live. The MVP keeps everything in memory;
 * a Redis or SQLite implementation can replace this without touching handlers.
 */
export interface RoomStore {
  getRoom(code: string): Room | undefined;
  hasRoom(code: string): boolean;
  saveRoom(room: Room): void;
  deleteRoom(code: string): void;
  roomCount(): number;
  getSession(token: string): SessionRef | undefined;
  saveSession(token: string, ref: SessionRef): void;
  deleteSession(token: string): void;
}

export class InMemoryRoomStore implements RoomStore {
  private rooms = new Map<string, Room>();
  private sessions = new Map<string, SessionRef>();

  getRoom(code: string) {
    return this.rooms.get(code);
  }
  hasRoom(code: string) {
    return this.rooms.has(code);
  }
  saveRoom(room: Room) {
    this.rooms.set(room.roomCode, room);
  }
  deleteRoom(code: string) {
    const room = this.rooms.get(code);
    if (room) for (const p of room.players.values()) this.sessions.delete(p.sessionToken);
    this.rooms.delete(code);
  }
  roomCount() {
    return this.rooms.size;
  }
  getSession(token: string) {
    return this.sessions.get(token);
  }
  saveSession(token: string, ref: SessionRef) {
    this.sessions.set(token, ref);
  }
  deleteSession(token: string) {
    this.sessions.delete(token);
  }
}
