import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { NICKNAME_MAX_LENGTH, TIME_LIMIT_OPTIONS, TOTAL_ROUND_OPTIONS, type AvatarId, type RoomSettings } from "@sam-kong/protocol";
import { AvatarPicker, Screen, Segmented, Toggle } from "../components/ui";
import { profileStore } from "../lib/session";
import { useGame } from "../store/game";
import { t } from "../i18n";
import { PageHeader } from "./CreateRoom";

/** Solo practice against computer players: pick how many, then go straight to the table. */
export default function BotGame() {
  const navigate = useNavigate();
  const playWithBots = useGame((s) => s.playWithBots);
  const serverInfo = useGame((s) => s.serverInfo);
  const ownerKey = useGame((s) => s.ownerKey);
  const saved = profileStore.get();
  const [displayName, setName] = useState(saved?.displayName ?? "");
  const [avatar, setAvatar] = useState<AvatarId>(saved?.avatar ?? "tiger");
  const [bots, setBots] = useState(3);
  const [totalRounds, setRounds] = useState<RoomSettings["totalRounds"]>(10);
  const [timeLimit, setTimeLimit] = useState<RoomSettings["arrangementTimeLimit"]>(null);
  const [scoop, setScoop] = useState(true);
  const [royalty, setRoyalty] = useState(false);
  const [busy, setBusy] = useState(false);

  // Bot games open a room, so the owner-only rule applies here too.
  useEffect(() => {
    if (serverInfo?.ownerKeyRequired && !ownerKey) {
      useGame.getState().toast(t.access.ownerOnly, "error");
      navigate("/", { replace: true });
    }
  }, [serverInfo, ownerKey, navigate]);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!displayName.trim() || busy) return;
    setBusy(true);
    try {
      profileStore.save({ displayName: displayName.trim(), avatar });
      await playWithBots({
        displayName,
        avatar,
        bots,
        settings: { totalRounds, arrangementTimeLimit: timeLimit, enableScoopBonus: scoop, enableRoyaltyBonus: royalty },
      });
      navigate(`/room/${useGame.getState().session!.roomCode}`);
    } catch {
      /* toast already shown */
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      top={<PageHeader title={t.bots.title} />}
      actions={
        <button type="submit" form="bot-form" className="btn-primary w-full text-lg" disabled={!displayName.trim() || busy}>
          {busy ? t.bots.starting : t.bots.start}
        </button>
      }
    >
      <form id="bot-form" onSubmit={submit} className="flex flex-col gap-5">
        <p className="text-sm text-ink-dim">{t.bots.intro}</p>
        <div>
          <label className="label" htmlFor="bot-nickname">{t.form.nickname}</label>
          <input
            id="bot-nickname"
            className="field"
            value={displayName}
            maxLength={NICKNAME_MAX_LENGTH * 2}
            autoComplete="nickname"
            placeholder={t.form.nicknamePlaceholder}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <span className="label">{t.form.avatar}</span>
          <AvatarPicker value={avatar} onChange={setAvatar} />
        </div>
        <section className="panel flex flex-col gap-4 p-4">
          <div>
            <span className="label">{t.bots.count}</span>
            <Segmented label={t.bots.count} value={bots} options={[1, 2, 3].map((n) => ({ value: n, label: t.bots.countN(n) }))} onChange={setBots} />
          </div>
          <div>
            <span className="label">{t.form.rounds}</span>
            <Segmented
              label={t.form.rounds}
              value={totalRounds}
              options={TOTAL_ROUND_OPTIONS.map((n) => ({ value: n, label: n === null ? t.form.unlimited : String(n) }))}
              onChange={setRounds}
            />
          </div>
          <div>
            <span className="label">{t.form.timeLimit}</span>
            <Segmented
              label={t.form.timeLimit}
              value={timeLimit}
              options={TIME_LIMIT_OPTIONS.map((n) => ({ value: n, label: n === null ? "∞" : String(n) }))}
              onChange={setTimeLimit}
            />
          </div>
          <Toggle label={t.form.scoop} hint={t.form.scoopHint} checked={scoop} onChange={setScoop} />
          <Toggle label={t.form.royalty} hint={t.form.royaltyHint} checked={royalty} onChange={setRoyalty} />
        </section>
      </form>
    </Screen>
  );
}
