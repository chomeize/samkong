import { createContext, useContext } from "react";

/** Sheets owned by RoomPage that any screen can open (leave, leaderboard, reactions). */
export interface RoomUI {
  openLeave(): void;
  openBoard(): void;
  openReact(): void;
}

export const RoomUIContext = createContext<RoomUI>({ openLeave() {}, openBoard() {}, openReact() {} });
export const useRoomUI = () => useContext(RoomUIContext);
