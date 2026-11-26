import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { NICKNAME_MAX_LENGTH, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, type AvatarId } from "@sam-kong/protocol";
import { Avatar, AvatarPicker, Screen } from "../components/ui";
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
  const pendingJoin = useGame((s) => s.pendingJoin);
  const session = useGame((s) => s.session);
  const cancelJoin = useGame((s) => s.cancelJoin);
  const canSubmit = roomCode.length === ROOM_CODE_LENGTH && displayName.trim().length > 0 && !busy;

  // Enter the room as soon as we have a seat: straight away, or once the host allows us in.
  useEffect(() => {
    if (session) navigate(`/room/${session.roomCode}`, { replace: true });
  }, [session, navigate]);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    try {
      profileStore.save({ displayName: displayName.trim(), avatar });
      await joinRoom({ roomCode, displayName, avatar });
    } catch {
      /* toast already shown */
    } finally {
      setBusy(false);
    }
  };

  if (pendingJoin) {
    return (
      <Screen
        top={<PageHeader title={t.home.join} />}
        actions={
          <button type="button" className="btn-secondary w-full" onClick={() => void cancelJoin()}>
            {t.access.cancel}
          </button>
        }
      >
        <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center" role="status" aria-live="polite">
          <div className="relative">
            <Avatar id={avatar} size={88} ring="gold" />
            <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-night-3 text-lg ring-2 ring-night">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gold border-t-transparent" aria-hidden />
            </span>
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold text-gold">{t.access.waitingTitle}</h2>
            <p className="mx-auto mt-2 max-w-xs text-ink-dim">{t.access.waitingBody(pendingJoin.roomName)}</p>
          </div>
          <p className="font-mono text-sm tracking-widest text-ink-faint">{pendingJoin.roomCode}</p>
        </div>
      </Screen>
    );
  }

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
