import React, { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { entropy, evaluateWater, gainRatio, giniImpurity, idealRanges, informationGain, journalEvidence, journalSplitPoints, referenceTrainingSet, SensorValues, SplitPoints, toleranceRanges } from "../engine/c45";
import { ActionButton, Card, DecisionTreeVisualizer, Pill, RangeSlider, SectionTitle } from "../components/FieldUI";
import { colors, fonts } from "../theme";
import { AnalysisProps } from "./types";

export default function AnalysisScreen({ values, thresholds, onSaveScenario, onError }: AnalysisProps) {
  const [whatIf, setWhatIf] = useState(values);
  const [savingScenario, setSavingScenario] = useState(false);
  const decision = useMemo(() => evaluateWater(whatIf, thresholds), [whatIf, thresholds]);
  const baseEntropy = entropy(referenceTrainingSet.map((row) => row.label));
  const journalMetrics: { name: string; key: string; split: number; gini: number; rootGain: number; childGain?: number }[] = [
    { name: "pH · Root", key: "ph", split: journalSplitPoints.ph, gini: journalEvidence.gini.ph, rootGain: journalEvidence.rootGain.ph, childGain: journalEvidence.phChildGain },
    { name: "Suhu", key: "temperature", split: journalSplitPoints.temperature, gini: journalEvidence.gini.temperature, rootGain: journalEvidence.rootGain.temperature },
    { name: "Salinitas", key: "salinity", split: journalSplitPoints.salinity, gini: journalEvidence.gini.salinity, rootGain: journalEvidence.rootGain.salinity },
  ];
  const metrics = [
    { name: "pH", key: "ph" as const, split: thresholds.ph },
    { name: "Suhu Air", key: "temperature" as const, split: thresholds.temperature },
    { name: "Salinitas", key: "salinity" as const, split: thresholds.salinity },
  ];
  function update(key: keyof SensorValues, value: number) {
    setWhatIf((previous) => ({ ...previous, [key]: value }));
  }
  async function saveScenario() {
    setSavingScenario(true);
    try {
      await onSaveScenario(whatIf, decision.classification, decision.recommendation);
      onError("");
      Alert.alert("Skenario tersimpan", "Hasil simulasi What-If ditambahkan ke riwayat uji.");
    } catch (error) {
      onError(`Skenario tidak tersimpan: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSavingScenario(false);
    }
  }
  return <>
    <Card style={styles.intro}>
      <Pill tone="neutral">C4.5 · ID3 + GAIN RATIO</Pill>
      <Text style={styles.introTitle}>Pohon keputusan tambak</Text>
      <Text style={styles.body}>Nilai kontinu dipisah pada kandidat threshold; titik terbaik dipilih dari nilai Gini terkecil, GINI(t) = 1 − Σ p(j|t)². Split dan gain jurnal berasal dari 76 data latih, bukan hasil pelatihan ulang aplikasi ini.</Text>
      <Text style={styles.body}>Jurnal memakai enam atribut, termasuk DO (Gain 0,245 dan 0,254 pada perhitungan cabang yang disajikan) dan pH (0,234 pada Node 1; 0,438 pada Node 1.1). Dari tiga atribut sensor yang tersedia di tambak ini, pH menjadi Root Node acuan, diikuti suhu dan salinitas; adaptasi ini bukan replikasi enam atribut.</Text>
    </Card>
    <SectionTitle title="Split empiris Iqbal et al. (2020)" trailing="76 DATA LATIH" />
    <Card style={styles.journalCard}>
      <View style={styles.journalHead}><Text style={[styles.journalLabel, styles.journalAttribute]}>ATRIBUT / POSISI</Text><Text style={styles.journalLabel}>GINI</Text><Text style={styles.journalLabel}>GAIN NODE 1</Text></View>
      {journalMetrics.map((metric, index) => <View style={[styles.journalRow, index === journalMetrics.length - 1 && styles.noBorder]} key={metric.key}>
        <View style={styles.journalAttribute}>
          <Text style={styles.attrName}>{metric.name}</Text>
          <Text style={styles.attrSplit}>{`< ${metric.split.toFixed(3)} / ≥ ${metric.split.toFixed(3)}`}{metric.key === "temperature" ? " °C" : metric.key === "salinity" ? " ppt" : ""}</Text>
        </View>
        <Text style={styles.number}>{metric.gini.toFixed(3)}</Text>
        <View style={styles.journalGain}><Text style={styles.number}>{metric.rootGain.toFixed(3)}</Text>{metric.childGain ? <Text style={styles.journalChildGain}>Node 1.1: {metric.childGain.toFixed(3)}</Text> : null}</View>
      </View>)}
      <Text style={styles.body}>Nilai split kandidat di UI dibulatkan sesuai resolusi slider. Gini dan gain di atas adalah angka empiris terlapor, sedangkan metrik dataset demo di bawah dihitung terpisah.</Text>
      <Text style={styles.body}>{`WWF-Indonesia (Badrudin, 2014, dikutip dalam Iqbal et al., 2020): optimal pH ${idealRanges.ph.min}–${idealRanges.ph.max}, suhu ${idealRanges.temperature.min}–${idealRanges.temperature.max} °C, salinitas ${idealRanges.salinity.min}–${idealRanges.salinity.max} ppt; toleransi pH ${toleranceRanges.ph.min}–${toleranceRanges.ph.max}, suhu ${toleranceRanges.temperature.min}–${toleranceRanges.temperature.max} °C, salinitas ${toleranceRanges.salinity.min}–${toleranceRanges.salinity.max} ppt.`}</Text>
      <Text style={styles.body}>Evaluasi referensi pada 17 data uji: TP 8, TN 5, FP 3, FN 1; akurasi 76,47%, presisi 72,72%, recall 88,88% (Fair Classification).</Text>
    </Card>
    <SectionTitle title="Jalur keputusan aktif" />
    <DecisionTreeVisualizer decision={decision} />
    <SectionTitle title="Entropy & Information Gain" trailing="DEMO · 10 BARIS" />
    <Card style={styles.table}>
      <View style={styles.tableHeader}><Text style={[styles.tableLabel, styles.attrColumn]}>ATRIBUT / SPLIT</Text><Text style={styles.tableLabel}>GAIN</Text><Text style={styles.tableLabel}>RATIO</Text><Text style={styles.tableLabel}>GINI</Text></View>
      {metrics.map((metric, index) => {
        const gain = informationGain(referenceTrainingSet, metric.key, metric.split);
        const ratio = gainRatio(referenceTrainingSet, metric.key, metric.split);
        const lower = referenceTrainingSet.filter((row) => row[metric.key] < metric.split).map((row) => row.label);
        const upper = referenceTrainingSet.filter((row) => row[metric.key] >= metric.split).map((row) => row.label);
        const gini = (lower.length / referenceTrainingSet.length) * giniImpurity(lower) + (upper.length / referenceTrainingSet.length) * giniImpurity(upper);
        return <View style={[styles.tableRow, index === metrics.length - 1 && styles.noBorder]} key={metric.key}>
          <View style={styles.attrColumn}><Text style={styles.attrName}>{metric.name}</Text><Text style={styles.attrSplit}>{`< ${metric.split}`}</Text></View>
          <Text style={styles.number}>{gain.toFixed(3)}</Text><Text style={styles.number}>{ratio.toFixed(3)}</Text><Text style={styles.number}>{gini.toFixed(3)}</Text>
        </View>;
      })}
      <Text style={styles.entropyFoot}>Entropy dataset: {baseEntropy.toFixed(3)} bit · n={referenceTrainingSet.length}</Text>
    </Card>
    <SectionTitle title="Simulator What‑If" trailing="UJI MANUAL" />
    <Card>
      <Text style={styles.body}>Geser nilai sensor untuk melihat perubahan kelas tanpa mengubah pembacaan perangkat.</Text>
      <RangeSlider label="pH air" value={whatIf.ph} min={6.5} max={9} step={0.01} precision={2} onChange={(v) => update("ph", v)} />
      <RangeSlider label="Suhu air" value={whatIf.temperature} min={24} max={36} step={0.1} unit="°C" precision={1} onChange={(v) => update("temperature", v)} />
      <RangeSlider label="Salinitas" value={whatIf.salinity} min={10} max={35} step={0.1} unit="ppt" precision={1} onChange={(v) => update("salinity", v)} />
      <View style={styles.result}><Text style={styles.resultLabel}>HASIL SIMULASI</Text><Pill tone={decision.classification === "BAGUS" ? "good" : "danger"}>{decision.classification}</Pill></View>
      <Text style={styles.recommendation}>{decision.recommendation}</Text>
      <View style={styles.saveScenario}><ActionButton label={savingScenario ? "Menyimpan..." : "Simpan Skenario ke Riwayat Uji"} onPress={() => { void saveScenario(); }} secondary /></View>
    </Card>
    <Text style={styles.disclaimer}>Catatan: dataset referensi 10 baris merupakan contoh demonstrasi, bukan dataset penelitian asli. Validasi ambang serta rekomendasi dengan data lapangan dan SOP teknis.</Text>
  </>;
}

const styles = StyleSheet.create({
  intro: { borderLeftWidth: 4, borderLeftColor: colors.brandPrimary },
  introTitle: { color: colors.textPrimary, fontFamily: fonts.bold, fontSize: 17, marginTop: 12 },
  body: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 11, lineHeight: 17, marginTop: 7 },
  table: { paddingVertical: 4 },
  journalCard: { paddingVertical: 10 },
  journalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.border },
  journalLabel: { width: "19%", textAlign: "right", color: colors.textSecondary, fontFamily: fonts.bold, fontSize: 7 },
  journalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 52, borderBottomWidth: 1, borderColor: colors.border, gap: 3 },
  journalAttribute: { width: "43%" },
  journalGain: { width: "19%", alignItems: "flex-end" },
  journalChildGain: { color: colors.textSecondary, fontFamily: fonts.mono, fontSize: 7, marginTop: 2 },
  tableHeader: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.border },
  tableLabel: { width: "18%", textAlign: "right", color: colors.textSecondary, fontFamily: fonts.bold, fontSize: 8 },
  tableRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 48, borderBottomWidth: 1, borderColor: colors.border },
  noBorder: { borderBottomWidth: 0 },
  attrColumn: { width: "46%", textAlign: "left" },
  attrName: { color: colors.textPrimary, fontFamily: fonts.medium, fontSize: 11 },
  attrSplit: { color: colors.textSecondary, fontFamily: fonts.mono, fontSize: 9, marginTop: 2 },
  number: { color: colors.textPrimary, fontFamily: fonts.mono, fontSize: 10, width: "18%", textAlign: "right", fontVariant: ["tabular-nums"] },
  entropyFoot: { color: colors.textSecondary, fontFamily: fonts.mono, fontSize: 9, borderTopWidth: 1, borderColor: colors.border, paddingVertical: 10 },
  result: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16, borderTopWidth: 1, borderColor: colors.border, paddingTop: 14 },
  resultLabel: { color: colors.textSecondary, fontFamily: fonts.bold, fontSize: 9 },
  recommendation: { color: colors.textPrimary, fontFamily: fonts.body, fontSize: 11, lineHeight: 17, marginTop: 10 },
  saveScenario: { marginTop: 12 },
  disclaimer: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 10, lineHeight: 15, marginTop: 4, marginBottom: 18 },
});
