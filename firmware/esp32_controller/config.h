#pragma once
// Replace with your 2.4 GHz Wi-Fi credentials and the server computer's LAN IP.
constexpr char WIFI_SSID[] = "";
constexpr char WIFI_PASSWORD[] = "";
constexpr char SERVER_URL[] = "http://192.168.0.113:3000/api/esp";
constexpr int WATER_RAW_EMPTY = 0;
constexpr int WATER_RAW_FULL = 1000; // Assumed; replace with a measured full-scale value.
constexpr float OLED_BASELINE_CM = 10.0f; // Keep aligned with the server baseline.
static_assert(WATER_RAW_FULL > WATER_RAW_EMPTY, "Water calibration must increase");

// Local access point and hysteresis from the working controller.
constexpr char LOCAL_AP_SSID[] = "WaterMotor-ESP32";
constexpr char LOCAL_AP_PASSWORD[] = "CHANGE_ME";
constexpr int WATER_WET_THRESHOLD = 500;
constexpr int WATER_DRY_THRESHOLD = 300;
static_assert(WATER_DRY_THRESHOLD < WATER_WET_THRESHOLD, "Invalid water hysteresis");
