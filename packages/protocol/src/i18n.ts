import type { ErrorCode } from "./errors.js";

export type Locale = "th" | "en";
export const DEFAULT_LOCALE: Locale = "th";

/** Error messages shown to players. Add an `en` table later without touching callers. */
const ERROR_MESSAGES: Record<Locale, Partial<Record<ErrorCode, string>>> = {
  th: {
    INVALID_PAYLOAD: "ข้อมูลที่ส่งมาไม่ถูกต้อง",
    RATE_LIMITED: "ทำรายการเร็วเกินไป รอสักครู่แล้วลองใหม่",
    TOO_MANY_ROOMS: "ตอนนี้มีห้องเปิดอยู่เต็มแล้ว ลองใหม่ภายหลัง",
    ROOM_NOT_FOUND: "ไม่พบห้องนี้ ตรวจสอบรหัสห้องอีกครั้ง",
    ROOM_FULL: "ห้องนี้เต็มแล้ว",
    GAME_ALREADY_STARTED: "ห้องนี้เริ่มเกมไปแล้ว เข้าร่วมระหว่างเกมไม่ได้",
    NICKNAME_TAKEN: "ชื่อเล่นนี้มีคนใช้ในห้องแล้ว ลองชื่ออื่น",
    INVALID_NICKNAME: "ชื่อเล่นต้องมี 1–16 ตัวอักษร",
    INVALID_ROOM_NAME: "ชื่อห้องต้องมีไม่เกิน 30 ตัวอักษร",
    INVALID_AVATAR: "เลือก Avatar จากรายการที่มีให้",
    INVALID_SETTINGS: "ค่าการตั้งค่าห้องไม่ถูกต้อง",
    ALREADY_IN_ROOM: "คุณอยู่ในห้องอื่นอยู่ ออกจากห้องเดิมก่อน",
    NOT_IN_ROOM: "คุณยังไม่ได้อยู่ในห้อง",
    NOT_HOST: "เฉพาะ Host เท่านั้นที่ทำรายการนี้ได้",
    INVALID_STATE: "ทำรายการนี้ในช่วงเวลานี้ไม่ได้",
    NOT_ENOUGH_PLAYERS: "ต้องมีผู้เล่นอย่างน้อย 2 คน",
    PLAYERS_NOT_READY: "ผู้เล่นทุกคนต้องกดพร้อมก่อน",
    PLAYER_NOT_FOUND: "ไม่พบผู้เล่นคนนี้ในห้อง",
    CANNOT_KICK_SELF: "นำตัวเองออกจากห้องไม่ได้ ใช้ปุ่มออกจากห้องแทน",
    INVALID_SESSION: "เซสชันหมดอายุแล้ว เข้าห้องใหม่อีกครั้ง",
    SESSION_REPLACED: "คุณเปิดเกมนี้จากแท็บหรืออุปกรณ์อื่นแล้ว",
    INVALID_ARRANGEMENT: "การจัดไพ่ไม่ถูกต้อง",
    ALREADY_CONFIRMED: "คุณยืนยันไพ่ไปแล้ว",
    FOUL_NOT_ACCEPTED: "การจัดไพ่นี้จะเน่า ต้องยืนยันรับผลก่อน",
    INTERNAL: "เกิดข้อผิดพลาดในระบบ ลองใหม่อีกครั้ง",
  },
  en: {},
};

export function errorMessage(code: ErrorCode, locale: Locale = DEFAULT_LOCALE): string {
  return ERROR_MESSAGES[locale][code] ?? ERROR_MESSAGES.th[code] ?? code;
}
