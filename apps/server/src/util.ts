import { randomBytes } from "node:crypto";
import { secureRandomInt } from "@sam-kong/engine";
import {
  errorMessage,
  NICKNAME_MAX_LENGTH,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  ROOM_NAME_MAX_LENGTH,
  type ErrorCode,
  type ErrorPayload,
} from "@sam-kong/protocol";

/** An expected, player-facing failure. Anything else is reported as INTERNAL. */
export class GameError extends Error {
  constructor(public readonly code: ErrorCode, public readonly detail?: Record<string, unknown>) {
    super(code);
  }
  toPayload(): ErrorPayload {
    return { code: this.code, message: errorMessage(this.code), ...(this.detail ? { detail: this.detail } : {}) };
  }
}

export function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[secureRandomInt(ROOM_CODE_ALPHABET.length)];
  return code;
}

export function normalizeRoomCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const code = input.trim().toUpperCase();
  if (code.length !== ROOM_CODE_LENGTH) return null;
  for (const ch of code) if (!ROOM_CODE_ALPHABET.includes(ch)) return null;
  return code;
}

/** 256-bit secret, URL-safe. */
export const generateSessionToken = () => randomBytes(32).toString("base64url");
export const generatePlayerId = () => "p_" + randomBytes(9).toString("base64url");

// Control chars, zero-width and bidi-override characters that could spoof names.
const UNSAFE_CHARS = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤﻿]/g;

/** Normalise user text: NFC, strip unsafe characters, collapse whitespace. Returns "" if nothing is left. */
export function cleanText(input: unknown, maxLength: number): string | null {
  if (typeof input !== "string") return null;
  const s = input.normalize("NFC").replace(UNSAFE_CHARS, "").replace(/\s+/g, " ").trim();
  // Count user-perceived characters so Thai combining marks don't eat the limit unfairly.
  const length = [...new Intl.Segmenter("th", { granularity: "grapheme" }).segment(s)].length;
  return length > maxLength ? null : s;
}

export function cleanNickname(input: unknown): string {
  const s = cleanText(input, NICKNAME_MAX_LENGTH);
  if (!s) throw new GameError("INVALID_NICKNAME");
  return s;
}

export function cleanRoomName(input: unknown, fallback: string): string {
  if (input === undefined || input === null || input === "") return fallback;
  const s = cleanText(input, ROOM_NAME_MAX_LENGTH);
  if (s === null) throw new GameError("INVALID_ROOM_NAME");
  return s || fallback;
}

/** Case- and width-insensitive key for nickname uniqueness. */
export const nicknameKey = (name: string) => name.normalize("NFKC").toLocaleLowerCase("th");
