import type { AvatarId, SessionInfo } from "@sam-kong/protocol";

/**
 * The tab's own session lives in sessionStorage, so a refresh restores it and two tabs
 * can be two different players. A copy in localStorage powers "back to my room" on the
 * home page after the tab was closed.
 */
const TAB_KEY = "samkong.session";
const LAST_KEY = "samkong.lastSession";
const PROFILE_KEY = "samkong.profile";

function read<T>(storage: Storage, key: string): T | null {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(storage: Storage, key: string, value: unknown) {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode): the game still works for this visit */
  }
}

export const sessionStore = {
  getTab: () => read<SessionInfo>(sessionStorage, TAB_KEY),
  getLast: () => read<SessionInfo>(localStorage, LAST_KEY),
  save(s: SessionInfo) {
    write(sessionStorage, TAB_KEY, s);
    write(localStorage, LAST_KEY, s);
  },
  clear() {
    write(sessionStorage, TAB_KEY, null);
    write(localStorage, LAST_KEY, null);
  },
};

export interface Profile {
  displayName: string;
  avatar: AvatarId;
}

export const profileStore = {
  get: () => read<Profile>(localStorage, PROFILE_KEY),
  save: (p: Profile) => write(localStorage, PROFILE_KEY, p),
};
