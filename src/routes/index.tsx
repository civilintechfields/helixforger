import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  initialMachines,
  nowStamp,
  stepMachine,
  type LogEntry,
  type Machine,
  type Status,
} from "@/lib/factory-sim";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HelixForge Console — Mini Smart Factory Monitoring" },
      {
        name: "description",
        content:
          "Live monitoring console for two simulated Industry 4.0 machines: telemetry, alarms, throughput and efficiency.",
      },
      { property: "og:title", content: "HelixForge Console — Mini Smart Factory Monitoring" },
      {
        property: "og:description",
        content: "Live telemetry, alarms and efficiency for two simulated factory machines.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Console,
});

const statusTone: Record<Status, { bg: string; text: string; chip: string }> = {
  RUNNING: { bg: "bg-ok", text: "text-ink", chip: "bg-ink text-ok" },
  STALLED: { bg: "bg-warn", text: "text-ink", chip: "bg-ink text-warn" },
  PROBLEM: { bg: "bg-crit", text: "text-white", chip: "bg-white text-crit" },
  STOPPED: { bg: "bg-line", text: "text-body", chip: "bg-ink text-dim" },
};

function useTheme() {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    const saved = localStorage.getItem("hf-theme");
    if (saved) setDark(saved === "dark");
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("light", !dark);
    localStorage.setItem("hf-theme", dark ? "dark" : "light");
  }, [dark]);
  return { dark, toggle: () => setDark((d) => !d) };
}

function Sparkline({ data, tone }: { data: number[]; tone: string }) {
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * 100},${100 - v}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-16 w-full">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" className={tone} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Console() {
  const { dark, toggle } = useTheme();
  const [machines, setMachines] = useState<Machine[]>(initialMachines);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [clock, setClock] = useState("--:--:--");
  const logId = useRef(0);

  useEffect(() => {
    const tick = setInterval(() => {
      setClock(nowStamp());
      setMachines((prev) => {
        const newEvents: LogEntry[] = [];
        const next = prev.map((m) => {
          const { machine, events } = stepMachine(m);
          events.forEach((e) => {
            newEvents.push({ ...e, id: ++logId.current, time: nowStamp() });
          });
          return machine;
        });
        if (newEvents.length) setLog((l) => [...newEvents, ...l].slice(0, 30));
        return next;
      });
    }, 1500);
    return () => clearInterval(tick);
  }, []);

  const setStatus = (id: string, status: Status, message: string, level: LogEntry["level"]) => {
    setMachines((prev) => prev.map((m) => (m.id === id ? { ...m, status } : m)));
    const m = machines.find((x) => x.id === id);
    setLog((l) =>
      [{ id: ++logId.current, time: nowStamp(), level, machine: m?.name ?? id, message }, ...l].slice(0, 30),
    );
  };

  const totalOutput = machines.reduce((s, m) => s + m.output, 0);
  const running = machines.filter((m) => m.status === "RUNNING").length;
  const problems = machines.filter((m) => m.status === "PROBLEM").length;
  const efficiency = machines.reduce((s, m) => s + m.uptime, 0) / machines.length;
  const emergency = problems > 0;

  return (
    <div
      className={`min-h-screen bg-ink text-body font-mono flex flex-col selection:bg-crit selection:text-white border-[12px] transition-colors ${
        emergency ? "border-crit" : "border-line"
      }`}
    >
      <header className="border-b-2 border-line bg-panel/80 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-4 px-4 py-3">
          <div className="flex items-center gap-2">
            <div
              className={`size-3 ${emergency ? "bg-crit animate-[pulse-fast_0.5s_infinite]" : "bg-ok"}`}
            />
            <span className="font-display font-black tracking-tighter text-2xl leading-none">
              HELIX<span className="text-crit">FORGE</span>
            </span>
          </div>

          <div className="h-8 w-px bg-line mx-2" />

          <div className="flex items-end gap-0.5 h-5 w-24">
            {[0.4, 0.6, 0.3, 0.5, 0.7, 0.4].map((d, i) => (
              <div
                key={i}
                className={`w-1.5 ${emergency ? "bg-crit" : "bg-ok"}`}
                style={{ animation: `bar-bounce ${d}s infinite`, animationDelay: `${i * 50}ms` }}
              />
            ))}
          </div>

          <div className="ml-auto flex items-center gap-6 text-[11px] font-bold">
            <div className="flex flex-col items-end">
              <span className="text-dim">MASTER CLOCK</span>
              <span>{clock}</span>
            </div>
            <div className={`flex flex-col items-end ${emergency ? "text-crit" : "text-ok"}`}>
              <span>SYSTEM STATUS</span>
              <span>{emergency ? "CRITICAL FAULT" : "NOMINAL"}</span>
            </div>
            <button
              onClick={toggle}
              className="border-2 border-line px-3 py-2 text-[10px] font-bold uppercase tracking-widest hover:border-ok transition-colors"
            >
              {dark ? "Light mode" : "Dark mode"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x-2 divide-line border-t border-line">
          <div className="p-4">
            <div className="text-[10px] tracking-[0.2em] text-dim uppercase">Line Efficiency</div>
            <div className="mt-1 font-display font-black text-3xl">
              {efficiency.toFixed(1)}
              <span className="text-sm text-dim">%</span>
            </div>
          </div>
          <div className="p-4">
            <div className="text-[10px] tracking-[0.2em] text-dim uppercase">Total Output</div>
            <div className="mt-1 font-display font-black text-3xl tabular-nums">{totalOutput}</div>
          </div>
          <div className="p-4 bg-ok text-ink">
            <div className="text-[10px] tracking-[0.2em] opacity-70 font-bold uppercase">Operational</div>
            <div className="mt-1 font-display font-black text-3xl">0{running} BAY</div>
          </div>
          <div className={`p-4 ${problems ? "bg-crit text-white" : "bg-warn text-ink"}`}>
            <div className="text-[10px] tracking-[0.2em] opacity-70 font-bold uppercase">Problem</div>
            <div className="mt-1 font-display font-black text-3xl">0{problems} BAY</div>
          </div>
        </div>
      </header>

      <main className="p-6 grid grid-cols-1 xl:grid-cols-2 gap-6 flex-1">
        {machines.map((m) => {
          const tone = statusTone[m.status];
          return (
            <section key={m.id} className={`${tone.bg} border-2 flex flex-col`} style={{ borderColor: "transparent" }}>
              <div className="p-4 flex items-center justify-between border-b-2 border-ink/10">
                <div className={tone.text}>
                  <div className="text-[11px] font-bold opacity-60 tracking-widest">{m.station}</div>
                  <div className="font-display font-black text-xl">{m.name}</div>
                </div>
                <div className={`${tone.chip} px-3 py-1 text-xs font-black tracking-tighter`}>{m.status}</div>
              </div>

              <div className="p-6 grid grid-cols-2 gap-4 bg-ink/5 flex-1">
                {m.metrics.map((metric) => (
                  <div key={metric.key} className="bg-ink/10 p-3 outline-1 outline-ink/20">
                    <div className={`text-[9px] font-bold ${tone.text}`}>{metric.label}</div>
                    <div className={`text-2xl font-display font-black ${tone.text} tabular-nums`}>
                      {metric.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}{" "}
                      <span className="text-xs">{metric.unit}</span>
                    </div>
                  </div>
                ))}
                <div className={`col-span-2 bg-ink/10 p-3 outline-1 outline-ink/20 ${tone.text}`}>
                  <div className="text-[9px] font-bold mb-1">LOAD TREND · LIVE</div>
                  <Sparkline data={m.history} tone={tone.text} />
                </div>
              </div>

              <div className="p-4 bg-ink flex flex-col gap-2">
                <button
                  onClick={() => setStatus(m.id, "STOPPED", "Emergency stop engaged by operator", "CRIT")}
                  className="w-full py-4 text-crit bg-ink border-2 border-crit font-black text-sm tracking-[0.2em] hover:bg-crit hover:text-white transition-colors uppercase"
                >
                  Emergency Stop
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setStatus(m.id, "RUNNING", "Cycle start command issued", "INFO")}
                    className="py-2 bg-line text-[10px] font-bold uppercase text-body hover:bg-ok hover:text-ink transition-colors"
                  >
                    Start Cycle
                  </button>
                  <button
                    onClick={() => setStatus(m.id, "RUNNING", "Fault acknowledged, controller reset", "INFO")}
                    className="py-2 bg-line text-[10px] font-bold uppercase text-body hover:bg-warn hover:text-ink transition-colors"
                  >
                    Reset Fault
                  </button>
                </div>
              </div>
            </section>
          );
        })}
      </main>

      <footer className="bg-panel border-t-2 border-line p-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="text-[10px] text-dim font-bold tracking-widest">SYSTEM LOG ACTIVE</div>
          <div className="ml-auto px-4 py-2 bg-line text-[11px] font-bold">USER: ADMIN_01</div>
          <div
            className={`px-4 py-2 text-[11px] font-bold ${emergency ? "bg-crit text-white" : "bg-ok text-ink"}`}
          >
            {emergency ? "EMERGENCY MODE" : "NORMAL MODE"}
          </div>
        </div>
        <div className="max-h-40 overflow-y-auto divide-y divide-line/60 text-[12px]">
          {log.length === 0 && <div className="py-2 text-dim">Awaiting telemetry events…</div>}
          {log.map((e) => (
            <div key={e.id} className="flex items-center gap-3 py-1.5">
              <span className="w-20 text-dim tabular-nums">{e.time}</span>
              <span
                className={`w-14 font-black ${
                  e.level === "CRIT" ? "text-crit" : e.level === "WARN" ? "text-warn" : "text-ok"
                }`}
              >
                {e.level}
              </span>
              <span className="w-40 text-dim font-bold truncate">{e.machine}</span>
              <span>{e.message}</span>
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}
