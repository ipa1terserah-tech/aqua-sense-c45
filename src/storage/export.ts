import { Platform, Share } from "react-native";
import { StoredReading } from "./index";

export async function exportReadingsCsv(readings: StoredReading[]): Promise<void> {
  const rows = [
    ["No", "Waktu_Terima", "Sumber_Data", "pH_Terkalibrasi", "Suhu_C", "Salinitas_ppt", "Latensi_ms", "Kelengkapan_Data", "Klasifikasi_C45", "Rekomendasi"],
    ...readings.map((item, index) => [
      String(index + 1),
      item.receivedAt ?? item.timestamp,
      item.source,
      item.ph.toFixed(2),
      item.temperature.toFixed(1),
      item.salinity.toFixed(1),
      item.latencyMs === undefined ? "" : String(item.latencyMs),
      item.isComplete === undefined ? "" : item.isComplete ? "LENGKAP" : "TIDAK LENGKAP",
      item.classification,
      item.recommendation ?? (item.calibrationTest
        ? `Uji pembanding ${item.calibrationTest.status}; pH error ${item.calibrationTest.errors.ph.toFixed(2)} (${item.calibrationTest.errorPercentages.ph.toFixed(2)}%), suhu ${item.calibrationTest.errors.temperature.toFixed(2)} (${item.calibrationTest.errorPercentages.temperature.toFixed(2)}%), salinitas ${item.calibrationTest.errors.salinity.toFixed(2)} (${item.calibrationTest.errorPercentages.salinity.toFixed(2)}%).`
        : ""),
    ]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  if (Platform.OS === "web" && (typeof navigator === "undefined" || !("share" in navigator))) {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `aquapenaeus-c45-uji-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    return;
  }
  await Share.share({ title: "Ekspor CSV Pengujian Aquapenaeus C4.5", message: csv });
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
