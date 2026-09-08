import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  hoursToService,
  initialMachines,
  nowStamp,
  oee,
  stepMachine,
  type LogEntry,
  type Machine,
  type Status,
} from "@/lib/factory-sim";
import { AreaChart, Bars, Gauge } from "@/components/factory/Charts";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HelixForge Console — Mini Smart Factory Monitoring" },
      {
        name: "description",
        content:
          "Industry 4.0 prototype: two simulated machines streaming live telemetry, alarms, OEE and predictive maintenance to one monitoring console.",
      },
      { property: "og:title", content: "HelixForge Console — Mini Smart Factory Monitoring" },
      {
        property: "og:description",
        content: "Live telemetry, alarms, OEE and predictive service windows for two simulated machines.",
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

function Kpi({
  label,
  value,
  unit,
  sub,
  tone = "",
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className={`p-4 ${tone}`}>
      <div className="text-[10px] tracking-[0.2em] uppercase opacity-60 font-bold">{label}</div>
      <div className="mt-1 font-display font-black text-3xl tabular-nums leading-none">
        {value}
        {unit && <span className="text-sm opacity-60"> {unit}</span>}
      </div>
      {sub && <div className="mt-1 text-[10px] font-bold opacity-60 tracking-wide">{sub}</div>}
    </div>
  );
}

function Console() {
  const { dark, toggle } = useTheme();
  const [machines, setMachines] = useState<Machine[]>(initialMachines);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [clock, setClock] = useState("--:--:--");
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "CRIT" | "WARN">("ALL");
  const [stress, setStress] = useState<Record<string, number>>({});
  const [lineHistory, setLineHistory] = useState<number[]>(Array.from({ length: 32 }, () => 40 + Math.random() * 30));
  const logId = useRef(0);

  const pushLog = (level: LogEntry["level"], machine: string, message: string) =>
    setLog((l) => [{ id: ++logId.current, time: nowStamp(), level, machine, message }, ...l].slice(0, 60));

  useEffect(() => {
    if (paused) return;
    const tick = setInterval(() => {
      setClock(nowStamp());
      setMachines((prev) => {
        const newEvents: LogEntry[] = [];
        const next = prev.map((m) => {
          const { machine, events } = stepMachine(m, stress[m.id] ?? 0);
          events.forEach((e) => newEvents.push({ ...e, id: ++logId.current, time: nowStamp() }));
          return machine;
        });
        if (newEvents.length) setLog((l) => [...newEvents, ...l].slice(0, 60));
        setLineHistory((h) => [
          ...h.slice(1),
          next.reduce((s, m) => s + (m.status === "RUNNING" ? (m.history.at(-1) ?? 0) : 3), 0) / next.length,
        ]);
        return next;
      });
      setStress((s) => {
        const decayed: Record<string, number> = {};
        Object.entries(s).forEach(([k, v]) => {
          if (v > 0.05) decayed[k] = v * 0.75;
        });
        return decayed;
      });
    }, 1500 / speed);
    return () => clearInterval(tick);
  }, [speed, paused, stress]);

  const setStatus = (m: Machine, status: Status, message: string, level: LogEntry["level"]) => {
    setMachines((prev) => prev.map((x) => (x.id === m.id ? { ...x, status } : x)));
    pushLog(level, m.name, message);
  };

  const setThrottle = (m: Machine, amount: number, absolute = false) => {
    const next = Math.max(0, Math.min(100, absolute ? amount : m.throttle + amount));
    setMachines((prev) => prev.map((x) => (x.id === m.id ? { ...x, throttle: next } : x)));
    pushLog("INFO", m.name, `Speed setpoint changed to ${next}%`);
  };

  const injectFault = (m: Machine) => {
    setStress((s) => ({ ...s, [m.id]: 1.4 }));
    pushLog("WARN", m.name, "Demo scenario injected — thermal & vibration stress ramp");
  };

  const acknowledge = (id: number) =>
    setLog((l) => l.map((e) => (e.id === id ? { ...e, ack: true } : e)));

  const totalOutput = machines.reduce((s, m) => s + m.output, 0);
  const running = machines.filter((m) => m.status === "RUNNING").length;
  const problems = machines.filter((m) => m.status === "PROBLEM").length;
  const lineOee = machines.reduce((s, m) => s + oee(m), 0) / machines.length;
  const energy = machines.reduce((s, m) => s + m.energy, 0);
  const openAlarms = log.filter((e) => !e.ack && e.level !== "INFO").length;
  const emergency = problems > 0;

  const visibleLog = useMemo(
    () => (filter === "ALL" ? log : log.filter((e) => e.level === filter)),
    [log, filter],
  );

  return (
    <div
      className={`min-h-screen bg-ink text-body font-mono flex flex-col selection:bg-crit selection:text-white border-[12px] transition-colors ${
        emergency ? "border-crit" : "border-line"
      }`}
    >
      {/* CONSOLE HEADER */}
      <header className="border-b-2 border-line bg-panel/80 backdrop-blur-md sticky top-0 z-20">
        <div className="flex flex-wrap items-center gap-4 px-5 py-3">
          <div className="flex items-center gap-2">
            <div className={`size-3 ${emergency ? "bg-crit animate-[pulse-fast_0.5s_infinite]" : "bg-ok"}`} />
            <span className="font-display font-black tracking-tighter text-2xl leading-none">
              HELIX<span className="text-crit">FORGE</span>
            </span>
          </div>
          <div className="hidden md:block h-8 w-px bg-line" />
          <div className="hidden md:block text-[10px] font-bold tracking-[0.2em] text-dim uppercase leading-tight">
            Mini smart factory · Industry 4.0 pilot cell
            <br />
            2 machines · 1 monitoring platform
          </div>

          <div className="hidden lg:flex items-end gap-0.5 h-5 w-24">
            {[0.4, 0.6, 0.3, 0.5, 0.7, 0.4].map((d, i) => (
              <div
                key={i}
                className={`w-1.5 ${emergency ? "bg-crit" : "bg-ok"}`}
                style={{ animation: `bar-bounce ${d}s infinite`, animationDelay: `${i * 50}ms` }}
              />
            ))}
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-4 text-[11px] font-bold">
            <div className="flex flex-col items-end">
              <span className="text-dim">MASTER CLOCK</span>
              <span className="tabular-nums">{clock}</span>
            </div>
            <div className={`flex flex-col items-end ${emergency ? "text-crit" : "text-ok"}`}>
              <span>SYSTEM STATUS</span>
              <span>{emergency ? "CRITICAL FAULT" : "NOMINAL"}</span>
            </div>
            <div className="flex items-center border-2 border-line">
              {[1, 2, 4].map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`px-3 py-2 text-[10px] uppercase tracking-widest ${
                    speed === s ? "bg-ok text-ink" : "hover:text-ok"
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
            <button
              onClick={() => setPaused((p) => !p)}
              className="border-2 border-line px-3 py-2 text-[10px] uppercase tracking-widest hover:border-warn transition-colors"
            >
              {paused ? "Resume feed" : "Pause feed"}
            </button>
            <button
              onClick={toggle}
              className="border-2 border-line px-3 py-2 text-[10px] uppercase tracking-widest hover:border-ok transition-colors"
            >
              {dark ? "Light mode" : "Dark mode"}
            </button>
          </div>
        </div>

        {/* KPI STRIP */}
        <div className="grid grid-cols-2 lg:grid-cols-6 divide-x-2 divide-y-2 lg:divide-y-0 divide-line border-t border-line">
          <Kpi label="Line OEE" value={lineOee.toFixed(1)} unit="%" sub="availability × perf × quality" />
          <Kpi label="Total Output" value={String(totalOutput)} unit="u" sub="since session start" />
          <Kpi label="Energy Draw" value={energy.toFixed(1)} unit="kW" sub="both machines live" />
          <Kpi label="Open Alarms" value={String(openAlarms)} sub="unacknowledged" tone={openAlarms ? "bg-warn text-ink" : ""} />
          <Kpi label="Operational" value={`0${running} / 02`} sub="bays running" tone="bg-ok text-ink" />
          <Kpi
            label="Problem"
            value={`0${problems} BAY`}
            sub={emergency ? "intervention required" : "all clear"}
            tone={problems ? "bg-crit text-white" : ""}
          />
        </div>
      </header>

      {/* MACHINE BAYS */}
      <main className="p-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
        {machines.map((m) => {
          const tone = statusTone[m.status];
          const service = hoursToService(m);
          return (
            <section key={m.id} className={`${tone.bg} flex flex-col`}>
              <div className="p-4 flex items-center justify-between border-b-2 border-ink/10">
                <div className={tone.text}>
                  <div className="text-[11px] font-bold opacity-60 tracking-widest">
                    {m.station} · {m.model}
                  </div>
                  <div className="font-display font-black text-2xl">{m.name}</div>
                </div>
                <div className={`${tone.chip} px-3 py-1 text-xs font-black tracking-tighter`}>{m.status}</div>
              </div>

              <div className={`p-5 grid grid-cols-2 gap-3 bg-ink/5 flex-1 ${tone.text}`}>
                {m.metrics.map((metric) => (
                  <div key={metric.key} className="bg-ink/10 p-3 outline-1 outline-ink/20">
                    <div className="text-[9px] font-bold tracking-widest opacity-70">{metric.label}</div>
                    <div className="text-2xl font-display font-black tabular-nums">
                      {metric.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}{" "}
                      <span className="text-xs">{metric.unit}</span>
                    </div>
                    <div className="mt-2 h-1 bg-ink/20">
                      <div
                        className="h-full bg-ink/70"
                        style={{ width: `${Math.min(100, (metric.value / metric.max) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}

                <div className="col-span-2 grid grid-cols-2 gap-3">
                  <div className="bg-ink/10 p-3 outline-1 outline-ink/20">
                    <div className="text-[9px] font-bold tracking-widest opacity-70 mb-1">LOAD · LIVE 60S</div>
                    <AreaChart data={m.history} className={tone.text} />
                  </div>
                  <div className="bg-ink/10 p-3 outline-1 outline-ink/20">
                    <div className="text-[9px] font-bold tracking-widest opacity-70 mb-1">THERMAL · LIVE 60S</div>
                    <AreaChart data={m.tempHistory} className={tone.text} />
                  </div>
                </div>

                <div className="col-span-2 grid grid-cols-3 gap-3">
                  <div className="bg-ink/10 p-3 outline-1 outline-ink/20">
                    <Gauge value={oee(m)} label="Machine OEE" />
                  </div>
                  <div className="bg-ink/10 p-3 outline-1 outline-ink/20">
                    <Gauge value={m.health} label="Asset health" />
                  </div>
                  <div className="bg-ink/10 p-3 outline-1 outline-ink/20 flex flex-col justify-center">
                    <div className="text-[9px] font-bold tracking-widest opacity-70">PREDICTED SERVICE</div>
                    <div className="font-display font-black text-2xl tabular-nums">{service} h</div>
                    <div className="text-[9px] font-bold opacity-70">
                      {service < 60 ? "schedule maintenance" : "within tolerance"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-ink flex flex-col gap-2">
                <div className="border-2 border-line p-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[9px] font-bold tracking-widest text-dim uppercase">
                      Speed setpoint
                    </span>
                    <span className="text-[10px] font-bold text-dim tabular-nums">
                      actual {Math.round(m.ramp)}%
                    </span>
                  </div>
                  <div className="font-display font-black text-2xl tabular-nums text-body">
                    {Math.round(m.throttle)}%
                  </div>
                  <div className="mt-2 h-1.5 bg-line">
                    <div className="h-full bg-ok transition-all" style={{ width: `${m.ramp}%` }} />
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {[
                      { label: "Idle", set: () => setThrottle(m, 20, true) },
                      { label: "− Speed", set: () => setThrottle(m, -10) },
                      { label: "+ Speed", set: () => setThrottle(m, 10) },
                      { label: "Max", set: () => setThrottle(m, 100, true) },
                    ].map((b) => (
                      <button
                        key={b.label}
                        onClick={b.set}
                        className="py-2 bg-line text-[10px] font-bold uppercase text-body hover:bg-ok hover:text-ink transition-colors"
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => setStatus(m, "STOPPED", "Emergency stop engaged by operator", "CRIT")}
                  className="w-full py-4 text-crit bg-ink border-2 border-crit font-black text-sm tracking-[0.2em] hover:bg-crit hover:text-white transition-colors uppercase"
                >
                  Emergency Stop
                </button>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setStatus(m, "RUNNING", "Cycle start command issued", "INFO")}
                    className="py-2 bg-line text-[10px] font-bold uppercase text-body hover:bg-ok hover:text-ink transition-colors"
                  >
                    Start cycle
                  </button>
                  <button
                    onClick={() => setStatus(m, "RUNNING", "Fault acknowledged, controller reset", "INFO")}
                    className="py-2 bg-line text-[10px] font-bold uppercase text-body hover:bg-warn hover:text-ink transition-colors"
                  >
                    Reset fault
                  </button>
                  <button
                    onClick={() => injectFault(m)}
                    className="py-2 bg-line text-[10px] font-bold uppercase text-body hover:bg-crit hover:text-white transition-colors"
                  >
                    Demo fault
                  </button>
                </div>
              </div>
            </section>
          );
        })}
      </main>

      {/* LINE ANALYTICS */}
      <section className="px-6 pb-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-panel border-2 border-line p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] tracking-[0.2em] text-dim font-bold uppercase">
              Line throughput index · rolling window
            </div>
            <div className="text-[10px] text-dim font-bold">avg of both stations</div>
          </div>
          <div className="text-ok">
            <Bars data={lineHistory} />
          </div>
        </div>
        <div className="bg-panel border-2 border-line p-5 grid grid-cols-2 gap-4">
          {machines.map((m) => (
            <div key={m.id}>
              <div className="text-[10px] tracking-[0.2em] text-dim font-bold uppercase truncate">{m.name}</div>
              <div className="mt-2 font-display font-black text-2xl tabular-nums">{m.output} u</div>
              <div className="text-[10px] text-dim font-bold">quality {m.quality.toFixed(1)}%</div>
              <div className="text-[10px] text-dim font-bold">uptime {m.uptime.toFixed(1)}%</div>
              <div className="text-[10px] text-dim font-bold">energy {m.energy.toFixed(1)} kW</div>
            </div>
          ))}
        </div>
      </section>

      {/* EVENT LOG */}
      <footer className="bg-panel border-t-2 border-line p-4 mt-auto">
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <div className="text-[10px] text-dim font-bold tracking-widest">SYSTEM LOG ACTIVE</div>
          <div className="flex items-center border-2 border-line">
            {(["ALL", "WARN", "CRIT"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest ${
                  filter === f ? "bg-line text-body" : "text-dim hover:text-body"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="ml-auto px-4 py-2 bg-line text-[11px] font-bold">USER: ADMIN_01</div>
          <div className={`px-4 py-2 text-[11px] font-bold ${emergency ? "bg-crit text-white" : "bg-ok text-ink"}`}>
            {emergency ? "EMERGENCY MODE" : "NORMAL MODE"}
          </div>
        </div>
        <div className="max-h-52 overflow-y-auto divide-y divide-line/60 text-[12px]">
          {visibleLog.length === 0 && <div className="py-2 text-dim">Awaiting telemetry events…</div>}
          {visibleLog.map((e) => (
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
              <span className="flex-1 truncate">{e.message}</span>
              {e.level !== "INFO" &&
                (e.ack ? (
                  <span className="text-[10px] font-bold text-dim uppercase">ack</span>
                ) : (
                  <button
                    onClick={() => acknowledge(e.id)}
                    className="text-[10px] font-bold uppercase border border-line px-2 py-1 hover:border-ok hover:text-ok"
                  >
                    Ack
                  </button>
                ))}
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}
