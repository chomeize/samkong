export const ERROR_CODES = [
  "INVALID_PAYLOAD",
  "RATE_LIMITED",
  "TOO_MANY_ROOMS",
  "ROOM_NOT_FOUND",
  "ROOM_FULL",
  "GAME_ALREADY_STARTED",
  "NICKNAME_TAKEN",
  "INVALID_NICKNAME",
  "INVALID_ROOM_NAME",
  "INVALID_AVATAR",
  "INVALID_SETTINGS",
  "ALREADY_IN_ROOM",
  "NOT_IN_ROOM",
  "NOT_HOST",
  "INVALID_STATE",
  "NOT_ENOUGH_PLAYERS",
  "PLAYERS_NOT_READY",
  "PLAYER_NOT_FOUND",
  "CANNOT_KICK_SELF",
  "INVALID_SESSION",
  "SESSION_REPLACED",
  "INVALID_ARRANGEMENT",
  "ALREADY_CONFIRMED",
  "FOUL_NOT_ACCEPTED",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorPayload {
  code: ErrorCode;
  message: string;
  /** Extra detail for the UI, e.g. which settings field was invalid. */
  detail?: Record<string, unknown>;
}
