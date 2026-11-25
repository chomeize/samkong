import {
  MAX_PLAYER_OPTIONS,
  TIME_LIMIT_OPTIONS,
  TOTAL_ROUND_OPTIONS,
  type RoomSettings,
} from "@sam-kong/protocol";
import { Segmented, Toggle } from "./ui";
import { t } from "../i18n";

export function SettingsForm({
  value,
  onChange,
  minPlayers = 2,
  disabled,
}: {
  value: RoomSettings;
  onChange: (s: RoomSettings) => void;
  minPlayers?: number;
  disabled?: boolean;
}) {
  const set = <K extends keyof RoomSettings>(k: K, v: RoomSettings[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="flex flex-col gap-4">
      <div>
        <span className="label">{t.form.maxPlayers}</span>
        <Segmented
          label={t.form.maxPlayers}
          value={value.maxPlayers}
          disabled={disabled}
          options={MAX_PLAYER_OPTIONS.filter((n) => n >= minPlayers).map((n) => ({ value: n, label: t.form.players(n) }))}
          onChange={(v) => set("maxPlayers", v)}
        />
      </div>
      <div>
        <span className="label">{t.form.rounds}</span>
        <Segmented
          label={t.form.rounds}
          value={value.totalRounds}
          disabled={disabled}
          options={TOTAL_ROUND_OPTIONS.map((n) => ({ value: n, label: n === null ? t.form.unlimited : String(n) }))}
          onChange={(v) => set("totalRounds", v)}
        />
      </div>
      <div>
        <span className="label">{t.form.timeLimit}</span>
        <Segmented
          label={t.form.timeLimit}
          value={value.arrangementTimeLimit}
          disabled={disabled}
          options={TIME_LIMIT_OPTIONS.map((n) => ({ value: n, label: n === null ? "∞" : String(n) }))}
          onChange={(v) => set("arrangementTimeLimit", v)}
        />
      </div>
      <Toggle
        label={t.form.scoop}
        hint={t.form.scoopHint}
        checked={value.enableScoopBonus}
        disabled={disabled}
        onChange={(v) => set("enableScoopBonus", v)}
      />
      <Toggle
        label={t.form.royalty}
        hint={t.form.royaltyHint}
        checked={value.enableRoyaltyBonus}
        disabled={disabled}
        onChange={(v) => set("enableRoyaltyBonus", v)}
      />
    </div>
  );
}

export function settingsSummary(s: RoomSettings): string[] {
  return [
    t.form.players(s.maxPlayers),
    s.totalRounds === null ? `${t.form.rounds} ${t.form.unlimited}` : t.form.roundsN(s.totalRounds),
    s.arrangementTimeLimit === null ? `${t.form.timeLimit} ${t.form.unlimited}` : `${t.form.timeLimit} ${t.form.seconds(s.arrangementTimeLimit)}`,
    `Scoop ${s.enableScoopBonus ? "เปิด" : "ปิด"}`,
    `Royalty ${s.enableRoyaltyBonus ? "เปิด" : "ปิด"}`,
  ];
}
