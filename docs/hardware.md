# ESP32 hardware and firmware

The Arduino sketch is [esp32_controller.ino](../firmware/esp32_controller/esp32_controller.ino). Movement comes from the dashboard, automatic mode, or physical Up/Down buttons.

## Wiring

| Component                                      | GPIO    |
| ---------------------------------------------- | ------- |
| SH1106 OLED SDA / SCL                          | 21 / 22 |
| Water sensor analog output                     | 34      |
| BTS7960 RPWM / LPWM                            | 25 / 26 |
| BTS7960 R_EN / L_EN                            | 27 / 14 |
| HC-SR04 TRIG / ECHO                            | 18 / 19 |
| Active-high buzzer                             | 23      |
| Up pushbutton                                  | 15      |
| Down pushbutton                                | 33      |
| Forward (upper) limit / backward (lower) limit | 16 / 4  |

Connect normally-open limit switches between their GPIO and GND (INPUT_PULLUP, active LOW). Forward blocks Up; backward blocks Down; both pressed block all motion. Assertion is checked immediately without software debounce. Reduce the HC-SR04's 5 V ECHO signal to 3.3 V using a level shifter or divider (for example 1 kOhm from ECHO to GPIO and 2 kOhm from GPIO to GND). Water AO must also stay within 3.3 V. Use separate motor power with common GND. Use a suitable driver for a buzzer that exceeds GPIO current limits.

## Flash and connect

Wire each direction button between its GPIO and GND (`INPUT_PULLUP`, active LOW). **GPIO20 is unavailable on ESP32-WROOM-32**, so Down uses **GPIO33** instead. Use GPIO labels rather than the physical pin position. GPIO15 is a strapping pin: release Up during reset/power-up. See [Espressif's GPIO table](https://docs.espressif.com/projects/esp-idf/en/release-v4.4/esp32/api-reference/peripherals/gpio.html).

Physical buttons are debounced for 25 ms and require release after boot before accepting a press. Click Up/Down to start, click the same direction again to stop; holding a button does not repeat clicks. Pressing both stops immediately and requires releasing both before another command. Direction changes retain the 150 ms motor dead time. A physical override remains until another button action or a new dashboard command; a physical Stop returns to server/automatic control when the wet/dry sensor state changes. Server connectivity, valid distance readings, maximum height and travel limits still apply. Physical buttons do not bypass the communication watchdog or provide offline movement.

1. Install the Espressif ESP32 **3.x** board package in Arduino IDE. Select **ESP32 Dev Module** for ESP32-WROOM-32 and its USB serial port.
2. Install **U8g2** and **ArduinoJson 7** from Library Manager. WiFi and HTTPClient come with the ESP32 package; HX711 is not used.
3. Open `firmware/esp32_controller/esp32_controller.ino`. Edit the adjacent `config.h`: Wi-Fi name/password and `SERVER_URL`. Use the server PC's LAN IPv4 from `ipconfig`, such as `http://192.168.1.25:3000/api/esp`; localhost points to the ESP32 itself. Credentials remain in this file, so do not commit real passwords.
4. Run `npm install` and `npm start` on the PC. Keep PC and ESP32 on the same trusted LAN with a 2.4 GHz Wi-Fi network for the ESP32. Allow the server port through Windows Firewall on the private network.
5. Upload the sketch. Open Serial Monitor at **115200**. OLED should show `Server: OK`, and the dashboard should show actual sensor readings.
6. Calibrate `WATER_RAW_EMPTY` and `WATER_RAW_FULL` using the raw values printed in Serial Monitor, then upload again. Set ground baseline and maximum height in dashboard settings. The ultrasonic sensor must face a fixed ground reference; measured height is `max(0, distanceCm - baselineCm)`.
7. With motor power disconnected, verify both limit inputs and sensor readings. Then test movement with low load. Up maps to RPWM/forward; Down maps to LPWM/reverse. Confirm actual direction and the matching travel limit before operating the mechanism. Set a lower `MOTOR_RUN_PWM` for initial tests if appropriate.

## Control behavior

The firmware POSTs telemetry approximately every second plus request time. It reports water percentage, distance (null when no echo), actual motor activity and direction. HTTP runs in a separate FreeRTOS task so limit checks and motor control continue during network requests.

Dashboard Up/Down/Stop uses `liftCommand`. Movement has no duration limit. Click the active direction again or Stop to halt. Stop takes effect on the next successful poll. `commandExpiresAt` and `commandRemainingMs` are null.

Automatic mode raises when calibrated water percentage is greater than 0 and lowers at 0. Dry readings snap to zero instead of retaining a filtering residue. startLevel/stopLevel are retained for configuration compatibility but no longer select movement. A manual Stop holds until the wet/dry state changes; repeated readings do not restart it. A zero reading after a wet Stop returns to automatic lowering. Upper/lower switches stop travel in their respective directions. Unknown ultrasonic distance stops either direction; maximum calibrated height blocks Up while permitting Down.

There is no local 15-second movement timer. Travel limits stop the motor locally; a matching manual command becomes Stop at the server. A network/HTTP/JSON error stops on receipt; absence of a valid response for 3.5 seconds or Wi-Fi loss also stops. Boot and PWM initialization failure leave driver enables LOW.

This prototype expects one controller on a trusted LAN; it has no device authentication. Physical limit switches, motor power cutoff and emergency stop remain necessary: the dashboard Stop requires networking, and electrical stopping does not remove mechanical momentum. Normally-open switches cannot detect a broken wire; use an independent hardware cutoff for the mechanism.

Firmware API references: [Espressif LEDC](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/ledc.html) and [ArduinoJson 7 parsing](https://arduinojson.org/v7/api/json/deserializejson/).

### Run the ESP32 API demo

Run `npm run demo:esp` (PowerShell: `npm.cmd run demo:esp`). It starts an isolated temporary server and simulates ESP32 telemetry plus dashboard commands. It verifies live dashboard broadcasts, Up/Down/Stop, toggle-to-stop, invalid payloads, storage failure handling, and history after restart. It runs in a few seconds, uses simulated weather, and removes its temporary data afterward. It never sends movement commands to your normal server or hardware. Passing this demo verifies the software protocol; physical board connectivity and motor interlocks must still be tested on the ESP32.
