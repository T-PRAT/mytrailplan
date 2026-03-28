import { UPHILL_COLORS, DOWNHILL_COLORS } from '../lib/colors';

const ITEMS = [
  { label: '> 30%',   uphillHex: UPHILL_COLORS[4].hex, downhillHex: DOWNHILL_COLORS[4].hex },
  { label: '20–30%',  uphillHex: UPHILL_COLORS[3].hex, downhillHex: DOWNHILL_COLORS[3].hex },
  { label: '10–20%',  uphillHex: UPHILL_COLORS[2].hex, downhillHex: DOWNHILL_COLORS[2].hex },
  { label: '5–10%',   uphillHex: UPHILL_COLORS[1].hex, downhillHex: DOWNHILL_COLORS[1].hex },
  { label: '0–5%',    uphillHex: UPHILL_COLORS[0].hex, downhillHex: DOWNHILL_COLORS[0].hex },
];

export function SlopeLegend() {
  return (
    <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 px-4 py-3 bg-gray-900 rounded-xl border border-gray-700">
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500 font-medium">▼ Descente</span>
        {ITEMS.map((item) => (
          <span key={item.label} className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ background: item.downhillHex }} />
            <span className="text-[11px] text-gray-500">{item.label}</span>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500 font-medium">▲ Montée</span>
        {ITEMS.map((item) => (
          <span key={item.label} className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ background: item.uphillHex }} />
            <span className="text-[11px] text-gray-500">{item.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
