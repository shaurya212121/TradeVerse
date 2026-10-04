#pragma once
#include <cstdint>
#include <string>
#include <sstream>
#include <iomanip>
// ============================================================================
//  CRC32 — header-only implementation for WAL integrity checking.
//  Uses the standard CRC-32 polynomial (0xEDB88320, reflected).
// ============================================================================
inline uint32_t crc32(const std::string& data) {
    uint32_t crc = 0xFFFFFFFF;
    for (unsigned char c : data) {
        crc ^= c;
        for (int i = 0; i < 8; ++i) {
            if (crc & 1)
                crc = (crc >> 1) ^ 0xEDB88320;
            else
                crc >>= 1;
        }
    }
    return crc ^ 0xFFFFFFFF;
}
inline std::string crc32_hex(const std::string& data) {
    std::ostringstream oss;
    oss << std::uppercase << std::hex << std::setfill('0') << std::setw(8) << crc32(data);
    return oss.str();
}
inline bool verify_crc32(const std::string& payload, const std::string& expected_hex) {
    return crc32_hex(payload) == expected_hex;
}
