#include <Arduino.h>
#include <Wire.h>
#include <U8g2lib.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "config.h"

// Arduino-ESP32 3.x. GPIO 32 and 33 are intentionally unused.
constexpr int RPWM = 25, LPWM = 26, R_EN = 27, L_EN = 14;
constexpr int WATER = 34, TRIG = 18, ECHO = 19, BUZZER = 23;
constexpr int FORWARD_LIMIT = 16, BACKWARD_LIMIT = 4;
constexpr uint32_t WATCHDOG_MS = 3500, MAX_RUN_MS = 15000;
U8G2_SH1106_128X64_NONAME_F_HW_I2C oled(U8G2_R0, U8X8_PIN_NONE);

// Only loop() touches motor outputs and sensors. HTTP runs in another task.
struct Reading { float level, distance; int direction; bool upperLimit, lowerLimit; };
struct Command {
  bool valid;
  int action; // 0 stop, 1 up, -1 down, 2 auto
  float startLevel, stopLevel, baseline, maxHeight;
  uint32_t receivedAt, budget;
  char id[40];
};
QueueHandle_t readings, commands;
Command command = {};
bool pwmReady = false, connected = false, autoRaised = false, runLocked = false;
bool runWindowActive = false;
float waterLevel = 0, distanceCm = -1;
int currentDirection = 0, pendingDirection = 0;
uint32_t lastStopped = 0, runStarted = 0, lastContact = 0;

void stopMotor() {
  if (pwmReady) { ledcWrite(RPWM, 0); ledcWrite(LPWM, 0); }
  digitalWrite(R_EN, LOW); digitalWrite(L_EN, LOW);
  if (currentDirection) lastStopped = millis();
  currentDirection = 0;
}

void networkTask(void *) {
  uint32_t retry = 0;
  for (;;) {
    uint32_t started = millis();
    Reading reading;
    if (WiFi.status() != WL_CONNECTED) {
      if (millis() - retry >= 5000) { WiFi.reconnect(); retry = millis(); }
      Command failed = {}; xQueueOverwrite(commands, &failed);
    } else if (xQueuePeek(readings, &reading, 0) == pdTRUE) {
      JsonDocument payload;
      payload["level"] = reading.level;
      if (reading.distance >= 0) payload["distanceCm"] = reading.distance;
      else payload["distanceCm"] = nullptr;
      payload["motorActive"] = reading.direction != 0;
      payload["upperLimit"] = reading.upperLimit;
      payload["lowerLimit"] = reading.lowerLimit;
      payload["motorDirection"] = reading.direction > 0 ? "up" : reading.direction < 0 ? "down" : "stopped";
      String body; serializeJson(payload, body);
      WiFiClient client;
      HTTPClient http;
      Command next = {};
      http.setConnectTimeout(1000); http.setTimeout(1000);
      if (http.begin(client, SERVER_URL)) {
        http.addHeader("Content-Type", "application/json");
        int status = http.POST(body);
        if (status == 200) {
          JsonDocument reply;
          if (!deserializeJson(reply, http.getString())) {
            String action = reply["liftCommand"] | "";
            bool known = action == "auto" || action == "up" || action == "down" || action == "stop";
            bool fields = reply["startLevel"].is<float>() && reply["stopLevel"].is<float>() &&
                          reply["baselineCm"].is<float>() && reply["maxHeightCm"].is<float>();
            next.startLevel = reply["startLevel"] | -1.f;
            next.stopLevel = reply["stopLevel"] | -1.f;
            next.baseline = reply["baselineCm"] | -1.f;
            next.maxHeight = reply["maxHeightCm"] | -1.f;
            next.valid = known && fields && next.stopLevel >= 0 && next.startLevel <= 100 &&
                         next.startLevel > next.stopLevel && next.baseline >= 0 && next.baseline <= 1000 &&
                         next.maxHeight > 0 && next.maxHeight <= 1000;
            next.action = action == "up" ? 1 : action == "down" ? -1 : action == "auto" ? 2 : 0;
            next.budget = MAX_RUN_MS;
            // Remaining budget is calculated by the server from the UTC deadline.
            // Subtract the entire round trip conservatively; no NTP dependency.
            if (!reply["commandExpiresAt"].isNull()) {
              if (!reply["commandRemainingMs"].is<uint32_t>()) next.valid = false;
              uint32_t remaining = reply["commandRemainingMs"] | 0u;
              uint32_t elapsed = millis() - started;
              next.budget = remaining > elapsed ? min(remaining - elapsed, MAX_RUN_MS) : 0;
            }
            strlcpy(next.id, reply["commandId"] | "", sizeof(next.id));
            next.receivedAt = millis();
          }
        } else { Serial.printf("Telemetry HTTP: %d\n", status); }
        http.end();
      }
      xQueueOverwrite(commands, &next);
    }
    vTaskDelay(pdMS_TO_TICKS(1000));
  }
}

void updateSensors() {
  static uint32_t last = 0;
  static bool initialized = false;
  if (millis() - last < 250) return;
  last = millis();
  int values[9];
  for (int &value : values) value = analogRead(WATER);
  for (int i = 0; i < 8; ++i)
    for (int j = i + 1; j < 9; ++j)
      if (values[j] < values[i]) { int v = values[i]; values[i] = values[j]; values[j] = v; }
  float level = constrain(100.f * (values[4] - WATER_RAW_EMPTY) / (WATER_RAW_FULL - WATER_RAW_EMPTY), 0.f, 100.f);
  waterLevel = initialized ? waterLevel * .75f + level * .25f : level;
  initialized = true;
  digitalWrite(TRIG, LOW); delayMicroseconds(2);
  digitalWrite(TRIG, HIGH); delayMicroseconds(10); digitalWrite(TRIG, LOW);
  unsigned long duration = pulseIn(ECHO, HIGH, 25000);
  float cm = duration * .0343f / 2;
  distanceCm = duration && cm >= 2 && cm <= 400 ? cm : -1;
  Serial.printf("Water raw=%d level=%.1f distance=%.1f\n", values[4], waterLevel, distanceCm);
}

void updateControl() {
  Command next;
  if (xQueueReceive(commands, &next, 0) == pdTRUE) {
    if (!next.valid) { connected = false; stopMotor(); }
    else {
      // A genuinely new dashboard request can release the local run timeout.
      if (strcmp(next.id, command.id) != 0 || next.action == 0) {
        runLocked = false; runWindowActive = false;
      }
      command = next; lastContact = millis(); connected = true;
    }
  }
  uint32_t now = millis();
  if (!pwmReady || !connected || WiFi.status() != WL_CONNECTED || now - lastContact >= WATCHDOG_MS) {
    connected = false; stopMotor(); pendingDirection = 0; return;
  }
  int desired = command.action;
  if (desired == 2) {
    bool previousTarget = autoRaised;
    if (waterLevel >= command.startLevel) autoRaised = true;
    else if (waterLevel <= command.stopLevel) autoRaised = false;
    if (autoRaised != previousTarget) { runLocked = false; runWindowActive = false; }
    // Automatic mode raises above startLevel and lowers below stopLevel.
    desired = autoRaised ? 1 : -1;
  }
  if (now - command.receivedAt >= command.budget) desired = 0;
  // Immediate active-low checks: never debounce assertion of a travel limit.
  bool upper = digitalRead(FORWARD_LIMIT) == LOW;
  bool lower = digitalRead(BACKWARD_LIMIT) == LOW;
  if ((upper && lower) || (desired > 0 && upper) || (desired < 0 && lower)) {
    desired = 0; runLocked = true;
  }
  // Unknown height inhibits motion; limits still allow retreat from either end.
  if (distanceCm < 0) desired = 0;
  if (desired > 0 && distanceCm - command.baseline >= command.maxHeight) desired = 0;
  if (runWindowActive && now - runStarted >= MAX_RUN_MS) runLocked = true;
  if (runLocked) desired = 0;
  if (!desired) { stopMotor(); pendingDirection = 0; return; }
  if (currentDirection == desired) return;
  stopMotor();
  if (pendingDirection != desired) { pendingDirection = desired; lastStopped = now; }
  if (now - lastStopped < 150) return;
  digitalWrite(R_EN, HIGH); digitalWrite(L_EN, HIGH);
  ledcWrite(RPWM, desired > 0 ? MOTOR_RUN_PWM : 0);
  ledcWrite(LPWM, desired < 0 ? MOTOR_RUN_PWM : 0);
  currentDirection = desired;
  if (!runWindowActive) { runStarted = now; runWindowActive = true; }
}

void updateDisplayAndBuzzer() {
  static uint32_t last = 0, alertStart = 0;
  static int beepCount = 0;
  uint32_t now = millis();
  if (now - alertStart >= 3000) {
    alertStart = now;
    beepCount = distanceCm > 0 && distanceCm < 10 ? 3 : waterLevel < 20 ? 2 : 0;
  }
  uint32_t phase = now - alertStart;
  digitalWrite(BUZZER, phase < uint32_t(beepCount * 300) && phase % 300 < 150);
  if (now - last < 200) return;
  last = now;
  oled.clearBuffer(); oled.setFont(u8g2_font_6x10_tf);
  oled.setCursor(0, 10); oled.print(connected ? "Server: OK" : "Server: OFFLINE");
  oled.setCursor(0, 23); oled.printf("Motor: %s", currentDirection > 0 ? "UP" : currentDirection < 0 ? "DOWN" : "STOP");
  oled.setCursor(0, 36); oled.printf("Water: %.0f%%", waterLevel);
  oled.setCursor(0, 49);
  if (distanceCm < 0) oled.print("Distance: No echo"); else oled.printf("Distance: %.1f cm", distanceCm);
  oled.setCursor(0, 62); oled.printf("F:%s B:%s", digitalRead(FORWARD_LIMIT) ? "OK" : "LIMIT", digitalRead(BACKWARD_LIMIT) ? "OK" : "LIMIT");
  oled.sendBuffer();
}

void setup() {
  Serial.begin(115200);
  pinMode(R_EN, OUTPUT); pinMode(L_EN, OUTPUT);
  digitalWrite(R_EN, LOW); digitalWrite(L_EN, LOW);
  bool right = ledcAttach(RPWM, 20000, 10);
  bool left = ledcAttach(LPWM, 20000, 10);
  pwmReady = right && left;
  if (right) ledcWrite(RPWM, 0);
  if (left) ledcWrite(LPWM, 0);
  if (!pwmReady) Serial.println("PWM initialization failed: motion disabled");
  pinMode(FORWARD_LIMIT, INPUT_PULLUP); pinMode(BACKWARD_LIMIT, INPUT_PULLUP);
  pinMode(TRIG, OUTPUT); pinMode(ECHO, INPUT); pinMode(BUZZER, OUTPUT);
  digitalWrite(TRIG, LOW); digitalWrite(BUZZER, LOW);
  analogReadResolution(12); analogSetPinAttenuation(WATER, ADC_11db);
  Wire.begin(21, 22); oled.setI2CAddress(0x3C << 1); oled.begin();
  readings = xQueueCreate(1, sizeof(Reading)); commands = xQueueCreate(1, sizeof(Command));
  if (!readings || !commands) { stopMotor(); while (true) delay(1000); }
  WiFi.mode(WIFI_STA); WiFi.setAutoReconnect(true); WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  if (xTaskCreate(networkTask, "server-http", 8192, nullptr, 1, nullptr) != pdPASS) {
    Serial.println("Network task failed: motion disabled");
  }
}

void loop() {
  updateControl();
  updateSensors();
  updateControl();
  Reading reading = {waterLevel, distanceCm, currentDirection,
                     digitalRead(FORWARD_LIMIT) == LOW, digitalRead(BACKWARD_LIMIT) == LOW};
  xQueueOverwrite(readings, &reading);
  updateDisplayAndBuzzer();
  delay(1);
}
