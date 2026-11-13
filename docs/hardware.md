# Hardware integration

Controller firmware is not included. The dashboard accepts telemetry from an ESP32 or another HTTP-capable controller.

See the [setup guide](../README.md#6-connect-ultrasonic-and-water-sensors) for mounting and calibration, and the [API reference](api.md) for telemetry and configuration fields. Send POST /api/esp every 2–5 seconds.

Implement local travel limits, emergency stop, limit switches, and sensor failure handling before operating a physical lift. The controller must enforce its own motor interlocks. Dashboard feedback never directly controls the motor.

## Direction-aware control

Read liftCommand and commandExpiresAt from each /api/esp response. Support auto, up, down, and stop; do not treat every running command as Up. Motor drivers must stop before changing direction and enforce physical upper/lower limit switches. Report motorDirection (up/down/stopped) with motorActive in telemetry.

Do not continue indefinitely with a cached command: enforce both the UTC expiry and a local maximum 15-second movement window. A local communication watchdog must stop the motor if polling fails, including network errors or HTTP 503 responses. Dashboard commands take effect only when the controller polls; Stop is not a hardwired emergency stop. Older firmware using manualState alone does not support Down.
