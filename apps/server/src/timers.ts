/** Named timers per room, so a room's host-transfer or expiry timer can be replaced or cancelled. */
export class RoomTimers {
  private timers = new Map<string, NodeJS.Timeout>();

  set(roomCode: string, name: string, ms: number, fn: () => void) {
    this.clear(roomCode, name);
    const key = `${roomCode}:${name}`;
    const t = setTimeout(() => {
      this.timers.delete(key);
      fn();
    }, ms);
    t.unref?.();
    this.timers.set(key, t);
  }

  clear(roomCode: string, name: string) {
    const key = `${roomCode}:${name}`;
    const t = this.timers.get(key);
    if (t) clearTimeout(t);
    this.timers.delete(key);
  }

  clearRoom(roomCode: string) {
    for (const [key, t] of this.timers) {
      if (key.startsWith(roomCode + ":")) {
        clearTimeout(t);
        this.timers.delete(key);
      }
    }
  }

  clearAll() {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }
}
