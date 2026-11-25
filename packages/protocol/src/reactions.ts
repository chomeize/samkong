/** Emoji players can send. The server rejects anything not on this list. */
export const REACTION_EMOJIS = ["👍", "😂", "😮", "😭", "🔥", "👏", "😎", "🙏"] as const;

/** Quick messages are sent by id so the text can be translated later. */
export const QUICK_MESSAGES = {
  fight: "สู้ ๆ",
  nice: "ไพ่สวยมาก",
  wait: "รอแป๊บ",
  wow: "โอ้โห!",
  hurry: "เร็วหน่อยน้า",
  gg: "เกมดี!",
} as const;

export type QuickMessageId = keyof typeof QUICK_MESSAGES;

export function isValidReaction(kind: unknown, value: unknown): boolean {
  if (kind === "emoji") return (REACTION_EMOJIS as readonly unknown[]).includes(value);
  if (kind === "quick") return typeof value === "string" && Object.prototype.hasOwnProperty.call(QUICK_MESSAGES, value);
  return false;
}
