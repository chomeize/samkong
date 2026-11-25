import { useState } from "react";
import type { PublicPlayer, RoomSettings } from "@sam-kong/protocol";
import { Avatar, Sheet } from "../components/ui";
import { SettingsForm, settingsSummary } from "../components/SettingsForm";
import { AvatarReaction } from "../components/Reactions";
import { copyText, tap } from "../lib/haptics";
import { useGame } from "../store/game";
import { t } from "../i18n";

function PlayerRow({ p, me, canKick, onKick }: { p: PublicPlayer; me: boolean; canKick: boolean; onKick: () => void }) {
  const offline = p.connectionStatus === "OFFLINE";
  const ready = p.isHost || p.playerState === "READY";
  return (
    <li className={`flex min-h-[64px] items-center gap-3 rounded-2xl px-3 py-2 ${me ? "bg-gold/10 ring-1 ring-gold/40" : "bg-white/5"}`}>
      <span className="relative">
        <Avatar id={p.avatar} size={44} ring={p.isHost ? "gold" : "dim"} />
        <AvatarReaction playerId={p.playerId} />
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-night-2 ${offline ? "bg-ink-faint" : "bg-good"}`}
          aria-label={offline ? t.lobby.offline : "ออนไลน์"}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-semibold">{p.displayName}</span>
          {me && <span className="text-xs text-ink-dim">({t.lobby.you})</span>}
        </span>
        <span className="flex flex-wrap gap-1.5 text-xs">
          {p.isHost && <span className="rounded-full bg-gold/20 px-2 py-0.5 font-semibold text-gold">👑 {t.lobby.host}</span>}
          {offline && <span className="text-ink-faint">{t.lobby.offline}</span>}
        </span>
      </span>
      {!p.isHost && (
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ready ? "bg-good/15 text-good" : "bg-white/10 text-ink-dim"}`}>
          {ready ? `✓ ${t.lobby.ready}` : t.lobby.notReady}
        </span>
      )}
      {canKick && (
        <button type="button" onClick={onKick} className="h-10 w-10 rounded-full text-ink-faint active:bg-white/10" aria-label={`${t.lobby.kick} ${p.displayName}`}>
          ✕
        </button>
      )}
    </li>
  );
}

export default function Lobby() {
  const room = useGame((s) => s.room)!;
  const session = useGame((s) => s.session)!;
  const { setReady, start, kick, updateSettings, toast } = useGame.getState();
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState<RoomSettings>(room.settings);
  const [roomName, setRoomName] = useState(room.roomName);
  const [busy, setBusy] = useState(false);

  const me = room.players.find((p) => p.playerId === session.playerId);
  const isHost = room.hostPlayerId === session.playerId;
  const inviteUrl = `${window.location.origin}/join/${room.roomCode}`;
  const emptySeats = Math.max(0, room.settings.maxPlayers - room.players.length);

  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch {
      /* toast shown */
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string) => {
    if (await copyText(text)) {
      tap();
      toast(t.lobby.copied, "success");
    }
  };
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: `${t.appName} · ${room.roomName}`, text: `มาเล่นไพ่ 3 กองกัน! รหัสห้อง ${room.roomCode}`, url: inviteUrl });
      } catch {
        /* user cancelled */
      }
    } else void copy(inviteUrl);
  };

  const hint = room.players.length < 2 ? t.lobby.needPlayers : !room.canStart ? t.lobby.waitReady : null;

  return (
    <>
      <main className="safe-x flex flex-1 flex-col gap-4 py-4">
        {/* Invite card: the code is the thing friends need, so it's the biggest element. */}
        <section className="felt rounded-3xl border border-felt-line/40 p-5 text-center shadow-lift">
          <p className="text-sm text-ink-dim">{t.lobby.code}</p>
          <button
            type="button"
            onClick={() => copy(room.roomCode)}
            className="mt-1 font-mono text-4xl font-semibold tracking-[0.3em] text-gold active:scale-95"
            aria-label={`${t.lobby.copyCode} ${room.roomCode}`}
          >
            {room.roomCode}
          </button>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" className="chip justify-center" onClick={() => copy(room.roomCode)}>
              📋 {t.lobby.copyCode}
            </button>
            <button type="button" className="chip justify-center" onClick={share}>
              🔗 {typeof navigator.share === "function" ? t.lobby.share : t.lobby.copyLink}
            </button>
          </div>
        </section>

        <section aria-labelledby="players-h">
          <h2 id="players-h" className="mb-2 flex items-baseline justify-between font-display text-lg font-semibold">
            {t.lobby.players(room.players.length, room.settings.maxPlayers)}
          </h2>
          <ul className="flex flex-col gap-2">
            {room.players.map((p) => (
              <PlayerRow
                key={p.playerId}
                p={p}
                me={p.playerId === session.playerId}
                canKick={isHost && p.playerId !== session.playerId}
                onKick={() => run(() => kick(p.playerId))}
              />
            ))}
            {Array.from({ length: emptySeats }, (_, i) => (
              <li key={`empty-${i}`} className="flex min-h-[64px] items-center gap-3 rounded-2xl border-2 border-dashed border-white/10 px-3 text-ink-faint">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/5 text-xl">+</span>
                {t.lobby.emptySeat}
              </li>
            ))}
          </ul>
        </section>

        <section className="panel p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">{t.lobby.settings}</h2>
            {isHost && (
              <button
                type="button"
                className="chip"
                onClick={() => {
                  setDraft(room.settings);
                  setRoomName(room.roomName);
                  setEditOpen(true);
                }}
              >
                ✎ {t.lobby.editSettings}
              </button>
            )}
          </div>
          <ul className="flex flex-wrap gap-1.5 text-sm">
            {settingsSummary(room.settings).map((s) => (
              <li key={s} className="rounded-full bg-white/5 px-3 py-1 text-ink-dim">{s}</li>
            ))}
          </ul>
        </section>
      </main>

      <div className="action-bar safe-x pt-3">
        {isHost ? (
          <>
            {hint && <p className="mb-2 text-center text-sm text-ink-dim">{hint}</p>}
            <button type="button" className="btn-primary w-full text-lg" disabled={!room.canStart || busy} onClick={() => run(start)}>
              {t.lobby.start}
            </button>
          </>
        ) : (
          <>
            <p className="mb-2 text-center text-sm text-ink-dim">{t.lobby.waitHost}</p>
            {me?.playerState === "READY" ? (
              <button type="button" className="btn-secondary w-full" disabled={busy} onClick={() => run(() => setReady(false))}>
                {t.lobby.cancelReady}
              </button>
            ) : (
              <button type="button" className="btn-primary w-full text-lg" disabled={busy} onClick={() => { tap(); void run(() => setReady(true)); }}>
                ✓ {t.lobby.imReady}
              </button>
            )}
          </>
        )}
      </div>

      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title={t.lobby.settings}>
        <div className="flex flex-col gap-4">
          <div>
            <label className="label" htmlFor="edit-room-name">{t.form.roomName}</label>
            <input id="edit-room-name" className="field" value={roomName} onChange={(e) => setRoomName(e.target.value)} />
          </div>
          <SettingsForm value={draft} onChange={setDraft} minPlayers={Math.max(2, room.players.length)} />
          <p className="text-sm text-ink-dim">{t.lobby.settingsChangedHint}</p>
          <button
            type="button"
            className="btn-primary w-full"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await updateSettings({ roomName, settings: draft });
                setEditOpen(false);
              })
            }
          >
            {t.lobby.save}
          </button>
        </div>
      </Sheet>
    </>
  );
}
