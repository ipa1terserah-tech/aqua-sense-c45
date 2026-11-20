import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { evaluateWater, idealRanges, SensorValues, SplitPoints, splitPoints, toleranceRanges } from "../engine/c45";
import { CalibrationTestResult, SensorCalibration, StoredAlert, StoredReading, defaultSensorCalibration } from "../storage";
import { colors, fonts, radius } from "../theme";
import { ActionButton, Card, Pill, RangeSlider, SectionTitle } from "../components/FieldUI";
import { DeviceProps } from "./types";

const intensiveProfile: SplitPoints = { ph: 7.7, temperature: 29, salinityMin: 18, salinity: 26 };
const postRainProfile: SplitPoints = { ph: 7.3, temperature: 27.5, salinityMin: 12, salinity: 22 };
type CalibrationKey = keyof SensorCalibration;
type ThresholdKey = keyof SplitPoints;

export default function DeviceScreen({
  deviceId,
  endpoint,
  reading,
  calibration,
  onSave,
  onSaveSettings,
  alerts,
  onError,
  thresholds,
  onSaveCalibrationTest,
}: DeviceProps) {
  const [id, setId] = useState(deviceId);
  const [url, setUrl] = useState(endpoint);
  const [draftCalibration, setDraftCalibration] = useState(calibration);
  const [draftThresholds, setDraftThresholds] = useState(thresholds);
  const [profileName, setProfileName] = useState(() => findProfile(thresholds));
  const [saving, setSaving] = useState(false);
  const [settingsFeedback, setSettingsFeedback] = useState("");
  const [standardValues, setStandardValues] = useState<SensorValues>({ ph: 0, temperature: 0, salinity: 0 });
  const [standardInput, setStandardInput] = useState({ ph: "", temperature: "", salinity: "" });
  const [savingTest, setSavingTest] = useState(false);
  const rawValues: SensorValues = reading.rawValues ?? {
    ph: reading.ph,
    temperature: reading.temperature,
    salinity: reading.salinity,
  };
  const previewValues = useMemo(() => ({
    ph: rawValues.ph + draftCalibration.ph,
    temperature: rawValues.temperature + draftCalibration.temperature,
    salinity: rawValues.salinity + draftCalibration.salinity,
  }), [draftCalibration, rawValues.ph, rawValues.salinity, rawValues.temperature]);
  const comparison = useMemo(() => {
    const errors: SensorValues = {
      ph: Math.abs(previewValues.ph - standardValues.ph),
      temperature: Math.abs(previewValues.temperature - standardValues.temperature),
      salinity: Math.abs(previewValues.salinity - standardValues.salinity),
    };
    const errorPercentages: SensorValues = {
      ph: standardValues.ph > 0 ? errors.ph / standardValues.ph * 100 : 0,
      temperature: standardValues.temperature > 0 ? errors.temperature / standardValues.temperature * 100 : 0,
      salinity: standardValues.salinity > 0 ? errors.salinity / standardValues.salinity * 100 : 0,
    };
    const tolerances: SensorValues = { ph: 0.1, temperature: 0.5, salinity: 1 };
    const hasReferences = Object.values(standardValues).every((value) => Number.isFinite(value) && value > 0);
    const passed = hasReferences && (Object.keys(errors) as (keyof SensorValues)[]).every((key) => (
      errorPercentages[key] <= 2 || errors[key] <= tolerances[key]
    ));
    const status: CalibrationTestResult["status"] = passed ? "Valid / Akurat" : "Perlu Kalibrasi Ulang";
    return {
      errors,
      errorPercentages,
      ready: hasReferences,
      status,
    } satisfies Pick<CalibrationTestResult, "errors" | "errorPercentages" | "status"> & { ready: boolean };
  }, [previewValues, standardValues]);
  useEffect(() => {
    setId(deviceId);
    setUrl(endpoint);
  }, [deviceId, endpoint]);
  useEffect(() => {
    setDraftCalibration(calibration);
  }, [calibration]);
  useEffect(() => {
    setDraftThresholds(thresholds);
    setProfileName(findProfile(thresholds));
  }, [thresholds]);

  function updateOffset(key: CalibrationKey, value: number) {
    const limit = key === "ph" ? 1 : 5;
    const precision = key === "ph" ? 2 : 1;
    const next = Number(Math.min(limit, Math.max(-limit, value)).toFixed(precision));
    setDraftCalibration((current) => ({ ...current, [key]: next }));
    setSettingsFeedback("");
  }

  function updateThreshold(key: ThresholdKey, value: number) {
    setDraftThresholds((current) => {
      const bounds = key === "ph"
        ? { min: 6.5, max: 8.5 }
        : key === "temperature"
          ? { min: 24, max: 34 }
          : key === "salinityMin"
            ? { min: 5, max: 25 }
            : { min: 15, max: 35 };
      const bounded = Math.min(bounds.max, Math.max(bounds.min, value));
      if (key === "salinityMin") {
        return { ...current, salinityMin: Math.min(bounded, current.salinity) };
      }
      if (key === "salinity") {
        return { ...current, salinity: Math.max(bounded, current.salinityMin) };
      }
      if (key === "ph") return { ...current, ph: Math.min(14, bounded) };
      return { ...current, temperature: bounded };
    });
    setProfileName("Kustom");
    setSettingsFeedback("");
  }

  function applyProfile(profile: SplitPoints, label: string) {
    setDraftThresholds(profile);
    setProfileName(label);
    setSettingsFeedback("");
  }

  function zeroAllOffsets() {
    setDraftCalibration({ ...defaultSensorCalibration });
    setSettingsFeedback("");
  }

  async function saveSettings(nextCalibration = draftCalibration, nextThresholds = draftThresholds) {
    setSaving(true);
    try {
      await onSaveSettings(nextCalibration, nextThresholds);
      setDraftCalibration(nextCalibration);
      setDraftThresholds(nextThresholds);
      setProfileName(findProfile(nextThresholds));
      setSettingsFeedback("Offset dan ambang berhasil disimpan ke AsyncStorage.");
      onError("");
      Alert.alert("Kalibrasi diterapkan", "Offset sensor dan profil ambang berhasil disimpan ke AsyncStorage.");
    } catch (error) {
      setSettingsFeedback("");
      onError(`Kalibrasi tidak tersimpan: ${messageOf(error)}`);
    } finally {
      setSaving(false);
    }
  }

  function resetToFactory() {
    Alert.alert(
      "Reset ke Default",
      "Semua offset dan ambang akan dikembalikan ke profil Standar Jurnal & Tambak Maneron dan langsung diterapkan.",
      [
        { text: "Batal", style: "cancel" },
        { text: "Reset & Terapkan", style: "destructive", onPress: () => { void saveSettings(defaultSensorCalibration, splitPoints); } },
      ],
    );
  }

  async function persistDevice() {
    try {
      await onSave(id.trim(), url.trim());
      onError("");
      Alert.alert("Koneksi tersimpan", "Pengaturan perangkat disimpan di perangkat ini.");
    } catch (error) {
      onError(`Pengaturan perangkat tidak tersimpan: ${messageOf(error)}`);
    }
  }

  function updateStandardValue(key: keyof SensorValues, value: string) {
    setStandardInput((current) => ({ ...current, [key]: value }));
    const parsed = Number(value.replace(",", "."));
    setStandardValues((current) => ({ ...current, [key]: value.trim() && Number.isFinite(parsed) ? parsed : 0 }));
  }

  async function saveCalibrationTest() {
    if (savingTest) return;
    const reference = {
      ph: Number(standardInput.ph.replace(",", ".")),
      temperature: Number(standardInput.temperature.replace(",", ".")),
      salinity: Number(standardInput.salinity.replace(",", ".")),
    };
    if (Object.values(reference).some((value) => !Number.isFinite(value) || value <= 0)) {
      onError("Masukkan nilai referensi standar yang valid dan lebih besar dari 0 untuk pH, suhu, dan salinitas.");
      return;
    }
    const testResult: CalibrationTestResult = { ...comparison, reference };
    const timestamp = new Date().toISOString();
    const values: SensorValues = { ...previewValues };
    const statusSummary = `Uji pembanding: ${testResult.status}. Error pH ${testResult.errors.ph.toFixed(2)} (${testResult.errorPercentages.ph.toFixed(2)}%), suhu ${testResult.errors.temperature.toFixed(2)} (${testResult.errorPercentages.temperature.toFixed(2)}%), salinitas ${testResult.errors.salinity.toFixed(2)} (${testResult.errorPercentages.salinity.toFixed(2)}%).`;
    const record: StoredReading = {
      ...values,
      id: `${reading.id}-CAL-${Date.now()}`,
      pond: reading.pond,
      timestamp,
      receivedAt: timestamp,
      isComplete: true,
      source: "UJI_KALIBRASI",
      rawValues,
      classification: evaluateWater(values, thresholds).classification,
      recommendation: statusSummary,
      calibrationTest: testResult,
    };
    setSavingTest(true);
    try {
      await onSaveCalibrationTest(record);
      onError("");
      Alert.alert("Uji kalibrasi dicatat", "Hasil pembanding alat standar tersimpan di riwayat lokal.");
    } catch (error) {
      onError(`Uji kalibrasi tidak tersimpan: ${messageOf(error)}`);
    } finally {
      setSavingTest(false);
    }
  }

  return <>
    <SectionTitle title="Perangkat ESP32" />
    <Card>
      <View style={styles.deviceHead}><View><Text style={styles.itemLabel}>ID PERANGKAT</Text><Text style={styles.deviceName}>{deviceId || "ESP32-AQP-A1"}</Text></View><Pill tone="neutral">REST / BRIDGE</Pill></View>
      <Text style={styles.inputLabel}>ID Perangkat</Text>
      <TextInput value={id} onChangeText={setId} autoCapitalize="characters" style={styles.input} placeholder="ESP32-AQP-A1" placeholderTextColor={colors.textSecondary} />
      <Text style={styles.inputLabel}>Endpoint REST ESP32 / Gateway</Text>
      <TextInput value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" style={styles.input} placeholder="http://alamat-perangkat/api/sensors" placeholderTextColor={colors.textSecondary} />
      <Text style={styles.helper}>Payload JSON: {`{"temperature":29.4,"ph":7.9,"salinity":21}`}. Aktifkan mode simulasi untuk demo offline.</Text>
      <ActionButton label="Simpan koneksi" onPress={persistDevice} />
    </Card>

    <SectionTitle title="Kalibrasi Offset Sensor" trailing="KOREKSI LAPANGAN" />
    <Card>
      <Text style={styles.helperTop}>Raw berasal dari sensor/API. Slider mengubah pratinjau offset; simpan menerapkan koreksi sebelum klasifikasi C4.5.</Text>
      <View style={styles.calibrationSection}>
        <RangeSlider label="Offset pH Air" value={draftCalibration.ph} min={-1} max={1} step={0.05} precision={2} unit="pH" showPositiveSigns showRangeUnits onChange={(value) => updateOffset("ph", value)} />
        <View style={styles.comparisonRow}>
          <ComparisonValue label="Raw (mentah)" value={rawValues.ph} unit="pH" precision={2} />
          <Text style={styles.comparisonArrow}>→</Text>
          <ComparisonValue label="Terkalibrasi (draft)" value={previewValues.ph} unit="pH" precision={2} />
        </View>
      </View>
      <View style={styles.calibrationSection}>
        <RangeSlider label="Offset Suhu DS18B20" value={draftCalibration.temperature} min={-5} max={5} step={0.1} precision={1} unit="°C" showPositiveSigns showRangeUnits onChange={(value) => updateOffset("temperature", value)} />
        <View style={styles.comparisonRow}>
          <ComparisonValue label="Raw (mentah)" value={rawValues.temperature} unit="°C" precision={1} />
          <Text style={styles.comparisonArrow}>→</Text>
          <ComparisonValue label="Terkalibrasi (draft)" value={previewValues.temperature} unit="°C" precision={1} />
        </View>
      </View>
      <View style={styles.calibrationSection}>
        <RangeSlider label="Offset Salinitas" value={draftCalibration.salinity} min={-5} max={5} step={0.1} precision={1} unit="ppt" showPositiveSigns showRangeUnits onChange={(value) => updateOffset("salinity", value)} />
        <View style={styles.comparisonRow}>
          <ComparisonValue label="Raw (mentah)" value={rawValues.salinity} unit="ppt" precision={1} />
          <Text style={styles.comparisonArrow}>→</Text>
          <ComparisonValue label="Terkalibrasi (draft)" value={previewValues.salinity} unit="ppt" precision={1} />
        </View>
      </View>
      <ActionButton label="Nolkan Semua Offset" onPress={zeroAllOffsets} secondary />
      <Text style={styles.helper}>Offset menggeser pembacaan, bukan mengganti kalibrasi multipoint probe. Pastikan firmware tidak menerapkan koreksi yang sama dua kali.</Text>
      <View style={styles.referenceTest}>
        <Text style={styles.referenceTitle}>Uji Pembanding Alat Standar</Text>
        <Text style={styles.helper}>Masukkan hasil pH meter, termometer, dan refraktometer standar. Toleransi pembanding lapangan: pH 0,1; suhu 0,5 °C; salinitas 1 ppt.</Text>
        {([
          { key: "ph", label: "pH meter standar", unit: "pH", precision: 2 },
          { key: "temperature", label: "Termometer standar", unit: "°C", precision: 1 },
          { key: "salinity", label: "Refraktometer standar", unit: "ppt", precision: 1 },
        ] as const).map(({ key, label, unit, precision }) => <View key={key} style={styles.referenceRow}>
          <View style={styles.referenceInputWrap}>
            <Text style={styles.inputLabel}>{label}</Text>
            <TextInput value={standardInput[key]} onChangeText={(value) => updateStandardValue(key, value)} keyboardType="decimal-pad" style={styles.input} placeholder={`Nilai ${unit}`} placeholderTextColor={colors.textSecondary} />
          </View>
          <View style={styles.referenceResult}>
            <Text style={styles.comparisonLabel}>Selisih / Error</Text>
            <Text style={styles.comparisonNumber}>{standardValues[key] > 0 ? `${comparison.errors[key].toFixed(precision)} ${unit} · ${comparison.errorPercentages[key].toFixed(2)}%` : "—"}</Text>
          </View>
        </View>)}
        <Pill tone={comparison.status === "Valid / Akurat" ? "good" : "warning"}>{comparison.ready ? comparison.status : "Masukkan nilai standar"}</Pill>
        <View style={styles.referenceButton}><ActionButton label={savingTest ? "Mencatat..." : "Catat ke Log Uji Kalibrasi"} onPress={() => { void saveCalibrationTest(); }} secondary /></View>
      </View>
    </Card>

    <SectionTitle title="Ambang Pohon C4.5" trailing={profileName.toUpperCase()} />
    <Card>
      <Text style={styles.profileLabel}>PROFIL BUDIDAYA</Text>
      <View style={styles.profileList}>
        <PresetButton label="Standar Jurnal & Tambak Maneron" selected={profileName === "Standar Jurnal & Tambak Maneron"} onPress={() => applyProfile(splitPoints, "Standar Jurnal & Tambak Maneron")} />
        <PresetButton label="Profil Intensif / Padat Tebar" selected={profileName === "Profil Intensif / Padat Tebar"} onPress={() => applyProfile(intensiveProfile, "Profil Intensif / Padat Tebar")} />
        <PresetButton label="Profil Pasca-Hujan / Adaptasi" selected={profileName === "Profil Pasca-Hujan / Adaptasi"} onPress={() => applyProfile(postRainProfile, "Profil Pasca-Hujan / Adaptasi")} />
      </View>
      <RangeSlider label="ROOT · Split Point pH Ideal" value={draftThresholds.ph} min={6.5} max={8.5} step={0.05} precision={2} unit="pH" showRangeUnits onChange={(value) => updateThreshold("ph", value)} />
      <RangeSlider label="INTERNAL · Split Point Suhu" value={draftThresholds.temperature} min={24} max={34} step={0.25} precision={2} unit="°C" showRangeUnits onChange={(value) => updateThreshold("temperature", value)} />
      <RangeSlider label="LOWER GUARD · Batas Bawah Salinitas" value={draftThresholds.salinityMin} min={5} max={25} step={0.5} precision={1} unit="ppt" showRangeUnits onChange={(value) => updateThreshold("salinityMin", value)} />
      <RangeSlider label="LEAF · Batas Atas / Split Salinitas" value={draftThresholds.salinity} min={15} max={35} step={0.5} precision={1} unit="ppt" showRangeUnits onChange={(value) => updateThreshold("salinity", value)} />
      <Text style={styles.helper}>Bawaan memakai split slider terdekat: pH 7,50; suhu 28,75 °C; salinitas 25,5 ppt. Nilai jurnal 7,495; 28,755 °C; 25,635 ppt ditampilkan pada metodologi. Optimal WWF: pH {idealRanges.ph.min}–{idealRanges.ph.max}, suhu {idealRanges.temperature.min}–{idealRanges.temperature.max} °C, salinitas {idealRanges.salinity.min}–{idealRanges.salinity.max} ppt. Toleransi: pH {toleranceRanges.ph.min}–{toleranceRanges.ph.max}, suhu {toleranceRanges.temperature.min}–{toleranceRanges.temperature.max} °C, salinitas {toleranceRanges.salinity.min}–{toleranceRanges.salinity.max} ppt.</Text>
      <ActionButton label={saving ? "Menyimpan..." : "Simpan & Terapkan Kalibrasi"} onPress={() => { void saveSettings(); }} />
      {settingsFeedback ? <Text accessibilityRole="status" style={styles.settingsFeedback}>{settingsFeedback}</Text> : null}
      <View style={styles.resetButton}>
        <ActionButton label="Reset ke Default" onPress={resetToFactory} secondary />
      </View>
    </Card>

    <SectionTitle title="Riwayat alert" trailing={`${alerts.length} TOTAL`} />
    <Card style={styles.alertCard}>
      <ScrollView nestedScrollEnabled style={{ maxHeight: 280 }}>
        {alerts.length ? alerts.slice(0, 30).map((alert) => <AlertRow key={alert.id} alert={alert} />) : <Text style={styles.empty}>Belum ada alert. Alert dibuat saat status klasifikasi berubah menjadi TIDAK BAGUS.</Text>}
      </ScrollView>
    </Card>
  </>;
}

function ComparisonValue({ label, value, unit, precision }: { label: string; value: number; unit: string; precision: number }) {
  return <View style={styles.comparisonValue}>
    <Text style={styles.comparisonLabel}>{label}</Text>
    <Text style={styles.comparisonNumber}>{value.toFixed(precision)} {unit}</Text>
  </View>;
}

function PresetButton({ label, onPress, selected = false }: { label: string; onPress: () => void; selected?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.presetButton, selected && styles.presetButtonSelected, pressed && styles.pressed]}>
    <Text style={[styles.presetText, selected && styles.presetTextSelected]}>{label}</Text>
  </Pressable>;
}

function AlertRow({ alert }: { alert: StoredAlert }) {
  return <View style={styles.alertRow}><View style={[styles.alertMark, { backgroundColor: alert.severity === "danger" ? colors.critical : colors.warning }]} /><View style={styles.alertCopy}><Text style={styles.alertMessage}>{alert.message}</Text><Text style={styles.alertTime}>{new Date(alert.timestamp).toLocaleString("id-ID")}</Text></View><Pill tone={alert.severity === "danger" ? "danger" : "warning"}>{alert.severity === "danger" ? "BAHAYA" : "WASPADA"}</Pill></View>;
}

function findProfile(value: SplitPoints): string {
  if (matchesProfile(value, splitPoints)) return "Standar Jurnal & Tambak Maneron";
  if (matchesProfile(value, intensiveProfile)) return "Profil Intensif / Padat Tebar";
  if (matchesProfile(value, postRainProfile)) return "Profil Pasca-Hujan / Adaptasi";
  return "Kustom";
}

function matchesProfile(value: SplitPoints, profile: SplitPoints): boolean {
  return value.ph === profile.ph
    && value.temperature === profile.temperature
    && value.salinityMin === profile.salinityMin
    && value.salinity === profile.salinity;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const styles = StyleSheet.create({
  deviceHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 15 },
  itemLabel: { color: colors.textSecondary, fontFamily: fonts.bold, fontSize: 9 },
  deviceName: { color: colors.textPrimary, fontFamily: fonts.mono, fontSize: 13, marginTop: 4 },
  inputLabel: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: 10, marginTop: 10, marginBottom: 5 },
  input: { minHeight: 42, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 11, color: colors.textPrimary, fontFamily: fonts.mono, fontSize: 11, marginBottom: 7 },
  helper: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 10, lineHeight: 15, marginTop: 10, marginBottom: 12 },
  helperTop: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 10, lineHeight: 15, marginBottom: 7 },
  calibrationSection: { paddingBottom: 9, marginBottom: 4, borderBottomWidth: 1, borderColor: colors.border },
  referenceTest: { marginTop: 14, padding: 11, backgroundColor: colors.bgPrimary, borderRadius: radius.sm },
  referenceTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: 12 },
  referenceRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  referenceInputWrap: { flex: 1 },
  referenceResult: { flex: 1, paddingTop: 10 },
  referenceButton: { marginTop: 8 },
  comparisonRow: { flexDirection: "row", alignItems: "center", marginTop: 9, gap: 9 },
  comparisonValue: { flex: 1, backgroundColor: colors.bgPrimary, borderRadius: radius.sm, paddingHorizontal: 9, paddingVertical: 7 },
  comparisonLabel: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 8 },
  comparisonNumber: { color: colors.textPrimary, fontFamily: fonts.mono, fontSize: 10, marginTop: 3 },
  comparisonArrow: { color: colors.brandSecondary, fontFamily: fonts.bold, fontSize: 15 },
  presetButton: { minHeight: 38, flexGrow: 1, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surface, paddingHorizontal: 9, paddingVertical: 7 },
  presetButtonSelected: { backgroundColor: colors.brandTint, borderColor: colors.brandPrimary },
  presetText: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: 9, textAlign: "center" },
  presetTextSelected: { color: colors.brandPrimary, fontFamily: fonts.bold },
  pressed: { opacity: 0.75 },
  profileLabel: { color: colors.textSecondary, fontFamily: fonts.bold, fontSize: 8, letterSpacing: 0.8, marginBottom: 7 },
  profileList: { gap: 7, marginBottom: 10 },
  resetButton: { marginTop: 8 },
  settingsFeedback: { color: colors.brandPrimary, backgroundColor: colors.brandTint, borderRadius: radius.sm, fontFamily: fonts.medium, fontSize: 10, lineHeight: 15, padding: 9, marginTop: 8, textAlign: "center" },
  alertCard: { padding: 0, overflow: "hidden" },
  alertRow: { flexDirection: "row", alignItems: "center", gap: 9, padding: 12, borderBottomWidth: 1, borderColor: colors.border },
  alertMark: { width: 8, height: 8, borderRadius: 4 },
  alertCopy: { flex: 1 },
  alertMessage: { color: colors.textPrimary, fontFamily: fonts.medium, fontSize: 10, lineHeight: 15 },
  alertTime: { color: colors.textSecondary, fontFamily: fonts.mono, fontSize: 8, marginTop: 3 },
  empty: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 11, padding: 15, lineHeight: 16 },
});
