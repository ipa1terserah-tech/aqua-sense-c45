import { Decision, SensorValues, SplitPoints } from "../engine/c45";
import { SensorReading } from "../services/iot";
import { SensorCalibration, StoredAlert, StoredReading } from "../storage";

export type PantauProps = {
  reading: SensorReading;
  decision: Decision;
  thresholds: SplitPoints;
  simulated: boolean;
  online: boolean;
  onToggleSimulation: () => void;
  onTestCycle: () => void;
  lastUpdated: string;
};

export type AnalysisProps = {
  values: SensorValues;
  thresholds: SplitPoints;
  onSaveScenario: (values: SensorValues, classification: StoredReading["classification"], recommendation: string) => Promise<void>;
  onError: (message: string) => void;
};
export type HistoryProps = { readings: StoredReading[]; onExport: () => void };
export type DeviceProps = {
  deviceId: string;
  endpoint: string;
  reading: SensorReading;
  calibration: SensorCalibration;
  onSave: (deviceId: string, endpoint: string) => Promise<void>;
  onSaveSettings: (calibration: SensorCalibration, thresholds: SplitPoints) => Promise<void>;
  alerts: StoredAlert[];
  onError: (message: string) => void;
  thresholds: SplitPoints;
  onSaveCalibrationTest: (result: StoredReading) => Promise<void>;
};
