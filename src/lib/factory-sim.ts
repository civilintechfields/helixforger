export type Status = "RUNNING" | "STALLED" | "PROBLEM" | "STOPPED";

export type Metric = { key: string; label: string; unit: string; value: number; max: number };

export type Machine = {
  id: string;
  station: string;
  name: string;
  model: string;
  status: Status;
  metrics: Metric[];
  history: number[];
  tempHistory: number[];
  output: number;
  uptime: number;
  quality: number;
  energy: number;
  health: number;
  throttle: number; // operator setpoint 0-100
  ramp: number; // actual spool-up 0-100, chases throttle slowly
};

export type LogEntry = {
  id: number;
  time: string;
  level: "INFO" | "WARN" | "CRIT";
  machine: string;
  message: string;
  ack?: boolean;
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const drift = (v: number, amount: number) => v + (Math.random() - 0.5) * amount;

export const initialMachines: Machine[] = [
  {
    id: "M01",
    station: "STATION 01",
    name: "CENTRAL MILL",
    model: "CNC-240 · 3-AXIS",
    status: "RUNNING",
    output: 0,
    uptime: 99.2,
    quality: 99.1,
    energy: 6.4,
    health: 92,
    throttle: 70,
    ramp: 70,
    history: Array.from({ length: 48 }, () => 55 + Math.random() * 20),
    tempHistory: Array.from({ length: 48 }, () => 55 + Math.random() * 10),
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
    model: "PRESS-120 · 40 BAR",
    status: "RUNNING",
    output: 0,
    uptime: 97.5,
    quality: 97.8,
    energy: 7.8,
    health: 78,
    throttle: 60,
    ramp: 60,
    history: Array.from({ length: 48 }, () => 40 + Math.random() * 25),
    tempHistory: Array.from({ length: 48 }, () => 60 + Math.random() * 12),
    metrics: [
      { key: "pressure", label: "PRESSURE", unit: "BAR", value: 22.4, max: 40 },
      { key: "temp", label: "ACTUATOR TEMP", unit: "°C", value: 74, max: 120 },
      { key: "cycle", label: "CYCLE TIME", unit: "S", value: 8.4, max: 20 },
      { key: "load", label: "LOAD", unit: "%", value: 61, max: 100 },
    ],
  },
];

export function stepMachine(
  m: Machine,
  stress = 0,
): { machine: Machine; events: Omit<LogEntry, "id" | "time">[] } {
  const events: Omit<LogEntry, "id" | "time">[] = [];
  const stopped = m.status === "STOPPED";
  const active = m.status === "RUNNING";

  // STOPPED = instant collapse to zero. RUNNING = slow spool-up toward throttle.
  const ramp = stopped
    ? 0
    : active
      ? m.ramp < m.throttle
        ? Math.min(m.throttle, m.ramp + 5) // slow start
        : Math.max(m.throttle, m.ramp - 9) // faster slow-down
      : Math.max(0, m.ramp - 12);
  const f = ramp / 100;

  const metrics = m.metrics.map((metric) => {
    if (stopped) {
      const target = metric.key === "temp" ? metric.value * 0.94 : 0;
      return { ...metric, value: Math.round(target * 10) / 10 };
    }
    const target = metric.max * (metric.key === "temp" ? 0.25 + f * 0.5 : 0.15 + f * 0.8);
    const eased = metric.value + (target - metric.value) * 0.35;
    const push = metric.key === "temp" || metric.key === "vib" ? stress * metric.max * 0.08 : 0;
    const next = clamp(drift(eased, metric.max * 0.04) + push, 0, metric.max);
    return { ...metric, value: Math.round(next * 10) / 10 };
  });

  const temp = metrics.find((x) => x.key === "temp");
  const vib = metrics.find((x) => x.key === "vib");
  let status = m.status;

  if (active && temp && temp.value > temp.max * 0.85) {
    status = "PROBLEM";
    events.push({
      level: "CRIT",
      machine: m.name,
      message: `Thermal limit exceeded — ${temp.value.toFixed(1)}°C, cooling loop under review`,
    });
  } else if (active && vib && vib.value > vib.max * 0.75) {
    status = "STALLED";
    events.push({
      level: "WARN",
      machine: m.name,
      message: `Vibration above baseline — ${vib.value.toFixed(1)} mm/s`,
    });
  } else if (active) {
    status = "RUNNING";
  }

  const load = stopped ? 0 : clamp(drift(ramp, 6) + stress * 8, 0, 100);
  const history = [...m.history.slice(1), load];
  const tempHistory = [...m.tempHistory.slice(1), stopped ? 0 : temp ? (temp.value / temp.max) * 100 : 0];

  const healthDrag = status === "PROBLEM" ? 0.8 : status === "STALLED" ? 0.3 : -0.15;

  return {
    machine: {
      ...m,
      metrics,
      status,
      ramp,
      history,
      tempHistory,
      output: m.output + (active ? Math.round((2 + Math.random() * 4) * f) : 0),
      uptime: clamp(active ? m.uptime + 0.01 : m.uptime - 0.08, 60, 100),
      quality: clamp(status === "RUNNING" ? m.quality + 0.02 : m.quality - 0.06, 80, 100),
      energy: stopped ? Math.max(0.2, m.energy * 0.5) : clamp(0.5 + f * 9 + stress, 0.2, 20),
      health: clamp(m.health - healthDrag, 5, 100),
    },
    events,
  };
}

export function oee(m: Machine): number {
  const performance = m.history[m.history.length - 1] ?? 60;
  return (m.uptime / 100) * (performance / 100) * (m.quality / 100) * 100;
}

export function hoursToService(m: Machine): number {
  return Math.max(0, Math.round((m.health - 20) * 1.8));
}

export function nowStamp(): string {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}
