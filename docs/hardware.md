# ESP32 hardware and firmware

The [sketch](../firmware/esp32_controller/esp32_controller.ino) follows the supplied working water-motor controller, with optional uploads to the main dashboard and a house animation on its local page.

## Wiring

| Component                               | GPIO    |
| --------------------------------------- | ------- |
| SH1106 OLED SDA / SCL                   | 21 / 22 |
| Water sensor analog output              | 34      |
| BTS7960 RPWM / LPWM                     | 25 / 26 |
| BTS7960 REN / LEN                       | 27 / 14 |
| Forward (Up) / Reverse (Down) button    | 32 / 33 |
| Forward (upper) / Reverse (lower) limit | 16 / 4  |
| Optional HC-SR04 TRIG / ECHO            | 18 / 19 |
| Active-high buzzer                      | 17      |

Buttons and limit switches connect to GND and use INPUT_PULLUP (active LOW). Forward maps to Up; reverse maps to Down. Keep sensor inputs within 3.3 V, including a divider or level shifter for HC-SR04 ECHO. Use a common ground with the motor supply. GPIO17 drives an active-high buzzer intermittently while a motor direction is commanded.

## Upload and connect

1. Open the sketch in Arduino IDE with the ESP32 board package installed. Select your ESP32 board and port.
2. Install U8g2 and ArduinoJson 7. WiFi, WebServer and HTTPClient come with the ESP32 package.
3. Edit config.h for the router credentials and the server PC's LAN address in SERVER_URL. Existing credentials are retained.
4. Upload, then open Serial Monitor at 115200.
5. Connect to the WaterMotor-ESP32 access point using the password configured in `config.h`. Open the dashboard IP printed by Serial Monitor.
6. The ESP32 also joins the configured router and uploads readings to the main dashboard. Both dashboards animate reported forward/reverse movement. The main dashboard needs the server and ESP32 to be reachable over that LAN.

## Control behavior

- Raw water ADC >= 500 sets WET; <= 300 sets DRY. Between these values the previous state holds. Thresholds are configurable in config.h.
- AUTO runs forward when wet and reverse when dry, until the corresponding limit is pressed.
- A held physical button takes priority over a manual web direction or AUTO. Releasing it returns to the selected web mode. Both physical buttons stop movement while held.
- Local web Forward/Reverse requests persist until another local web command. AUTO restores water control. STOP persists and takes priority over buttons until a different web command is selected.
- Both limits pressed stops all movement. A single limit blocks only movement toward it.
- Motor outputs use analogWrite at 255 for the active direction and zero for the other, matching the supplied sketch. Driver enables stay HIGH.
- Ultrasonic distance is monitoring only. Missing echo and displayed height do not inhibit movement. The old maximum-height settings, click-to-toggle buttons and reversal delay are not part of this supplied control logic.

The loop handles local requests, water/buttons/limits, motor output, distance, OLED and serial output, then delays 100 ms. Distance measurement has a 25 ms timeout. A separate task uploads copied snapshots about every second plus HTTP request time; server replies do not command the motor. Network failure does not change local control. No offline upload backlog is stored.

The OLED shows the raw water ADC, calibrated percentage, ultrasonic distance, calculated height, commanded motor direction and limit inputs. `OLED_BASELINE_CM` in `config.h` must match the server's saved baseline for the displayed heights to agree. The full-scale water ADC value is an assumed calibration until measured; the wet/dry thresholds independently control motion.

Before moving a load, check the GPIO32 button wiring, both direction limits and actual motor direction. STOP is a software command; an independent physical power cutoff is still needed for a hardware emergency stop.

Firmware compilation and physical operation must be checked on the ESP32; backend tests do not verify either.
