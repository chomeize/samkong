import { Navigate, Route, Routes } from "react-router-dom";
import { Toasts } from "./components/ui";
import { ServerWakeBanner } from "./components/ServerWakeBanner";
import Home from "./pages/Home";
import CreateRoom from "./pages/CreateRoom";
import JoinRoom from "./pages/JoinRoom";
import HowToPlay from "./pages/HowToPlay";
import BotGame from "./pages/BotGame";
import RoomPage from "./pages/RoomPage";

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/create" element={<CreateRoom />} />
        <Route path="/join" element={<JoinRoom />} />
        <Route path="/join/:code" element={<JoinRoom />} />
        <Route path="/how-to-play" element={<HowToPlay />} />
        <Route path="/bots" element={<BotGame />} />
        <Route path="/room/:code" element={<RoomPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toasts />
      <ServerWakeBanner />
    </>
  );
}
