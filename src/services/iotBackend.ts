import { Decision, evaluateWater, SplitPoints } from "../engine/c45";
import { SensorCalibration, StoredReading, addReading, defaultSensorCalibration, getReadings } from "../storage";
import { fetchEsp32Reading, SensorConfig, SensorReading } from "./iot";

export type TelemetryAdapter = {
  readLatest(config: SensorConfig, pond: string): Promise<SensorReading>;
};

export type PollResult = {
  reading: StoredReading;
  decision: Decision;
  fromCache: boolean;
  error?: string;
};

export const restTelemetryAdapter: TelemetryAdapter = {
  readLatest: fetchEsp32Reading,
};

export function applyCalibration(reading: SensorReading, calibration: SensorCalibration): SensorReading {
  const rawValues = reading.rawValues ?? {
    ph: reading.ph,
    temperature: reading.temperature,
    salinity: reading.salinity,
  };
  return {
    ...reading,
    ph: rawValues.ph + calibration.ph,
    temperature: rawValues.temperature + calibration.temperature,
    salinity: rawValues.salinity + calibration.salinity,
    rawValues,
  };
}

export async function recordTelemetry(
  reading: SensorReading,
  thresholds: SplitPoints,
  calibration: SensorCalibration = defaultSensorCalibration,
  metadata: { receivedAt?: string; latencyMs?: number; source?: SensorReading["source"] } = {},
): Promise<StoredReading> {
  const startedAt = Date.now();
  const calibrated = applyCalibration(reading, calibration);
  const receivedAt = metadata.receivedAt ?? new Date().toISOString();
  const latencyMs = metadata.latencyMs ?? Math.max(0, Date.now() - startedAt);
  const isComplete = [calibrated.ph, calibrated.temperature, calibrated.salinity].every(Number.isFinite)
    && Number.isFinite(Date.parse(calibrated.timestamp))
    && reading.isComplete !== false;
  const decision = evaluateWater(calibrated, thresholds);
  const saved: StoredReading = {
    ...calibrated,
    source: metadata.source ?? calibrated.source,
    receivedAt,
    latencyMs,
    isComplete,
    classification: decision.classification,
    recommendation: decision.recommendation,
  };
  await addReading(saved);
  return saved;
}

export async function pollTelemetry(
  config: SensorConfig,
  pond: string,
  thresholds: SplitPoints,
  calibration: SensorCalibration,
  adapter: TelemetryAdapter = restTelemetryAdapter,
  source: SensorReading["source"] = "ESP32_LIVE",
): Promise<PollResult> {
  let reading: SensorReading;
  const startedAt = Date.now();
  try {
    reading = await adapter.readLatest(config, pond);
  } catch (remoteError) {
    const message = messageOf(remoteError);
    const cachedReadings = await getReadings();
    const latest = cachedReadings.find((item) => item.source !== "SIMULASI_UJI" && item.source !== "UJI_KALIBRASI");
    if (!latest) {
      throw new Error(`Backend tidak terjangkau dan cache lokal belum memiliki data: ${message}`);
    }
    const cached = applyCalibration({ ...latest, source: "CACHE LOKAL" }, calibration);
    return {
      reading: { ...cached, classification: evaluateWater(cached, thresholds).classification },
      decision: evaluateWater(cached, thresholds),
      fromCache: true,
      error: message,
    };
  }

  const saved = await recordTelemetry(reading, thresholds, calibration, {
    receivedAt: new Date().toISOString(),
    latencyMs: Math.max(0, Date.now() - startedAt),
    source,
  });
  return {
    reading: saved,
    decision: evaluateWater(saved, thresholds),
    fromCache: false,
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
