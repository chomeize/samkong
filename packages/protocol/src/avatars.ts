/** Avatars are chosen from a fixed list; the server rejects anything else. */
export const AVATARS = {
  tiger: "🐯",
  rabbit: "🐰",
  cat: "🐱",
  fox: "🦊",
  panda: "🐼",
  koala: "🐨",
  owl: "🦉",
  frog: "🐸",
  penguin: "🐧",
  bear: "🐻",
  monkey: "🐵",
  elephant: "🐘",
} as const;

export type AvatarId = keyof typeof AVATARS;
export const AVATAR_IDS = Object.keys(AVATARS) as AvatarId[];

export function isAvatarId(v: unknown): v is AvatarId {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(AVATARS, v);
}
