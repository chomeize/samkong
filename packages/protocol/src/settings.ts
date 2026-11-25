export const MAX_PLAYER_OPTIONS = [2, 3, 4] as const;
/** null = Unlimited */
export const TOTAL_ROUND_OPTIONS = [5, 10, 20, null] as const;
/** Seconds; null = Unlimited */
export const TIME_LIMIT_OPTIONS = [60, 90, 120, 180, null] as const;

export type MaxPlayers = (typeof MAX_PLAYER_OPTIONS)[number];
export type TotalRounds = (typeof TOTAL_ROUND_OPTIONS)[number];
export type ArrangementTimeLimit = (typeof TIME_LIMIT_OPTIONS)[number];

export interface RoomSettings {
  maxPlayers: MaxPlayers;
  totalRounds: TotalRounds;
  arrangementTimeLimit: ArrangementTimeLimit;
  enableScoopBonus: boolean;
  enableRoyaltyBonus: boolean;
}

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  maxPlayers: 4,
  totalRounds: 10,
  arrangementTimeLimit: 120,
  enableScoopBonus: true,
  enableRoyaltyBonus: false,
};

export const NICKNAME_MAX_LENGTH = 16;
export const ROOM_NAME_MAX_LENGTH = 30;
export const ROOM_CODE_LENGTH = 6;
/** No look-alike characters (0/O, 1/I/L). */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export type SettingsParseResult =
  | { ok: true; value: RoomSettings }
  | { ok: false; field: keyof RoomSettings };

const includes = <T>(list: readonly T[], v: unknown): v is T => list.includes(v as T);

/**
 * Merge an untrusted partial settings object into `base`.
 * Unknown keys are ignored; a known key with a bad value fails the whole update.
 */
export function parseRoomSettings(input: unknown, base: RoomSettings = DEFAULT_ROOM_SETTINGS): SettingsParseResult {
  const out: RoomSettings = { ...base };
  if (input == null) return { ok: true, value: out };
  if (typeof input !== "object" || Array.isArray(input)) return { ok: false, field: "maxPlayers" };
  const s = input as Record<string, unknown>;
  if ("maxPlayers" in s) {
    if (!includes(MAX_PLAYER_OPTIONS, s.maxPlayers)) return { ok: false, field: "maxPlayers" };
    out.maxPlayers = s.maxPlayers;
  }
  if ("totalRounds" in s) {
    if (!includes(TOTAL_ROUND_OPTIONS, s.totalRounds)) return { ok: false, field: "totalRounds" };
    out.totalRounds = s.totalRounds;
  }
  if ("arrangementTimeLimit" in s) {
    if (!includes(TIME_LIMIT_OPTIONS, s.arrangementTimeLimit)) return { ok: false, field: "arrangementTimeLimit" };
    out.arrangementTimeLimit = s.arrangementTimeLimit;
  }
  for (const key of ["enableScoopBonus", "enableRoyaltyBonus"] as const) {
    if (key in s) {
      if (typeof s[key] !== "boolean") return { ok: false, field: key };
      out[key] = s[key] as boolean;
    }
  }
  return { ok: true, value: out };
}
