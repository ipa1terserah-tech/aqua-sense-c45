import AsyncStorage from "@react-native-async-storage/async-storage";
import { SensorReading } from "../services/iot";
import { SensorValues, SplitPoints, splitPoints, WaterClass } from "../engine/c45";

const LOG_KEY = "@manero/readings-v1";
const ALERT_KEY = "@manero/alerts-v1";
const CONFIG_KEY = "@manero/device-config-v1";
const CALIBRATION_KEY = "@manero/calibration-v1";
const THRESHOLD_KEY = "@manero/c45-thresholds-v1";
const MAX_LOGS = 1500;
let readingWriteQueue: Promise<void> = Promise.resolve();

export type CalibrationTestResult = {
  reference: SensorValues;
  errors: SensorValues;
  errorPercentages: SensorValues;
  status: "Valid / Akurat" | "Perlu Kalibrasi Ulang";
};
export type StoredReading = SensorReading & {
  classification: WaterClass;
  recommendation?: string;
  calibrationTest?: CalibrationTestResult;
};
export type StoredAlert = { id: string; timestamp: string; message: string; severity: "warning" | "danger" };
export type SensorCalibration = { ph: number; temperature: number; salinity: number };
export const defaultSensorCalibration: SensorCalibration = { ph: 0, temperature: 0, salinity: 0 };

export async function getReadings(): Promise<StoredReading[]> {
  const value = await AsyncStorage.getItem(LOG_KEY);
  return value ? (JSON.parse(value) as StoredReading[]) : [];
}

export function addReading(reading: StoredReading): Promise<void> {
  const write = readingWriteQueue.then(async () => {
    const existing = await getReadings();
    await AsyncStorage.setItem(LOG_KEY, JSON.stringify([reading, ...existing].slice(0, MAX_LOGS)));
  });
  readingWriteQueue = write.then(() => undefined, () => undefined);
  return write;
}

export async function getAlerts(): Promise<StoredAlert[]> {
  const value = await AsyncStorage.getItem(ALERT_KEY);
  return value ? (JSON.parse(value) as StoredAlert[]) : [];
}

export async function addAlert(alert: StoredAlert): Promise<void> {
  const existing = await getAlerts();
  await AsyncStorage.setItem(ALERT_KEY, JSON.stringify([alert, ...existing].slice(0, 250)));
}

export async function getDeviceConfig(): Promise<{ endpoint: string; deviceId: string }> {
  const value = await AsyncStorage.getItem(CONFIG_KEY);
  return value ? JSON.parse(value) as { endpoint: string; deviceId: string } : { endpoint: "", deviceId: "ESP32-AQP-A1" };
}

export async function saveDeviceConfig(config: { endpoint: string; deviceId: string }): Promise<void> {
  await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export async function getCalibration(): Promise<SensorCalibration> {
  const value = await AsyncStorage.getItem(CALIBRATION_KEY);
  if (!value) return { ...defaultSensorCalibration };
  const parsed = JSON.parse(value) as Partial<Record<keyof SensorCalibration, unknown>>;
  return validateCalibration({
    ph: normalizeOffset(readStoredOffset(parsed.ph, defaultSensorCalibration.ph, "pH"), 1, 0.05, 2),
    temperature: normalizeOffset(readStoredOffset(parsed.temperature, defaultSensorCalibration.temperature, "suhu"), 5, 0.1, 1),
    salinity: normalizeOffset(readStoredOffset(parsed.salinity, defaultSensorCalibration.salinity, "salinitas"), 5, 0.1, 1),
  });
}

export async function saveCalibration(calibration: SensorCalibration): Promise<void> {
  validateCalibration(calibration);
  await AsyncStorage.setItem(CALIBRATION_KEY, JSON.stringify(calibration));
}

export async function saveInstrumentSettings(calibration: SensorCalibration, thresholds: SplitPoints): Promise<void> {
  validateCalibration(calibration);
  validateThresholds(thresholds);
  await AsyncStorage.multiSet([
    [CALIBRATION_KEY, JSON.stringify(calibration)],
    [THRESHOLD_KEY, JSON.stringify(thresholds)],
  ]);
}

export async function getThresholds(): Promise<SplitPoints> {
  const value = await AsyncStorage.getItem(THRESHOLD_KEY);
  if (!value) return splitPoints;
  const parsed = JSON.parse(value) as Partial<SplitPoints>;
  const thresholds: SplitPoints = {
    ph: parsed.ph ?? splitPoints.ph,
    temperature: parsed.temperature ?? splitPoints.temperature,
    salinityMin: parsed.salinityMin ?? splitPoints.salinityMin,
    salinity: parsed.salinity ?? splitPoints.salinity,
  };
  return validateThresholds(normalizeThresholds(thresholds));
}

export async function saveThresholds(thresholds: SplitPoints): Promise<void> {
  validateThresholds(thresholds);
  await AsyncStorage.setItem(THRESHOLD_KEY, JSON.stringify(thresholds));
}

function readStoredOffset(value: unknown, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  const parsed = typeof value === "string" ? Number(value.replace(",", ".")) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed)) {
    throw new Error(`Offset ${label} pada penyimpanan lokal tidak valid.`);
  }
  return parsed;
}

function normalizeOffset(value: number, limit: number, step: number, precision: number): number {
  const bounded = Math.min(limit, Math.max(-limit, value));
  return Number((Math.round(bounded / step) * step).toFixed(precision));
}

function normalizeThresholds(thresholds: SplitPoints): SplitPoints {
  const gridValue = (value: number, min: number, max: number, step: number, precision: number) => {
    const bounded = Math.min(max, Math.max(min, value));
    return Number((Math.round((bounded - min) / step) * step + min).toFixed(precision));
  };
  const salinityMin = gridValue(thresholds.salinityMin, 5, 25, 0.5, 1);
  return {
    ph: gridValue(thresholds.ph, 6.5, 8.5, 0.05, 2),
    temperature: gridValue(thresholds.temperature, 24, 34, 0.25, 2),
    salinityMin,
    salinity: Math.max(salinityMin, gridValue(thresholds.salinity, 15, 35, 0.5, 1)),
  };
}

function validateCalibration(calibration: SensorCalibration): SensorCalibration {
  if (![calibration.ph, calibration.temperature, calibration.salinity].every(Number.isFinite)
    || Math.abs(calibration.ph) > 1
    || Math.abs(calibration.temperature) > 5
    || Math.abs(calibration.salinity) > 5) {
    throw new Error("Offset kalibrasi harus berada pada rentang slider.");
  }
  return calibration;
}

function validateThresholds(thresholds: SplitPoints): SplitPoints {
  if (![thresholds.ph, thresholds.temperature, thresholds.salinityMin, thresholds.salinity].every(Number.isFinite)
    || thresholds.ph < 6.5 || thresholds.ph > 8.5
    || thresholds.temperature < 24 || thresholds.temperature > 34
    || thresholds.salinityMin < 5 || thresholds.salinityMin > 25
    || thresholds.salinity < 15 || thresholds.salinity < thresholds.salinityMin || thresholds.salinity > 35) {
    throw new Error("Konfigurasi ambang C4.5 tidak valid.");
  }
  return thresholds;
}
