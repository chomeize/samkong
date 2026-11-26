import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DEFAULT_ROOM_SETTINGS, NICKNAME_MAX_LENGTH, ROOM_NAME_MAX_LENGTH, type AvatarId, type RoomSettings } from "@sam-kong/protocol";
import { AvatarPicker, Screen } from "../components/ui";
import { SettingsForm } from "../components/SettingsForm";
import { profileStore } from "../lib/session";
import { useGame } from "../store/game";
import { t } from "../i18n";

export function PageHeader({ title, back = "/" }: { title: string; back?: string }) {
  return (
    <header className="safe-x flex items-center gap-2 pb-1" style={{ paddingTop: "calc(0.75rem + var(--safe-top))" }}>
      <Link to={back} aria-label={t.form.back} className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-2xl text-ink-dim active:bg-white/10">
        ←
      </Link>
      <h1 className="font-display text-xl font-semibold">{title}</h1>
    </header>
  );
}

export default function CreateRoom() {
  const navigate = useNavigate();
  const createRoom = useGame((s) => s.createRoom);
  const serverInfo = useGame((s) => s.serverInfo);
  const ownerKey = useGame((s) => s.ownerKey);

  // Only the site owner may create rooms: anyone else is sent back home with an explanation.
  useEffect(() => {
    if (serverInfo?.ownerKeyRequired && !ownerKey) {
      useGame.getState().toast(t.access.ownerOnly, "error");
      navigate("/", { replace: true });
    }
  }, [serverInfo, ownerKey, navigate]);
  const saved = profileStore.get();
  const [displayName, setName] = useState(saved?.displayName ?? "");
  const [avatar, setAvatar] = useState<AvatarId>(saved?.avatar ?? "tiger");
  const [roomName, setRoomName] = useState("");
  const [settings, setSettings] = useState<RoomSettings>(DEFAULT_ROOM_SETTINGS);
  const [busy, setBusy] = useState(false);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!displayName.trim() || busy) return;
    setBusy(true);
    try {
      profileStore.save({ displayName: displayName.trim(), avatar });
      await createRoom({ displayName, avatar, roomName: roomName || undefined, settings });
      navigate(`/room/${useGame.getState().session!.roomCode}`);
    } catch {
      /* toast already shown */
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      top={<PageHeader title={t.home.create} />}
      actions={
        <button type="submit" form="create-form" className="btn-primary w-full text-lg" disabled={!displayName.trim() || busy}>
          {busy ? t.common.loading : t.form.createSubmit}
        </button>
      }
    >
      <form id="create-form" onSubmit={submit} className="flex flex-col gap-6">
        <section className="flex flex-col gap-4">
          <div>
            <label className="label" htmlFor="nickname">{t.form.nickname}</label>
            <input
              id="nickname"
              className="field"
              value={displayName}
              maxLength={NICKNAME_MAX_LENGTH * 2}
              autoComplete="nickname"
              enterKeyHint="next"
              placeholder={t.form.nicknamePlaceholder}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <span className="label">{t.form.avatar}</span>
            <AvatarPicker value={avatar} onChange={setAvatar} />
          </div>
          <div>
            <label className="label" htmlFor="roomName">{t.form.roomName}</label>
            <input
              id="roomName"
              className="field"
              value={roomName}
              maxLength={ROOM_NAME_MAX_LENGTH * 2}
              enterKeyHint="done"
              placeholder={t.form.roomNamePlaceholder}
              onChange={(e) => setRoomName(e.target.value)}
            />
          </div>
        </section>
        <section className="panel p-4">
          <h2 className="mb-4 font-display text-lg font-semibold">{t.lobby.settings}</h2>
          <SettingsForm value={settings} onChange={setSettings} />
        </section>
      </form>
    </Screen>
  );
}
