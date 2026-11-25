import { t } from "../i18n";
import { TableShell } from "./table/TableShell";
import { OpponentChips } from "./table/OpponentChips";

export default function SpectatorView() {
  return (
    <TableShell center={<OpponentChips />}>
      <div className="flex h-full items-center justify-center text-ink-dim">{t.game.spectating}</div>
    </TableShell>
  );
}
