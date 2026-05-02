use serde::{Deserialize, Serialize};

// ============ 下行命令 ============

#[allow(dead_code)]
pub enum Command {
    Auth { key: String, attempt: u8 },
    Heartbeat,
    Ack { seq: u32 },
    StartHoming,
    EmergencyStop,
    Reset,
    Position { pulses: i64 },
    JogPlus,
    JogMinus,
    JogStop,
    RelayOn { channel: u8 },
    RelayOff { channel: u8 },
    RelayAllOff,
    ReadInput,
    StopIoTest,
    SetParams { params: String },
}

impl Command {
    /// 序列化为协议帧（不含末尾 \n，由发送层追加）
    pub fn to_frame(&self) -> String {
        match self {
            Command::Auth { key, attempt } => format!("AUTH:{}:{}", key, attempt),
            Command::Heartbeat => "HEARTBEAT".to_string(),
            Command::Ack { seq } => format!("ACK:{}", seq),
            Command::StartHoming => "START_HOMING".to_string(),
            Command::EmergencyStop => "EMERGENCY_STOP".to_string(),
            Command::Reset => "RESET".to_string(),
            Command::Position { pulses } => format!("POSITION:Value{}", pulses),
            Command::JogPlus => "JOG+".to_string(),
            Command::JogMinus => "JOG-".to_string(),
            Command::JogStop => "JOG_STOP".to_string(),
            Command::RelayOn { channel } => format!("RELAY_ON:{}", channel),
            Command::RelayOff { channel } => format!("RELAY_OFF:{}", channel),
            Command::RelayAllOff => "RELAY_ALL_OFF".to_string(),
            Command::ReadInput => "READ_INPUT".to_string(),
            Command::StopIoTest => "STOP_IO_TEST".to_string(),
            Command::SetParams { params } => format!("SET_PARAMS:{}", params),
        }
    }
}

// ============ 上行消息 ============

#[derive(Debug, Clone)]
pub enum Response {
    AuthOk,
    AuthFail,
    HeartbeatResponse,
    Status(DeviceStatus),
    ServoStatus { position: i64 },
    InputStatus { inputs: [bool; 4] },
    Sensor { values: [bool; 4] },
    Unknown(String),
}

impl Response {
    /// 解析一行上行消息
    pub fn parse(line: &str) -> Response {
        let trimmed = line.trim();

        if trimmed == "AUTH_OK" {
            return Response::AuthOk;
        }
        if trimmed == "AUTH_FAIL" {
            return Response::AuthFail;
        }
        if trimmed.contains("HEARTBEAT_RESPONSE") {
            return Response::HeartbeatResponse;
        }
        if trimmed.starts_with("STATUS:") {
            return Self::parse_status(trimmed);
        }
        if trimmed.starts_with("SERVO_STATUS:") {
            let val = trimmed.strip_prefix("SERVO_STATUS:").unwrap_or("0");
            let position = val.trim().parse::<i64>().unwrap_or(0);
            return Response::ServoStatus { position };
        }
        if trimmed.starts_with("INPUT_STATUS:") {
            let data = trimmed.strip_prefix("INPUT_STATUS:").unwrap_or("");
            return Response::InputStatus {
                inputs: parse_bool_array(data, ':'),
            };
        }
        if trimmed.starts_with("SENSOR,") || trimmed.starts_with("SENSOR:") {
            let data = &trimmed[7..]; // skip "SENSOR," or "SENSOR:"
            return Response::Sensor {
                values: parse_bool_array(data, ','),
            };
        }

        Response::Unknown(trimmed.to_string())
    }

    fn parse_status(line: &str) -> Response {
        // 剥离 CRC 校验
        let data_part = line.split("CRC:").next().unwrap_or(line);
        let payload = data_part.strip_prefix("STATUS:").unwrap_or(data_part);
        let fields: Vec<&str> = payload.split(',').collect();

        if fields.len() < 16 {
            return Response::Unknown(line.to_string());
        }

        let parse_i32 = |idx: usize| -> i32 {
            fields.get(idx).and_then(|s| s.trim().parse().ok()).unwrap_or(0)
        };
        let parse_u32 = |idx: usize| -> u32 {
            let s = fields.get(idx).map(|s| s.trim()).unwrap_or("0");
            // 支持 0x 十六进制
            if s.starts_with("0x") || s.starts_with("0X") {
                u32::from_str_radix(&s[2..], 16).unwrap_or(0)
            } else {
                s.parse().unwrap_or(0)
            }
        };
        let parse_i64 = |idx: usize| -> i64 {
            fields.get(idx).and_then(|s| s.trim().parse().ok()).unwrap_or(0)
        };
        let parse_f64 = |idx: usize| -> f64 {
            fields.get(idx).and_then(|s| s.trim().parse().ok()).unwrap_or(0.0)
        };

        let status = DeviceStatus {
            seq: parse_u32(0),
            inputs: [parse_i32(1), parse_i32(2), parse_i32(3), parse_i32(4)],
            status_word: parse_u32(5),
            modbus_data2: parse_i32(6),
            modbus_data3: parse_i32(7),
            speed: parse_i32(8),
            error_code: parse_u32(9),
            position: parse_i64(10),
            homing_status: parse_i32(11),
            modbus_connected: parse_i32(12) == 1,
            modbus_errors: parse_i32(13),
            press_status: parse_i32(14),
            fix_status: parse_i32(15),
            pr_status: if fields.len() > 16 { parse_i32(16) } else { 0 },
            incline_x: if fields.len() > 17 { parse_f64(17) } else { 0.0 },
            incline_y: if fields.len() > 18 { parse_f64(18) } else { 0.0 },
        };

        Response::Status(status)
    }
}

fn parse_bool_array(data: &str, _sep: char) -> [bool; 4] {
    let parts: Vec<&str> = data.split(',').collect();
    let mut result = [false; 4];
    for (i, part) in parts.iter().enumerate().take(4) {
        // 0 = ON (有信号), 1 = OFF (无信号)
        result[i] = part.trim().parse::<i32>().unwrap_or(1) == 0;
    }
    result
}

// ============ DeviceStatus ============

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceStatus {
    pub seq: u32,
    pub inputs: [i32; 4],
    pub status_word: u32,
    pub modbus_data2: i32,
    pub modbus_data3: i32,
    pub speed: i32,
    pub error_code: u32,
    pub position: i64,
    pub homing_status: i32,
    pub modbus_connected: bool,
    pub modbus_errors: i32,
    pub press_status: i32,
    pub fix_status: i32,
    pub pr_status: i32,
    pub incline_x: f64,
    pub incline_y: f64,
}

#[allow(dead_code)]
impl DeviceStatus {
    /// 伺服 ON 状态 (Bit1, 0x0002)
    pub fn is_servo_on(&self) -> bool {
        (self.status_word & 0x0002) != 0
    }

    /// 伺服报警 (Bit6, 0x0040)
    pub fn has_alarm(&self) -> bool {
        (self.status_word & 0x0040) != 0
    }

    /// 有错误
    pub fn has_error(&self) -> bool {
        self.error_code != 0
    }

    /// 调平完成
    pub fn is_homing_complete(&self) -> bool {
        self.homing_status == 2
    }

    /// 伺服运行中（调平中 或 PR 执行中/停止中）
    pub fn is_moving(&self) -> bool {
        self.homing_status == 1
            || (self.pr_status >= 1 && self.pr_status <= 99)
            || self.pr_status == 1000
    }

    /// PR 状态显示文本
    pub fn pr_display_text(&self) -> String {
        match self.pr_status {
            0 => "空闲".to_string(),
            1..=99 => format!("执行中(PR#{})", self.pr_status),
            1000 => "停止中".to_string(),
            10000..=19999 => format!("已发(PR#{})", self.pr_status - 10000),
            n if n >= 20000 => format!("到位(PR#{})", self.pr_status - 20000),
            _ => format!("未知({})", self.pr_status),
        }
    }
}

// ============ ServoParams ============

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServoParams {
    pub control_mode: i32,
    pub feedback_mode: i32,
    pub lead_screw: f64,
    pub encoder_resolution: i32,
    pub max_speed: i32,
    pub acceleration: i32,
    pub position_gain: f64,
    pub speed_gain: f64,
    pub torque_gain: f64,
    pub speed_feed_forward: f64,
    pub position_feed_forward: f64,
    pub friction_compensation: f64,
    pub dead_band_compensation: f64,
    pub home_offset: f64,
}

impl ServoParams {
    /// 转为 SET_PARAMS 的参数字符串
    pub fn to_command_string(&self) -> String {
        format!(
            "ControlMode={},FeedbackMode={},LeadScrew={},EncoderResolution={},\
             MaxSpeed={},Acceleration={},PositionGain={},SpeedGain={},\
             TorqueGain={},SpeedFeedForward={},PositionFeedForward={},\
             FrictionCompensation={},DeadBandCompensation={},HomeOffset={}",
            self.control_mode,
            self.feedback_mode,
            self.lead_screw,
            self.encoder_resolution,
            self.max_speed,
            self.acceleration,
            self.position_gain,
            self.speed_gain,
            self.torque_gain,
            self.speed_feed_forward,
            self.position_feed_forward,
            self.friction_compensation,
            self.dead_band_compensation,
            self.home_offset,
        )
    }
}
