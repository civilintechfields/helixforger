export type Status = "RUNNING" | "STALLED" | "PROBLEM" | "STOPPED";

export type Metric = { key: string; label: string; unit: string; value: number; max: number };

export type Machine = {
  id: string;
  station: string;
  name: string;
  status: Status;
  metrics: Metric[];
  history: number[];
  output: number;
  uptime: number;
};

export type LogEntry = {
  id: number;
  time: string;
  level: "INFO" | "WARN" | "CRIT";
  machine: string;
  message: string;
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const drift = (v: number, amount: number) => v + (Math.random() - 0.5) * amount;

export const initialMachines: Machine[] = [
  {
    id: "M01",
    station: "STATION 01",
    name: "CENTRAL MILL",
    status: "RUNNING",
    output: 0,
    uptime: 99.2,
    history: Array.from({ length: 40 }, () => 55 + Math.random() * 20),
    metrics: [
      { key: "rpm", label: "ROTATION", unit: "RPM", value: 14200, max: 18000 },
      { key: "torque", label: "TORQUE", unit: "NM", value: 88.4, max: 140 },
      { key: "temp", label: "SPINDLE TEMP", unit: "°C", value: 62, max: 110 },
      { key: "vib", label: "VIBRATION", unit: "MM/S", value: 4.2, max: 12 },
    ],
  },
  {
    id: "M02",
    station: "STATION 02",
    name: "HYDRAULIC PRESS",
    status: "RUNNING",
    output: 0,
    uptime: 97.5,
    history: Array.from({ length: 40 }, () => 40 + Math.random() * 25),
    metrics: [
      { key: "pressure", label: "PRESSURE", unit: "BAR", value: 22.4, max: 40 },
      { key: "temp", label: "ACTUATOR TEMP", unit: "°C", value: 74, max: 120 },
      { key: "cycle", label: "CYCLE TIME", unit: "S", value: 8.4, max: 20 },
      { key: "load", label: "LOAD", unit: "%", value: 61, max: 100 },
    ],
  },
];

export function stepMachine(m: Machine): { machine: Machine; events: Omit<LogEntry, "id" | "time">[] } {
  const events: Omit<LogEntry, "id" | "time">[] = [];
  const active = m.status === "RUNNING";

  const metrics = m.metrics.map((metric) => {
    if (!active) {
      const target = metric.key === "temp" ? metric.value * 0.995 : metric.value * 0.85;
      return { ...metric, value: Math.round(target * 10) / 10 };
    }
    const scale = metric.max * 0.05;
    const next = clamp(drift(metric.value, scale), metric.max * 0.15, metric.max);
    return { ...metric, value: Math.round(next * 10) / 10 };
  });

  const temp = metrics.find((x) => x.key === "temp");
  const vib = metrics.find((x) => x.key === "vib");
  let status = m.status;

  if (active && temp && temp.value > temp.max * 0.85) {
    status = "PROBLEM";
    events.push({ level: "CRIT", machine: m.name, message: `Thermal limit exceeded — ${temp.value.toFixed(1)}°C` });
  } else if (active && vib && vib.value > vib.max * 0.75) {
    status = "STALLED";
    events.push({ level: "WARN", machine: m.name, message: `Vibration above baseline — ${vib.value.toFixed(1)} mm/s` });
  } else if (active) {
    status = "RUNNING";
  }

  const load = active ? clamp(drift(m.history[m.history.length - 1] ?? 60, 14), 12, 100) : 4;
  const history = [...m.history.slice(1), load];

  return {
    machine: {
      ...m,
      metrics,
      status,
      history,
      output: m.output + (active ? Math.round(2 + Math.random() * 4) : 0),
      uptime: clamp(active ? m.uptime + 0.01 : m.uptime - 0.08, 60, 100),
    },
    events,
  };
}

export function nowStamp(): string {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}
