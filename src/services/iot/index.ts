import { SensorValues } from "../../engine/c45";

export type SensorReading = SensorValues & {
  id: string;
  pond: string;
  timestamp: string;
  source: "SIMULASI" | "ESP32 REST" | "CACHE LOKAL" | "ESP32_LIVE" | "SIKLUS_10_MENIT" | "SIMULASI_UJI" | "UJI_KALIBRASI";
  rawValues?: SensorValues;
  receivedAt?: string;
  latencyMs?: number;
  isComplete?: boolean;
};

export type SensorConfig = { endpoint: string; deviceId: string };

export function simulatedReading(previous?: SensorValues, pond = "Kolam A1"): SensorReading {
  const variation = () => (Math.random() - 0.5);
  return {
    id: `ESP32-AQP-${pond.endsWith("A2") ? "A2" : "A1"}`,
    pond,
    timestamp: new Date().toISOString(),
    source: "SIMULASI",
    temperature: clamp((previous?.temperature ?? 29.4) + variation() * 0.5, 27.1, 33.2, 1),
    ph: clamp((previous?.ph ?? 7.9) + variation() * 0.12, 6.8, 8.8, 2),
    salinity: clamp((previous?.salinity ?? 21) + variation() * 1.4, 12, 28, 1),
  };
}

export async function fetchEsp32Reading(config: SensorConfig, pond: string): Promise<SensorReading> {
  if (!config.endpoint.trim()) throw new Error("URL REST ESP32 belum diatur.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(config.endpoint.trim(), { signal: controller.signal });
    if (!response.ok) throw new Error(`REST API merespons HTTP ${response.status}.`);
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object") throw new Error("Data sensor tidak valid.");
    const data = payload as Record<string, unknown>;
    const temperature = parseSensorValue(data.temperature ?? data.suhu, "temperature");
    const ph = parseSensorValue(data.ph, "ph");
    const salinity = parseSensorValue(data.salinity ?? data.salinitas, "salinity");
    const parsedTimestamp = typeof data.timestamp === "string" ? Date.parse(data.timestamp) : Number.NaN;
    const hasValidTimestamp = Number.isFinite(parsedTimestamp);
    const timestamp = hasValidTimestamp
      ? new Date(parsedTimestamp).toISOString()
      : new Date().toISOString();
    return {
      id: String(data.deviceId ?? config.deviceId ?? data.pond_id ?? "ESP32-AQP-A1"),
      pond,
      timestamp,
      source: "ESP32 REST",
      temperature,
      ph,
      salinity,
      isComplete: hasValidTimestamp,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function clamp(value: number, min: number, max: number, digits: number): number {
  const bounded = Math.min(max, Math.max(min, value));
  return Number(bounded.toFixed(digits));
}

function parseSensorValue(value: unknown, field: string): number {
  if ((typeof value !== "number" && typeof value !== "string") || (typeof value === "string" && !value.trim())) {
    throw new Error(`Payload harus memiliki ${field} numerik.`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Nilai ${field} pada payload bukan angka yang valid.`);
  return parsed;
}
