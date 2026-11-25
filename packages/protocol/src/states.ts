export const GAME_STATES = [
  "LOBBY",
  "DEALING",
  "ARRANGING",
  "WAITING_FOR_CONFIRMATION",
  "REVEALING",
  "SCORING",
  "ROUND_RESULT",
  "GAME_FINISHED",
] as const;
export type GameState = (typeof GAME_STATES)[number];

export const PLAYER_STATES = ["NOT_READY", "READY", "ARRANGING", "CONFIRMED", "AUTO_SUBMITTED"] as const;
export type PlayerState = (typeof PLAYER_STATES)[number];

/** Kept separate from PlayerState so going offline never overwrites game progress. */
export type ConnectionStatus = "ONLINE" | "OFFLINE";
