import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { NICKNAME_MAX_LENGTH, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, type AvatarId } from "@sam-kong/protocol";
import { AvatarPicker, Screen } from "../components/ui";
import { profileStore } from "../lib/session";
import { useGame } from "../store/game";
import { t } from "../i18n";
import { PageHeader } from "./CreateRoom";

const cleanCode = (s: string) =>
  s
    .toUpperCase()
    .split("")
    .filter((ch) => ROOM_CODE_ALPHABET.includes(ch))
    .join("")
    .slice(0, ROOM_CODE_LENGTH);

export default function JoinRoom() {
  const params = useParams();
  const navigate = useNavigate();
  const joinRoom = useGame((s) => s.joinRoom);
  const saved = profileStore.get();
  const fromLink = !!params.code;
  const [roomCode, setCode] = useState(cleanCode(params.code ?? ""));
  const [displayName, setName] = useState(saved?.displayName ?? "");
  const [avatar, setAvatar] = useState<AvatarId>(saved?.avatar ?? "cat");
  const [busy, setBusy] = useState(false);
  const canSubmit = roomCode.length === ROOM_CODE_LENGTH && displayName.trim().length > 0 && !busy;

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    try {
      profileStore.save({ displayName: displayName.trim(), avatar });
      await joinRoom({ roomCode, displayName, avatar });
      navigate(`/room/${roomCode}`);
    } catch {
      /* toast already shown */
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      top={<PageHeader title={t.home.join} />}
      actions={
        <button type="submit" form="join-form" className="btn-primary w-full text-lg" disabled={!canSubmit}>
          {busy ? t.common.loading : t.form.joinSubmit}
        </button>
      }
    >
      <form id="join-form" onSubmit={submit} className="flex flex-col gap-5">
        <div>
          <label className="label" htmlFor="code">{t.form.roomCode}</label>
          <input
            id="code"
            className="field text-center font-mono text-3xl tracking-[0.35em] uppercase"
            value={roomCode}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            readOnly={fromLink}
            placeholder="••••••"
            onChange={(e) => setCode(cleanCode(e.target.value))}
          />
        </div>
        <div>
          <label className="label" htmlFor="nickname">{t.form.nickname}</label>
          <input
            id="nickname"
            className="field"
            value={displayName}
            maxLength={NICKNAME_MAX_LENGTH * 2}
            autoComplete="nickname"
            enterKeyHint="go"
            autoFocus={fromLink}
            placeholder={t.form.nicknamePlaceholder}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <span className="label">{t.form.avatar}</span>
          <AvatarPicker value={avatar} onChange={setAvatar} />
        </div>
      </form>
    </Screen>
  );
}
