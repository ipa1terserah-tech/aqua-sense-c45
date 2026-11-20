import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, Pressable, SafeAreaView, StyleSheet, Text, View, type ScrollViewInstance } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono";
import { PlusJakartaSans_400Regular, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold } from "@expo-google-fonts/plus-jakarta-sans";
import { evaluateWater, SensorValues, SplitPoints, splitPoints } from "./src/engine/c45";
import { simulatedReading, SensorReading } from "./src/services/iot";
import { addAlert, addReading, getAlerts, getCalibration, getDeviceConfig, getReadings, getThresholds, saveInstrumentSettings, SensorCalibration, StoredAlert, StoredReading, saveDeviceConfig } from "./src/storage";
import { exportReadingsCsv } from "./src/storage/export";
import { pollTelemetry, recordTelemetry } from "./src/services/iotBackend";
import { colors, fonts } from "./src/theme";
import PantauScreen from "./src/screens/PantauScreen";
import AnalysisScreen from "./src/screens/AnalysisScreen";
import HistoryScreen from "./src/screens/HistoryScreen";
import DeviceScreen from "./src/screens/DeviceScreen";
import CollapsibleHeader from "./src/components/CollapsibleHeader";

type Tab = "Pantau" | "Analisis C4.5" | "Riwayat Log" | "Perangkat";
const tabs: { label: Tab; icon: string }[] = [
  { label: "Pantau", icon: "◉" },
  { label: "Analisis C4.5", icon: "⑂" },
  { label: "Riwayat Log", icon: "▤" },
  { label: "Perangkat", icon: "⚙" },
];

export default function App() {
  const [loaded] = useFonts({
    [fonts.body]: PlusJakartaSans_400Regular,
    [fonts.medium]: PlusJakartaSans_600SemiBold,
    [fonts.bold]: PlusJakartaSans_700Bold,
    [fonts.mono]: JetBrainsMono_500Medium,
  });
  const [tab, setTab] = useState<Tab>("Pantau");
  const [pond, setPond] = useState("Kolam A1");
  const [simulated, setSimulated] = useState(true);
  const [reading, setReading] = useState<SensorReading>(() => simulatedReading(undefined, "Kolam A1"));
  const [logs, setLogs] = useState<StoredReading[]>([]);
  const [alerts, setAlerts] = useState<StoredAlert[]>([]);
  const [deviceId, setDeviceId] = useState("ESP32-AQP-A1");
  const [endpoint, setEndpoint] = useState("");
  const [sensorOnline, setSensorOnline] = useState(false);
  const [thresholds, setThresholds] = useState<SplitPoints>(splitPoints);
  const [calibration, setCalibration] = useState<SensorCalibration>({ ph: 0, temperature: 0, salinity: 0 });
  const [lastUpdated, setLastUpdated] = useState(new Date().toISOString());
  const [errorMessage, setErrorMessage] = useState("");
  const [ready, setReady] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;
  const priorClass = useRef<string | null>(null);
  const readingRef = useRef(reading);
  const scrollRef = useRef<ScrollViewInstance | null>(null);
  const manualCycleRef = useRef<(() => void) | null>(null);

  const decision = useMemo(() => evaluateWater(reading, thresholds), [reading, thresholds]);

  useEffect(() => {
    let active = true;
    Promise.all([getReadings(), getAlerts(), getDeviceConfig(), getThresholds(), getCalibration()]).then(([storedLogs, storedAlerts, config, storedThresholds, storedCalibration]) => {
      if (!active) return;
      setLogs(storedLogs);
      setAlerts(storedAlerts);
      setDeviceId(config.deviceId);
      setEndpoint(config.endpoint);
      setThresholds(storedThresholds);
      setCalibration(storedCalibration);
      if (storedLogs.length) {
        const latest = storedLogs[0];
        const restored = { ...latest, source: latest.source };
        readingRef.current = restored;
        setReading(restored);
        setLastUpdated(latest.timestamp);
        priorClass.current = latest.classification;
      }
      setReady(true);
    }).catch((error: unknown) => {
      if (active) {
        setErrorMessage(`Gagal memuat penyimpanan lokal: ${messageOf(error)}`);
        setReady(true);
      }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    let busy = false;
    const update = async (source: SensorReading["source"] = "ESP32_LIVE") => {
      if (busy) return;
      busy = true;
      try {
        let saved: StoredReading;
        if (simulated) {
          const previousRaw = readingRef.current.rawValues ?? readingRef.current;
          const next = simulatedReading(previousRaw, pond);
          saved = await recordTelemetry(next, thresholds, calibration, {
            source: source === "SIKLUS_10_MENIT" ? source : next.source,
          });
          if (active) setSensorOnline(false);
        } else {
          const result = await pollTelemetry({ endpoint, deviceId }, pond, thresholds, calibration, undefined, source);
          saved = result.reading;
          if (active) {
            setSensorOnline(!result.fromCache);
            setErrorMessage(result.fromCache
              ? `Backend tidak terjangkau (${result.error}). Menampilkan data cache lokal dari ${new Date(result.reading.timestamp).toLocaleString("id-ID")}.`
              : "");
          }
        }
        if (!active) return;
        const nextDecision = evaluateWater(saved, thresholds);
        readingRef.current = saved;
        setReading(saved);
        setLastUpdated(saved.timestamp);
        setLogs((current) => saved.source === "CACHE LOKAL"
          ? current
          : [saved, ...current.filter((item) => item.id !== saved.id || item.timestamp !== saved.timestamp)].slice(0, 1500));
        if (simulated) setErrorMessage("");
        if (!active) return;
        if (nextDecision.classification === "TIDAK BAGUS" && priorClass.current !== "TIDAK BAGUS") {
          const alert: StoredAlert = {
            id: `${Date.now()}-${saved.id}`,
            timestamp: saved.timestamp,
            message: `Kondisi ${pond} TIDAK BAGUS. ${nextDecision.recommendation}`,
            severity: "danger",
          };
          await addAlert(alert);
          if (active) setAlerts((current) => [alert, ...current].slice(0, 250));
        }
        priorClass.current = nextDecision.classification;
      } catch (error) {
        if (active) {
          if (!simulated) setSensorOnline(false);
          setErrorMessage(simulated
            ? `Gagal menyimpan pembacaan lokal: ${messageOf(error)}`
            : `Siklus deteksi gagal: ${messageOf(error)}`);
        }
      } finally {
        busy = false;
      }
    };
    manualCycleRef.current = () => { void update(simulated ? "SIMULASI" : "ESP32_LIVE"); };
    void update(simulated ? "SIMULASI" : "ESP32_LIVE");
    const timer = setInterval(() => { void update("SIKLUS_10_MENIT"); }, 600000);
    return () => {
      active = false;
      manualCycleRef.current = null;
      clearInterval(timer);
    };
  }, [calibration, deviceId, endpoint, pond, ready, simulated, thresholds]);

  async function saveDevice(nextId: string, nextEndpoint: string) {
    if (!nextId) throw new Error("ID perangkat wajib diisi.");
    await saveDeviceConfig({ deviceId: nextId, endpoint: nextEndpoint });
    setDeviceId(nextId);
    setEndpoint(nextEndpoint);
    setSensorOnline(false);
  }

  async function saveInstrumentCalibration(nextCalibration: SensorCalibration, nextThresholds: SplitPoints) {
    await saveInstrumentSettings(nextCalibration, nextThresholds);
    setCalibration(nextCalibration);
    setThresholds(nextThresholds);
  }

  async function saveScenario(values: SensorValues, classification: StoredReading["classification"], recommendation: string) {
    const timestamp = new Date().toISOString();
    const scenario: StoredReading = {
      ...values,
      id: `SIM-UJI-${Date.now()}`,
      pond,
      timestamp,
      receivedAt: timestamp,
      isComplete: [values.ph, values.temperature, values.salinity].every(Number.isFinite),
      source: "SIMULASI_UJI",
      rawValues: values,
      classification,
      recommendation,
    };
    await addReading(scenario);
    setLogs((current) => [scenario, ...current].slice(0, 1500));
  }

  async function saveCalibrationTest(result: StoredReading) {
    await addReading(result);
    setLogs((current) => [result, ...current].slice(0, 1500));
  }

  function toggleSimulation() {
    setSensorOnline(false);
    setSimulated((value) => !value);
  }

  function runCycleNow() {
    manualCycleRef.current?.();
  }

  async function handleExport() {
    try {
      await exportReadingsCsv(logs);
    } catch (error) {
      Alert.alert("Ekspor gagal", messageOf(error));
    }
  }

  function renderScreen() {
    switch (tab) {
      case "Pantau":
        return <PantauScreen reading={reading} decision={decision} thresholds={thresholds} simulated={simulated} online={sensorOnline} onToggleSimulation={toggleSimulation} onTestCycle={runCycleNow} lastUpdated={lastUpdated} />;
      case "Analisis C4.5":
        return <AnalysisScreen values={reading} thresholds={thresholds} onSaveScenario={saveScenario} onError={setErrorMessage} />;
      case "Riwayat Log":
        return <HistoryScreen readings={logs} onExport={() => { void handleExport(); }} />;
      case "Perangkat":
        return <DeviceScreen deviceId={deviceId} endpoint={endpoint} reading={reading} calibration={calibration} onSave={saveDevice} onSaveSettings={saveInstrumentCalibration} alerts={alerts} onError={setErrorMessage} thresholds={thresholds} onSaveCalibrationTest={saveCalibrationTest} />;
    }
  }

  if (!loaded) return <SafeAreaView style={styles.loading}><Text style={styles.brand}>Aquapenaeus C4.5</Text><Text style={styles.loadingText}>SPK KUALITAS AIR • C4.5</Text></SafeAreaView>;

  return <SafeAreaView style={styles.safe}>
    <StatusBar style="dark" />
    <CollapsibleHeader scrollY={scrollY} pond={pond} onTogglePond={() => setPond((current) => current.endsWith("A1") ? "Kolam A2" : "Kolam A1")} />
    <Animated.ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.content} onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })} scrollEventThrottle={16} bounces={false} showsVerticalScrollIndicator={false}>
      <View style={styles.pageTitleRow}><View><Text style={styles.pageTitle}>{tab}</Text><Text style={styles.pageSubtitle}>{tab === "Pantau" ? "Kualitas air tambak · siklus 10 menit" : "SPK KUALITAS AIR • C4.5"}</Text></View><Text style={styles.clock}>{new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</Text></View>
      {errorMessage ? <Pressable onPress={() => setErrorMessage("")} style={[styles.errorBanner, errorMessage.startsWith("Backend tidak terjangkau") && styles.warningBanner]}><Text style={styles.errorText}>{errorMessage}  ×</Text></Pressable> : null}
      {renderScreen()}
      <View style={styles.bottomSpace} />
    </Animated.ScrollView>
    <View style={styles.tabBar}>{tabs.map((item) => {
      const active = tab === item.label;
      return <Pressable key={item.label} onPress={() => { setTab(item.label); scrollY.setValue(0); scrollRef.current?.scrollTo({ y: 0, animated: false }); }} style={styles.tabItem}>
        <Text style={[styles.tabIcon, active && styles.activeTabText]}>{item.icon}</Text><Text numberOfLines={1} style={[styles.tabLabel, active && styles.activeTabText]}>{item.label}</Text>
        {active ? <View style={styles.activeMark} /> : null}
      </Pressable>;
    })}</View>
  </SafeAreaView>;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgPrimary },
  loading: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bgPrimary },
  brand: { color: colors.brandPrimary, fontFamily: fonts.bold, fontSize: 12, letterSpacing: 0.8 },
  loadingText: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 12, marginTop: 8 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 16 },
  pageTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 13 },
  pageTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: 20 },
  pageSubtitle: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 10, marginTop: 2 },
  clock: { color: colors.textSecondary, fontFamily: fonts.mono, fontSize: 10, fontVariant: ["tabular-nums"] },
  errorBanner: { backgroundColor: colors.criticalTint, borderColor: colors.critical, borderWidth: 1, borderRadius: 9, padding: 10, marginBottom: 12 },
  warningBanner: { backgroundColor: colors.warningTint, borderColor: colors.warning },
  errorText: { color: colors.textPrimary, fontFamily: fonts.medium, fontSize: 10, lineHeight: 15 },
  bottomSpace: { height: 14 },
  tabBar: { backgroundColor: colors.surface, borderTopWidth: 1, borderColor: colors.border, minHeight: 59, flexDirection: "row", paddingHorizontal: 4, paddingTop: 5, paddingBottom: 3 },
  tabItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2 },
  tabIcon: { color: colors.textSecondary, fontSize: 16, height: 19 },
  tabLabel: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: 8 },
  activeTabText: { color: colors.brandPrimary },
  activeMark: { position: "absolute", top: -5, width: 28, height: 2, borderRadius: 2, backgroundColor: colors.brandPrimary },
});
