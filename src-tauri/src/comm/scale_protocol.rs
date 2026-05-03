use serde::{Deserialize, Serialize};
use std::fmt;

// ============ 帧常量 ============

const FRAME_HEADER: u8 = 0xAA;
const METHOD_WEIGHT_DATA: u8 = 0x22;
const METHOD_ZERO_CAL: u8 = 0x07;
#[allow(dead_code)]
const METHOD_ZERO_RESPONSE: u8 = 0x08;
const METHOD_WEIGHT_CAL: u8 = 0x09;

// ============ ScaleFrame ============

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScaleFrame {
    pub method: u8,
    pub module_id: u8,
    pub ad_code: i32,
    pub weight_mg: i64,
    pub status: u8,
    pub timestamp: u16,
}

// ============ ScaleData ============

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScaleData {
    pub weight_mg: i64,
    pub weight_g: f64,
    pub weight_n: f64,
    pub ad_code: i32,
    pub status: u8,
    pub timestamp: u16,
}

impl From<ScaleFrame> for ScaleData {
    fn from(frame: ScaleFrame) -> Self {
        let weight_g = frame.weight_mg as f64 / 1000.0;
        let weight_n = (frame.weight_mg as f64 / 1_000_000.0) * 9.80665;
        Self {
            weight_mg: frame.weight_mg,
            weight_g,
            weight_n,
            ad_code: frame.ad_code,
            status: frame.status,
            timestamp: frame.timestamp,
        }
    }
}

// ============ ScaleError ============

#[derive(Debug)]
pub enum ScaleError {
    InvalidHeader,
    InsufficientData,
    ChecksumError,
    UnknownMethod(u8),
}

impl fmt::Display for ScaleError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ScaleError::InvalidHeader => write!(f, "无效帧头（期望 0xAA）"),
            ScaleError::InsufficientData => write!(f, "数据长度不足"),
            ScaleError::ChecksumError => write!(f, "XOR 校验失败"),
            ScaleError::UnknownMethod(m) => write!(f, "未知方法号: 0x{:02X}", m),
        }
    }
}

// ============ 公共函数 ============

/// 计算帧 XOR 校验：对除校验字节本身之外的所有字节进行异或
fn calculate_xor(data: &[u8]) -> u8 {
    // 校验字节位于索引 4（第 5 个字节）
    let mut xor: u8 = 0;
    for (i, &b) in data.iter().enumerate() {
        if i == 4 {
            continue; // 跳过校验字节本身
        }
        xor ^= b;
    }
    xor
}

/// 解析称重模块上报帧
///
/// 帧格式（23 字节）：
/// AA 03 01 [总长度] [XOR] [参数长度] [方法号] [模块ID]
/// [AD内码4B] [重量8B] [状态1B] [时间戳2B]
pub fn parse_scale_frame(data: &[u8]) -> Result<ScaleFrame, ScaleError> {
    if data.len() < 8 {
        return Err(ScaleError::InsufficientData);
    }

    // 检查帧头
    if data[0] != FRAME_HEADER {
        return Err(ScaleError::InvalidHeader);
    }

    // 总长度字段
    let total_len = data[3] as usize;
    if data.len() < total_len {
        return Err(ScaleError::InsufficientData);
    }

    // XOR 校验
    let expected_xor = data[4];
    let calculated_xor = calculate_xor(&data[..total_len]);
    if expected_xor != calculated_xor {
        return Err(ScaleError::ChecksumError);
    }

    // 方法号
    let method = data[6];
    if method != METHOD_WEIGHT_DATA {
        return Err(ScaleError::UnknownMethod(method));
    }

    // 确保数据足够解析完整的重量数据帧
    if data.len() < 23 {
        return Err(ScaleError::InsufficientData);
    }

    let module_id = data[7];

    // AD 内码：4 字节大端序（索引 8..12）
    let ad_code = i32::from_be_bytes([data[8], data[9], data[10], data[11]]);

    // 重量数据：8 字节大端序（索引 12..20），单位 mg
    let weight_mg = i64::from_be_bytes([
        data[12], data[13], data[14], data[15],
        data[16], data[17], data[18], data[19],
    ]);

    // 状态：1 字节（索引 20）
    let status = data[20];

    // 时间戳：2 字节（索引 21..23）
    let timestamp = u16::from_be_bytes([data[21], data[22]]);

    Ok(ScaleFrame {
        method,
        module_id,
        ad_code,
        weight_mg,
        status,
        timestamp,
    })
}

/// 构建零点校准命令
///
/// 发送帧: AA 01 03 08 A6 01 07 00
pub fn build_zero_command() -> Vec<u8> {
    let mut cmd = vec![
        FRAME_HEADER, // 帧头
        0x01,         // 目的地址
        0x03,         // 源地址
        0x08,         // 总长度
        0x00,         // XOR 校验（占位）
        0x01,         // 参数长度
        METHOD_ZERO_CAL, // 方法号 0x07
        0x00,         // 参数
    ];
    cmd[4] = calculate_xor(&cmd);
    cmd
}

/// 构建砝码标定命令
///
/// 帧格式: AA 01 03 0C [XOR] 05 09 00 00 00 [重量4字节大端]
pub fn build_calibrate_command(weight_g: u32) -> Vec<u8> {
    let weight_bytes = weight_g.to_be_bytes();
    let mut cmd = vec![
        FRAME_HEADER,     // 帧头
        0x01,             // 目的地址
        0x03,             // 源地址
        0x0C,             // 总长度 12
        0x00,             // XOR 校验（占位）
        0x05,             // 参数长度
        METHOD_WEIGHT_CAL, // 方法号 0x09
        0x00,             // 模块ID
        0x00,
        0x00,
        weight_bytes[2],  // 重量高字节（单位g，取低2字节）
        weight_bytes[3],  // 重量低字节
    ];
    cmd[4] = calculate_xor(&cmd);
    cmd
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_zero_command() {
        let cmd = build_zero_command();
        assert_eq!(cmd[0], FRAME_HEADER);
        assert_eq!(cmd[6], METHOD_ZERO_CAL);
        assert_eq!(cmd.len(), 8);
        // 验证 XOR 校验正确
        assert_eq!(cmd[4], calculate_xor(&cmd));
    }

    #[test]
    fn test_build_calibrate_command_500g() {
        let cmd = build_calibrate_command(500);
        assert_eq!(cmd[0], FRAME_HEADER);
        assert_eq!(cmd[6], METHOD_WEIGHT_CAL);
        assert_eq!(cmd.len(), 12);
        // 500 = 0x01F4
        assert_eq!(cmd[10], 0x01);
        assert_eq!(cmd[11], 0xF4);
        assert_eq!(cmd[4], calculate_xor(&cmd));
    }

    #[test]
    fn test_scale_data_conversion() {
        let frame = ScaleFrame {
            method: METHOD_WEIGHT_DATA,
            module_id: 0x01,
            ad_code: 100000,
            weight_mg: 500_000, // 500g = 500000mg
            status: 0x01,
            timestamp: 1000,
        };
        let data: ScaleData = frame.into();
        assert_eq!(data.weight_mg, 500_000);
        assert!((data.weight_g - 500.0).abs() < f64::EPSILON);
        // 0.5kg * 9.80665 = 4.903325 N
        assert!((data.weight_n - 4.903325).abs() < 0.0001);
    }
}
