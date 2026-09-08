export function AreaChart({
  data,
  className = "text-ink",
  height = 72,
}: {
  data: number[];
  className?: string;
  height?: number;
}) {
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 100},${100 - v}`).join(" ");
  const area = `0,100 ${pts} 100,100`;
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ height }} className={`w-full ${className}`}>
      <polygon points={area} fill="currentColor" opacity="0.18" />
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function Gauge({ value, label }: { value: number; label: string }) {
  const r = 42;
  const c = Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 100 56" className="w-24">
        <path
          d="M 4 52 A 46 46 0 0 1 96 52"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          opacity="0.2"
        />
        <path
          d="M 4 52 A 46 46 0 0 1 96 52"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeDasharray={`${(pct / 100) * c * 1.09} 999`}
          strokeLinecap="butt"
        />
      </svg>
      <div>
        <div className="font-display font-black text-2xl leading-none tabular-nums">{pct.toFixed(0)}%</div>
        <div className="text-[9px] font-bold tracking-widest opacity-70 uppercase">{label}</div>
      </div>
    </div>
  );
}

export function Bars({ data, className = "" }: { data: number[]; className?: string }) {
  return (
    <div className={`flex items-end gap-1 h-24 ${className}`}>
      {data.map((v, i) => (
        <div
          key={i}
          className="flex-1 bg-current transition-all"
          style={{ height: `${Math.max(4, v)}%`, opacity: 0.35 + (i / data.length) * 0.65 }}
        />
      ))}
    </div>
  );
}
