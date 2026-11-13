#pragma once
// Replace with your 2.4 GHz Wi-Fi credentials and the server computer's LAN IP.
constexpr char WIFI_SSID[] = "YOUR_WIFI_NAME";
constexpr char WIFI_PASSWORD[] = "YOUR_WIFI_PASSWORD";
constexpr char SERVER_URL[] = "http://192.168.1.100:3000/api/esp";
constexpr int WATER_RAW_EMPTY = 100;
constexpr int WATER_RAW_FULL = 1100;
constexpr int MOTOR_RUN_PWM = 700; // 10-bit PWM: 0-1023
static_assert(WATER_RAW_FULL > WATER_RAW_EMPTY, "Water calibration must increase");
static_assert(MOTOR_RUN_PWM > 0 && MOTOR_RUN_PWM <= 1023, "Invalid PWM");
