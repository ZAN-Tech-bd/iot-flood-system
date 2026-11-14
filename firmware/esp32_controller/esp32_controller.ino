#include <Arduino.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "config.h"

#include <WiFi.h>
#include <WebServer.h>
#include <Wire.h>
#include <U8g2lib.h>

// =====================================
// OLED DISPLAY
// =====================================

U8G2_SH1106_128X64_NONAME_F_HW_I2C oled(
  U8G2_R0, U8X8_PIN_NONE
);

// =====================================
// WIFI ACCESS POINT
// =====================================

const char* ssid = LOCAL_AP_SSID;
const char* password = LOCAL_AP_PASSWORD;

WebServer server(80);

// =====================================
// PIN CONFIGURATION
// =====================================

// Water Sensor
#define WATER 34

// BTS7960
#define RPWM 25
#define LPWM 26
#define REN 27
#define LEN 14

// Buttons
#define FWD_BUTTON 32
#define REV_BUTTON 33

// Limit Switches
#define FWD_LIMIT 16
#define REV_LIMIT 4

// OLED I2C
#define SDA_PIN 21
#define SCL_PIN 22

// Water Thresholds
#define WET_THRESHOLD WATER_WET_THRESHOLD
#define DRY_THRESHOLD WATER_DRY_THRESHOLD

// =====================================
// GLOBAL VARIABLES
// =====================================

bool waterDetected = false;

// Web command:
// 0 = AUTO
// 1 = FORWARD
// -1 = REVERSE
// 2 = EMERGENCY STOP

int webCommand = 0;

String motorStatus = "STOP";

int waterValue = 0;

bool fwdButton = false;
bool revButton = false;
bool fwdLimit = false;
bool revLimit = false;

// Telemetry uses a queue: HTTP never delays the local control loop.
struct TelemetryReading {
  int raw, direction;
  float distance;
  bool upper, lower;
};
QueueHandle_t telemetryQueue = nullptr;

void telemetryTask(void *) {
  uint32_t retryAt = 0;
  for (;;) {
    if (WiFi.status() != WL_CONNECTED) {
      if (millis() - retryAt >= 5000) {
        WiFi.reconnect();
        retryAt = millis();
      }
    } else {
      TelemetryReading reading;
      if (xQueuePeek(telemetryQueue, &reading, 0) == pdTRUE) {
        JsonDocument payload;
        payload["waterRaw"] = reading.raw;
        payload["level"] = constrain(100.f * (reading.raw - WATER_RAW_EMPTY) / (WATER_RAW_FULL - WATER_RAW_EMPTY), 0.f, 100.f);
        payload["controlMode"] = "local";
        payload["motorActive"] = reading.direction != 0;
        payload["motorDirection"] = reading.direction > 0 ? "up" : reading.direction < 0 ? "down" : "stopped";
        payload["upperLimit"] = reading.upper;
        payload["lowerLimit"] = reading.lower;
        if (reading.distance >= 0) payload["distanceCm"] = reading.distance;
        else payload["distanceCm"] = nullptr;
        String body;
        serializeJson(payload, body);
        WiFiClient client;
        HTTPClient http;
        http.setConnectTimeout(1000);
        http.setTimeout(1000);
        if (http.begin(client, SERVER_URL)) {
          http.addHeader("Content-Type", "application/json");
          http.POST(body);
          http.end();
        }
      }
    }
    vTaskDelay(pdMS_TO_TICKS(1000));
  }
}

// =====================================
// MOTOR FUNCTIONS
// =====================================

void stopMotor() {
  analogWrite(RPWM, 0);
  analogWrite(LPWM, 0);
  motorStatus = "STOP";
}

void forward() {
  analogWrite(LPWM, 0);
  analogWrite(RPWM, 255);
  motorStatus = "FORWARD";
}

void reverse() {
  analogWrite(RPWM, 0);
  analogWrite(LPWM, 255);
  motorStatus = "REVERSE";
}

// =====================================
// OLED DISPLAY
// =====================================

void updateOLED() {

  char buffer[30];

  oled.clearBuffer();
  oled.setFont(u8g2_font_6x10_tf);

  oled.drawStr(0, 10, "WATER MOTOR CONTROL");
  oled.drawHLine(0, 13, 128);

  snprintf(buffer, sizeof(buffer),
           "Water: %d", waterValue);
  oled.drawStr(0, 25, buffer);

  snprintf(buffer, sizeof(buffer),
           "Status: %s",
           waterDetected ? "WET" : "DRY");
  oled.drawStr(0, 36, buffer);

  snprintf(buffer, sizeof(buffer),
           "Motor: %s", motorStatus.c_str());
  oled.drawStr(0, 47, buffer);

  snprintf(buffer, sizeof(buffer),
           "F:%s R:%s",
           fwdButton ? "ON" : "OFF",
           revButton ? "ON" : "OFF");
  oled.drawStr(0, 58, buffer);

  snprintf(buffer, sizeof(buffer),
           "FL:%s RL:%s",
           fwdLimit ? "ON" : "OFF",
           revLimit ? "ON" : "OFF");
  oled.drawStr(75, 58, buffer);

  oled.sendBuffer();
}

// =====================================
// WEB DASHBOARD HTML
// =====================================

const char webpage[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">

<title>Water Motor Dashboard</title>

<style>
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 18px;
  font-family: Arial, sans-serif;
  background: #101827;
  color: white;
}

.container {
  max-width: 650px;
  margin: auto;
}

h2 {
  text-align: center;
  color: #38bdf8;
}

.subtitle {
  text-align: center;
  color: #9ca3af;
  font-size: 13px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-top: 22px;
}

.card {
  background: #1e293b;
  padding: 20px;
  border-radius: 12px;
  text-align: center;
}

.card h4 {
  color: #94a3b8;
  margin: 0 0 12px;
}

.value {
  font-size: 23px;
  font-weight: bold;
  color: #38bdf8;
}

.status {
  margin-top: 20px;
  background: #1e293b;
  padding: 18px;
  border-radius: 12px;
}

.buttons {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-top: 20px;
}

button {
  border: none;
  padding: 16px 8px;
  border-radius: 9px;
  font-size: 15px;
  font-weight: bold;
  color: white;
  cursor: pointer;
}

.forward {
  background: #16a34a;
}

.reverse {
  background: #2563eb;
}

.auto {
  background: #0891b2;
}

.stop {
  background: #dc2626;
  grid-column: span 2;
}

button:active {
  opacity: 0.7;
}

.indicator {
  display: flex;
  justify-content: space-between;
  padding: 9px 0;
  border-bottom: 1px solid #334155;
}

.lift-scene { height: 150px; display: grid; place-items: center; overflow: hidden; border-bottom: 4px solid #38bdf8; margin-top: 24px; }
.house { font-size: 64px; }
.house.lifting { animation: rise 1.6s ease-in-out infinite; }
.house.lowering { animation: rise 1.6s ease-in-out infinite reverse; }
@keyframes rise { from { transform: translateY(20px); } to { transform: translateY(-25px); } }
@media (prefers-reduced-motion: reduce) { .house.lifting, .house.lowering { animation: none; } }
.footer {
  text-align: center;
  margin-top: 25px;
  color: #64748b;
  font-size: 12px;
}
</style>
</head>

<body>

<div class="container">

<h2>WATER MOTOR CONTROL</h2>
<p class="subtitle">ESP32 Local Dashboard</p>

<div class="lift-scene" role="img" aria-label="House lift stopped" id="liftScene"><div class="house" id="house">&#127968;</div></div>

<div class="grid">

<div class="card">
<h4>Water Sensor</h4>
<div class="value" id="water">0</div>
</div>

<div class="card">
<h4>Water Status</h4>
<div class="value" id="waterStatus">DRY</div>
</div>

<div class="card">
<h4>Motor Direction</h4>
<div class="value" id="motor">STOP</div>
</div>

<div class="card">
<h4>Control Mode</h4>
<div class="value" id="mode">AUTO</div>
</div>

</div>

<div class="status">

<h3>System Status</h3>

<div class="indicator">
<span>Forward Button</span>
<strong id="fb">OFF</strong>
</div>

<div class="indicator">
<span>Reverse Button</span>
<strong id="rb">OFF</strong>
</div>

<div class="indicator">
<span>Forward Limit</span>
<strong id="fl">OFF</strong>
</div>

<div class="indicator">
<span>Reverse Limit</span>
<strong id="rl">OFF</strong>
</div>

</div>

<h3>Motor Controls</h3>

<div class="buttons">

<button class="forward"
onclick="sendCommand('forward')">
FORWARD
</button>

<button class="reverse"
onclick="sendCommand('reverse')">
REVERSE
</button>

<button class="auto"
onclick="sendCommand('auto')">
AUTOMATIC MODE
</button>

<button class="stop"
onclick="sendCommand('stop')">
EMERGENCY STOP
</button>

</div>

<div class="footer">
ESP32 Hosted Server | Local Network
</div>

</div>

<script>

async function refreshData() {

  try {

    const response = await fetch('/data');
    const d = await response.json();

    document.getElementById('water').innerText =
      d.water;

    document.getElementById('waterStatus').innerText =
      d.waterStatus;

    document.getElementById('motor').innerText =
      d.motor;

    const house = document.getElementById('house');
    house.classList.toggle('lifting', d.motor === 'FORWARD');
    house.classList.toggle('lowering', d.motor === 'REVERSE');
    document.getElementById('liftScene').setAttribute('aria-label', d.motor === 'FORWARD' ? 'House is lifting' : d.motor === 'REVERSE' ? 'House is lowering' : 'House lift stopped');

    document.getElementById('mode').innerText =
      d.mode;

    document.getElementById('fb').innerText =
      d.fwdButton ? 'PRESSED' : 'OFF';

    document.getElementById('rb').innerText =
      d.revButton ? 'PRESSED' : 'OFF';

    document.getElementById('fl').innerText =
      d.fwdLimit ? 'PRESSED' : 'OFF';

    document.getElementById('rl').innerText =
      d.revLimit ? 'PRESSED' : 'OFF';

  } catch(e) {
    document.getElementById('house').classList.remove('lifting', 'lowering');
    document.getElementById('liftScene').setAttribute('aria-label', 'Device connection lost');
    console.log('Connection lost');
  }
}

async function sendCommand(command) {

  try {
    await fetch('/cmd?set=' + command);
    refreshData();
  } catch(e) {
    alert('ESP32 connection failed');
  }
}

setInterval(refreshData, 500);

refreshData();

</script>

</body>
</html>
)rawliteral";

// =====================================
// WEB SERVER ROUTES
// =====================================

void handleRoot() {

  server.send_P(
    200,
    "text/html",
    webpage
  );

}

void handleData() {

  String mode = "AUTO";

  if (webCommand == 1) mode = "MANUAL";
  if (webCommand == -1) mode = "MANUAL";
  if (webCommand == 2) mode = "STOP";

  String json = "{";

  json += "\"water\":" + String(waterValue) + ",";
  json += "\"waterStatus\":\"";
  json += waterDetected ? "WET" : "DRY";
  json += "\",";

  json += "\"motor\":\"" + motorStatus + "\",";
  json += "\"mode\":\"" + mode + "\",";

  json += "\"fwdButton\":";
  json += fwdButton ? "true" : "false";
  json += ",";

  json += "\"revButton\":";
  json += revButton ? "true" : "false";
  json += ",";

  json += "\"fwdLimit\":";
  json += fwdLimit ? "true" : "false";
  json += ",";

  json += "\"revLimit\":";
  json += revLimit ? "true" : "false";

  json += "}";

  server.send(200, "application/json", json);

}

void handleCommand() {

  if (!server.hasArg("set")) {
    server.send(400, "text/plain", "Missing command");
    return;
  }

  String command = server.arg("set");

  if (command == "forward") {
    webCommand = 1;
  }

  else if (command == "reverse") {
    webCommand = -1;
  }

  else if (command == "auto") {
    webCommand = 0;
  }

  else if (command == "stop") {
    webCommand = 2;
  }

  else {
    server.send(400, "text/plain", "Invalid command");
    return;
  }

  server.send(200, "text/plain", "Command received");

}

// =====================================
// SETUP
// =====================================

void setup() {

  Serial.begin(115200);

  // I2C
  Wire.begin(SDA_PIN, SCL_PIN);

  // OLED
  oled.begin();

  // Sensor
  pinMode(WATER, INPUT);

  // BTS7960
  pinMode(RPWM, OUTPUT);
  pinMode(LPWM, OUTPUT);
  pinMode(REN, OUTPUT);
  pinMode(LEN, OUTPUT);

  // Buttons
  pinMode(FWD_BUTTON, INPUT_PULLUP);
  pinMode(REV_BUTTON, INPUT_PULLUP);

  // Limit switches
  pinMode(FWD_LIMIT, INPUT_PULLUP);
  pinMode(REV_LIMIT, INPUT_PULLUP);

  digitalWrite(REN, HIGH);
  digitalWrite(LEN, HIGH);

  stopMotor();

  // WiFi Access Point
  WiFi.mode(WIFI_AP_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  WiFi.softAP(ssid, password);

  Serial.println();
  Serial.println("WIFI STARTED");

  Serial.print("WiFi Name: ");
  Serial.println(ssid);

  Serial.print("Dashboard IP: ");
  Serial.println(WiFi.softAPIP());

  // Web Server
  server.on("/", handleRoot);
  server.on("/data", handleData);
  server.on("/cmd", handleCommand);

  server.begin();

  pinMode(18, OUTPUT);
  pinMode(19, INPUT);
  digitalWrite(18, LOW);
  telemetryQueue = xQueueCreate(1, sizeof(TelemetryReading));
  if (telemetryQueue && xTaskCreatePinnedToCore(telemetryTask, "telemetry", 8192, nullptr, 1, nullptr, 0) != pdPASS)
    Serial.println("Telemetry task unavailable; local control continues");

  Serial.println("WEB SERVER STARTED");

}

// =====================================
// MAIN LOOP
// =====================================

void loop() {

  // Handle web requests
  server.handleClient();

  // Read sensors
  waterValue = analogRead(WATER);

  fwdButton = digitalRead(FWD_BUTTON) == LOW;
  revButton = digitalRead(REV_BUTTON) == LOW;

  fwdLimit = digitalRead(FWD_LIMIT) == LOW;
  revLimit = digitalRead(REV_LIMIT) == LOW;

  // Water detection
  if (waterValue >= WET_THRESHOLD) {
    waterDetected = true;
  }
  else if (waterValue <= DRY_THRESHOLD) {
    waterDetected = false;
  }

  // =================================
  // MOTOR CONTROL PRIORITY
  // =================================

  // Emergency stop
  if (webCommand == 2) {

    stopMotor();

  }

  // Both limit switches pressed
  else if (fwdLimit && revLimit) {

    stopMotor();

  }

  // Both physical buttons pressed
  else if (fwdButton && revButton) {

    stopMotor();

  }

  // Physical forward button
  else if (fwdButton) {

    if (!fwdLimit) {
      forward();
    }
    else {
      stopMotor();
    }

  }

  // Physical reverse button
  else if (revButton) {

    if (!revLimit) {
      reverse();
    }
    else {
      stopMotor();
    }

  }

  // Web forward
  else if (webCommand == 1) {

    if (!fwdLimit) {
      forward();
    }
    else {
      stopMotor();
    }

  }

  // Web reverse
  else if (webCommand == -1) {

    if (!revLimit) {
      reverse();
    }
    else {
      stopMotor();
    }

  }

  // Automatic water control
  else {

    if (waterDetected) {

      if (!fwdLimit) {
        forward();
      }
      else {
        stopMotor();
      }

    }

    else {

      if (!revLimit) {
        reverse();
      }
      else {
        stopMotor();
      }

    }

  }

  // Ultrasonic distance is monitoring only, matching the supplied control logic.
  digitalWrite(18, LOW); delayMicroseconds(2);
  digitalWrite(18, HIGH); delayMicroseconds(10); digitalWrite(18, LOW);
  unsigned long duration = pulseIn(19, HIGH, 25000);
  float cm = duration * 0.0343f / 2;
  TelemetryReading reading = {waterValue, motorStatus == "FORWARD" ? 1 : motorStatus == "REVERSE" ? -1 : 0,
    duration && cm >= 2 && cm <= 400 ? cm : -1.f, fwdLimit, revLimit};
  if (telemetryQueue) xQueueOverwrite(telemetryQueue, &reading);

  // Update OLED
  updateOLED();

  // Serial Monitor
  Serial.print("Water: ");
  Serial.print(waterValue);

  Serial.print(" | Status: ");
  Serial.print(waterDetected ? "WET" : "DRY");

  Serial.print(" | Motor: ");
  Serial.println(motorStatus);

  delay(100);

}
