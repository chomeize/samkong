import type { ReactNode } from "react";
import { DEFAULT_ROYALTY_TABLE, type RoyaltyHand } from "@sam-kong/engine";

/** Shown straight from the engine's royalty config, so the page can't drift from the scoring. */
const ROYALTY_ROWS: Array<[string, RoyaltyHand]> = [
  ["Three of a Kind", "ThreeOfAKind"],
  ["Straight", "Straight"],
  ["Flush", "Flush"],
  ["Full House", "FullHouse"],
  ["Four of a Kind", "FourOfAKind"],
  ["Straight Flush", "StraightFlush"],
  ["Royal Flush", "RoyalFlush"],
];
import { PlayingCard } from "../components/PlayingCard";
import { Screen } from "../components/ui";
import { t } from "../i18n";
import { PageHeader } from "./CreateRoom";

const HANDS: Array<{ name: string; cards: string[] }> = [
  { name: "Royal Flush", cards: ["TS", "JS", "QS", "KS", "AS"] },
  { name: "Straight Flush", cards: ["5H", "6H", "7H", "8H", "9H"] },
  { name: "Four of a Kind", cards: ["9S", "9H", "9D", "9C", "2S"] },
  { name: "Full House", cards: ["KS", "KH", "KD", "5C", "5S"] },
  { name: "Flush", cards: ["2C", "7C", "9C", "JC", "KC"] },
  { name: "Straight", cards: ["TS", "JH", "QD", "KC", "AS"] },
  { name: "Three of a Kind", cards: ["7S", "7H", "7D", "KC", "2S"] },
  { name: "Two Pair", cards: ["KS", "KH", "5D", "5C", "2S"] },
  { name: "One Pair", cards: ["QS", "QH", "9D", "5C", "2S"] },
  { name: "High Card", cards: ["AS", "JH", "9D", "5C", "2S"] },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel p-4">
      <h2 className="mb-2 font-display text-lg font-semibold text-gold">{title}</h2>
      <div className="flex flex-col gap-2 text-ink-dim [&_b]:text-ink">{children}</div>
    </section>
  );
}

export default function HowToPlay() {
  return (
    <Screen top={<PageHeader title={t.howTo.title} />}>
      <Section title="1. จัดไพ่ 13 ใบเป็น 3 กอง">
        <p>ทุกคนได้ไพ่ 13 ใบ แล้วจัดพร้อมกันโดยไม่ต้องรอตา</p>
        <p><b>กองหน้า 3 ใบ</b> · <b>กองกลาง 5 ใบ</b> · <b>กองหลัง 5 ใบ</b></p>
        <p>กองหลังต้องใหญ่กว่าหรือเท่ากับกองกลาง และกองกลางต้องใหญ่กว่าหรือเท่ากับกองหน้า ถ้าผิดลำดับถือว่า <b>เน่า</b></p>
        <p>กองหน้ามีได้แค่ High Card, One Pair หรือ Three of a Kind (เรียงหรือดอกเดียวกัน 3 ใบไม่นับ)</p>
      </Section>
      <Section title="2. ลำดับไพ่ (ใหญ่ → เล็ก)">
        <ol className="flex flex-col gap-3">
          {HANDS.map((h) => (
            <li key={h.name}>
              <div className="mb-1 font-semibold text-ink">{h.name}</div>
              <div className="flex gap-1" style={{ ["--card-w" as string]: "40px" }}>
                {h.cards.map((c) => (
                  <PlayingCard key={c} id={c} />
                ))}
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-2">A ใหญ่สุด และใช้เป็นไพ่ต่ำได้เฉพาะ A-2-3-4-5 · ดอกไม่มีผลต่อการตัดสิน</p>
      </Section>
      <Section title="3. การนับแต้ม">
        <p>เทียบกับผู้เล่นทุกคนทีละคู่ กองต่อกอง: ชนะ <b>+1</b> · แพ้ <b>−1</b> · เสมอ <b>0</b></p>
        <p><b>Scoop</b>: ชนะครบ 3 กอง ได้เพิ่มอีก 3 (รวม +6)</p>
        <p><b>เน่า</b>: เสีย 6 แต้มให้ทุกคนที่จัดถูกต้อง ถ้าเน่าทั้งคู่ได้ 0</p>
        <p><b>Royalty</b> (ถ้าเปิด): แต้มพิเศษเมื่อได้ไพ่สวยในแต่ละกอง แล้วนำผลต่างกับคู่แข่งมาบวกลบ คนที่เน่าไม่ได้ Royalty</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-left text-ink">
                <th className="py-1 font-semibold">ไพ่</th>
                <th className="py-1 text-right font-semibold">หน้า</th>
                <th className="py-1 text-right font-semibold">กลาง</th>
                <th className="py-1 text-right font-semibold">หลัง</th>
              </tr>
            </thead>
            <tbody>
              {ROYALTY_ROWS.map(([name, row]) => (
                <tr key={name} className="border-t border-white/10">
                  <td className="py-1">{name}</td>
                  {(["front", "middle", "back"] as const).map((r) => (
                    <td key={r} className="py-1 text-right">{DEFAULT_ROYALTY_TABLE[r][row] ?? 0}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>แต้มรวมของทุกคนในแต่ละรอบเป็น 0 เสมอ เล่นเพื่อสะสมแต้ม ไม่มีเงินจริง</p>
      </Section>
    </Screen>
  );
}
