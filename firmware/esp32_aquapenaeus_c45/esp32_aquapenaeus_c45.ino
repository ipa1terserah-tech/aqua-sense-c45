/*
 * Aquapenaeus C4.5 - telemetry node for Tambak Maneron.
 *
 * Arduino IDE libraries:
 *   - OneWire (Paul Stoffregen)
 *   - DallasTemperature (Miles Burton)
 *
 * Pinout:
 *   GPIO 4  -> DS18B20 data; add a 4.7 kOhm pull-up to 3V3.
 *   GPIO 34 -> analog pH module output (ADC1, input only).
 *   GPIO 35 -> analog EC/TDS module output (ADC1, input only).
 *   All sensor grounds must share ESP32 GND. Never apply more than 3.3 V
 *   to an ESP32 ADC pin; add a divider if a sensor can output higher voltage.
 *
 * Calibrate the three pH voltages with pH 4/7/10 buffer solutions, and
 * calibrate the EC voltages against the 1.413 and 12.88 mS/cm standards.
 * The EC-to-ppt factor is an initial seawater approximation and must be
 * checked against a salinity reference for the actual probe and water.
 */
#include <OneWire.h>
#include <DallasTemperature.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <time.h>
#include <math.h>
#include <string.h>

#if __has_include("secrets.h")
#include "secrets.h"
#else
#warning "Copy secrets.example.h to secrets.h and configure Supabase before use."
#define AQUA_WIFI_SSID "GANTI_DENGAN_SSID"
#define AQUA_WIFI_PASSWORD "GANTI_DENGAN_PASSWORD"
#define AQUA_SUPABASE_FUNCTION_URL \
  "https://YOUR_PROJECT_REF.supabase.co/functions/v1/telemetry-ingest"
#define AQUA_SUPABASE_ANON_KEY "GANTI_DENGAN_PUBLIC_ANON_KEY"
#define AQUA_DEVICE_TOKEN "GANTI_DENGAN_TOKEN_PERANGKAT"
#define AQUA_SUPABASE_ROOT_CA "GANTI_DENGAN_ROOT_CA_TLS_SUPABASE"
#endif

constexpr uint8_t PIN_DS18B20 = 4;
constexpr uint8_t PIN_PH_ADC = 34;
constexpr uint8_t PIN_EC_ADC = 35;
constexpr uint32_t SEND_INTERVAL_MS = 600000UL;
constexpr uint8_t FILTER_WINDOW = 10;

const char *WIFI_SSID = AQUA_WIFI_SSID;
const char *WIFI_PASSWORD = AQUA_WIFI_PASSWORD;
const char *SUPABASE_FUNCTION_URL = AQUA_SUPABASE_FUNCTION_URL;
const char *SUPABASE_ANON_KEY = AQUA_SUPABASE_ANON_KEY;
const char *DEVICE_TOKEN = AQUA_DEVICE_TOKEN;
const char *SUPABASE_ROOT_CA = AQUA_SUPABASE_ROOT_CA;
const char *DEVICE_ID = "ESP32-AQP-A1";
const char *POND_ID = "KOLAM-A1";
const char *LOCATION = "Tambak Maneron, Bangkalan Madura";

// Replace the pH voltages with readings from your calibrated probe.
const float PH_CAL_VOLTAGE[] = {2.50f, 2.00f, 1.50f};
const float PH_CAL_VALUE[] = {4.00f, 7.00f, 10.00f};
constexpr uint8_t PH_CAL_POINTS = 3;

// Replace these voltages with readings from the installed EC module.
constexpr float EC_VOLTAGE_AT_1_413 = 0.17f;
constexpr float EC_VOLTAGE_AT_12_88 = 2.50f;
constexpr float EC_STANDARD_LOW = 1.413f;
constexpr float EC_STANDARD_HIGH = 12.88f;
constexpr float EC_TEMP_COEFFICIENT = 0.02f;
constexpr float EC_TO_PPT_FACTOR = 0.64f;

OneWire oneWire(PIN_DS18B20);
DallasTemperature temperatureSensor(&oneWire);
uint32_t lastSendAt = 0;

class MovingAverage {
 public:
  void add(float value) {
    values_[next_] = value;
    next_ = (next_ + 1) % FILTER_WINDOW;
    if (count_ < FILTER_WINDOW) ++count_;
  }

  float value() const {
    if (count_ == 0) return NAN;
    float sum = 0.0f;
    for (uint8_t i = 0; i < count_; ++i) sum += values_[i];
    return sum / count_;
  }

 private:
  float values_[FILTER_WINDOW] = {};
  uint8_t next_ = 0;
  uint8_t count_ = 0;
};

MovingAverage phVoltageFilter;
MovingAverage ecVoltageFilter;
MovingAverage temperatureFilter;

float sampleVoltage(uint8_t pin, MovingAverage &filter) {
  for (uint8_t i = 0; i < FILTER_WINDOW; ++i) {
    filter.add(analogReadMilliVolts(pin) / 1000.0f);
    delay(25);
  }
  return filter.value();
}

float sampleWaterTemperature() {
  uint8_t validSamples = 0;
  for (uint8_t i = 0; i < 5; ++i) {
    temperatureSensor.requestTemperatures();
    const float reading = temperatureSensor.getTempCByIndex(0);
    if (reading != DEVICE_DISCONNECTED_C && reading >= -10.0f && reading <= 60.0f) {
      temperatureFilter.add(reading);
      ++validSamples;
    }
    delay(25);
  }
  return validSamples == 0 ? NAN : temperatureFilter.value();
}

float linearPhFromVoltage(float voltage) {
  float sumX = 0.0f;
  float sumY = 0.0f;
  float sumXY = 0.0f;
  float sumX2 = 0.0f;
  for (uint8_t i = 0; i < PH_CAL_POINTS; ++i) {
    sumX += PH_CAL_VOLTAGE[i];
    sumY += PH_CAL_VALUE[i];
    sumXY += PH_CAL_VOLTAGE[i] * PH_CAL_VALUE[i];
    sumX2 += PH_CAL_VOLTAGE[i] * PH_CAL_VOLTAGE[i];
  }
  const float denominator = PH_CAL_POINTS * sumX2 - sumX * sumX;
  if (fabsf(denominator) < 0.000001f) return NAN;
  const float slope = (PH_CAL_POINTS * sumXY - sumX * sumY) / denominator;
  const float intercept = (sumY - slope * sumX) / PH_CAL_POINTS;
  return constrain(slope * voltage + intercept, 0.0f, 14.0f);
}

float salinityPptFromVoltage(float voltage, float waterTemperature) {
  const float voltageSpan = EC_VOLTAGE_AT_12_88 - EC_VOLTAGE_AT_1_413;
  if (fabsf(voltageSpan) < 0.000001f) return NAN;
  const float ecAtProbeTemperature = EC_STANDARD_LOW
      + (voltage - EC_VOLTAGE_AT_1_413)
          * (EC_STANDARD_HIGH - EC_STANDARD_LOW) / voltageSpan;
  const float compensation = 1.0f + EC_TEMP_COEFFICIENT * (waterTemperature - 25.0f);
  if (compensation <= 0.0f) return NAN;
  const float ecAt25C = max(0.0f, ecAtProbeTemperature) / compensation;
  return ecAt25C * EC_TO_PPT_FACTOR;
}

bool connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return true;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  const uint32_t startedAt = millis();
  while (WiFi.status() != WL_CONNECTED
      && static_cast<uint32_t>(millis() - startedAt) < 15000UL) {
    delay(250);
  }
  return WiFi.status() == WL_CONNECTED;
}

bool formatTimestamp(char *buffer, size_t bufferSize) {
  struct tm timeInfo;
  if (!getLocalTime(&timeInfo, 1000)) return false;
  return strftime(buffer, bufferSize, "%Y-%m-%dT%H:%M:%SZ", &timeInfo) > 0;
}

void sendTelemetry(float temperatureC, float ph, float salinityPpt) {
  if (!connectWiFi()) {
    Serial.println("Wi-Fi offline; siklus ini tidak terkirim.");
    return;
  }

  char timestamp[25];
  if (!formatTimestamp(timestamp, sizeof(timestamp))) {
    Serial.println("Waktu NTP belum tersedia; telemetry tidak dikirim.");
    return;
  }

  char payload[320];
  snprintf(
      payload,
      sizeof(payload),
      "{\"device_id\":\"%s\",\"pond_id\":\"%s\",\"location\":\"%s\","
      "\"temperature\":%.2f,\"ph\":%.2f,\"salinity\":%.2f,"
      "\"measured_at\":\"%s\"}",
      DEVICE_ID,
      POND_ID,
      LOCATION,
      temperatureC,
      ph,
      salinityPpt,
      timestamp);

  WiFiClientSecure secureClient;
  secureClient.setCACert(SUPABASE_ROOT_CA);
  HTTPClient http;
  if (!http.begin(secureClient, SUPABASE_FUNCTION_URL)) {
    Serial.println("URL API tidak dapat dibuka.");
    return;
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("x-device-token", DEVICE_TOKEN);
  const int statusCode = http.POST(reinterpret_cast<uint8_t *>(payload), strlen(payload));
  Serial.printf("POST telemetry: HTTP %d\n", statusCode);
  if (statusCode < 0) Serial.println(http.errorToString(statusCode));
  http.end();
}

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  temperatureSensor.begin();
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  connectWiFi();
  lastSendAt = millis();
  Serial.println("Aquapenaeus C4.5 ESP32 siap; interval 10 menit.");
}

void loop() {
  const uint32_t now = millis();
  if (static_cast<uint32_t>(now - lastSendAt) < SEND_INTERVAL_MS) {
    delay(100);
    return;
  }
  lastSendAt = now;

  const float temperatureC = sampleWaterTemperature();
  const float phVoltage = sampleVoltage(PIN_PH_ADC, phVoltageFilter);
  const float ecVoltage = sampleVoltage(PIN_EC_ADC, ecVoltageFilter);
  const float ph = linearPhFromVoltage(phVoltage);
  const float salinityPpt = salinityPptFromVoltage(ecVoltage, temperatureC);

  if (!isfinite(temperatureC) || !isfinite(ph) || !isfinite(salinityPpt)) {
    Serial.println("Pembacaan sensor tidak valid; siklus dibatalkan.");
    return;
  }
  Serial.printf("Suhu %.2f C | pH %.2f | Salinitas %.2f ppt\n",
                temperatureC, ph, salinityPpt);
  sendTelemetry(temperatureC, ph, salinityPpt);
}
