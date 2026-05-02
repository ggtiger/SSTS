#!/usr/bin/env node
/**
 * SSTS 模拟下位机 TCP Server
 * 用于开发调试，模拟下位机所有通信协议行为
 * 纯 Node.js 实现，仅使用 net 模块
 */

const net = require('net');

// ─── ANSI 颜色 ───────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
  bgYellow: '\x1b[43m',
};

// ─── 配置 ────────────────────────────────────────────────
const HOST = '0.0.0.0';
const DEFAULT_PORT = 10001;
const AUTH_KEY = 'YourSecureAuthenticationKey123';
const STATUS_INTERVAL = 500;

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  let port = DEFAULT_PORT;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      port = parseInt(args[i + 1], 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        console.error(`${C.red}无效端口号: ${args[i + 1]}${C.reset}`);
        process.exit(1);
      }
    }
  }
  return { port };
}

// ─── 时间戳 ──────────────────────────────────────────────
function ts() {
  const now = new Date();
  return `${C.gray}[${now.toLocaleTimeString('zh-CN', { hour12: false })}]${C.reset}`;
}

function log(msg) {
  console.log(`${ts()} ${msg}`);
}

function logRX(clientId, msg) {
  log(`${C.cyan}📥 RX [${clientId}]:${C.reset} ${msg}`);
}

function logTX(clientId, msg) {
  log(`${C.magenta}📤 TX [${clientId}]:${C.reset} ${msg}`);
}

// ─── 创建客户端状态 ──────────────────────────────────────
function createClientState() {
  return {
    authenticated: false,
    servoOn: true,
    position: 0,
    targetPosition: 0,
    speed: 0,
    homingStatus: 0,
    prStatus: 0,
    errorCode: 0,
    statusWord: 0x0002,
    inputs: [0, 1, 0, 1],
    relays: [false, false, false, false],
    modbusConnected: 1,
    modbusErrors: 0,
    pressStatus: 0,
    fixStatus: 0,
    inclineX: 0.15,
    inclineY: -0.08,
    seqCounter: 0,
    jogDirection: null,
  };
}

// ─── 构建 STATUS 消息 ────────────────────────────────────
function buildStatusMessage(state) {
  state.seqCounter++;

  // JOG 模拟运动
  if (state.jogDirection === '+') {
    state.position += 500;
    state.speed = 500;
  } else if (state.jogDirection === '-') {
    state.position -= 500;
    state.speed = 500;
  }

  // POSITION 命令模拟运动
  if (state.prStatus >= 1 && state.prStatus <= 99) {
    const diff = state.targetPosition - state.position;
    if (Math.abs(diff) <= 1000) {
      state.position = state.targetPosition;
      state.prStatus = 20001; // 到位 (PR#1)
      state.speed = 0;
    } else {
      const step = diff > 0 ? 1000 : -1000;
      state.position += step;
      state.speed = Math.abs(step);
    }
  }

  // 水平仪微小波动
  state.inclineX = +(0.15 + (Math.random() - 0.5) * 0.02).toFixed(3);
  state.inclineY = +(-0.08 + (Math.random() - 0.5) * 0.02).toFixed(3);

  const fields = [
    state.seqCounter,
    state.inputs[0],
    state.inputs[1],
    state.inputs[2],
    state.inputs[3],
    state.statusWord,
    0, // mb2
    0, // mb3
    state.speed,
    state.errorCode,
    state.position,
    state.homingStatus,
    state.modbusConnected,
    state.modbusErrors,
    state.pressStatus,
    state.fixStatus,
    state.prStatus,
    state.inclineX,
    state.inclineY,
  ];

  return `STATUS:${fields.join(',')}\n`;
}

// ─── 命令处理 ────────────────────────────────────────────
function handleCommand(line, socket, clientCtx) {
  const { state, clientId, statusTimer } = clientCtx;
  const trimmed = line.trim();
  if (!trimmed) return;

  logRX(clientId, trimmed);

  // AUTH
  if (trimmed.startsWith('AUTH:')) {
    const parts = trimmed.split(':');
    const key = parts[1];
    const attempt = parts[2] || '?';
    if (key === AUTH_KEY) {
      state.authenticated = true;
      send(socket, clientId, 'AUTH_OK\n');
      log(`${C.green}🔓 [${clientId}] 认证成功 (attempt=${attempt})${C.reset}`);
      // 启动 STATUS 周期上推
      startStatusBroadcast(socket, clientCtx);
    } else {
      send(socket, clientId, 'AUTH_FAIL\n');
      log(`${C.red}🔒 [${clientId}] 认证失败 (attempt=${attempt})${C.reset}`);
    }
    return;
  }

  // HEARTBEAT
  if (trimmed === 'HEARTBEAT') {
    send(socket, clientId, 'HEARTBEAT_RESPONSE\n');
    return;
  }

  // ACK
  if (trimmed.startsWith('ACK:')) {
    const seq = trimmed.split(':')[1];
    log(`${C.dim}   [${clientId}] ACK seq=${seq} (已忽略)${C.reset}`);
    return;
  }

  // 以下命令需要认证
  if (!state.authenticated) {
    log(`${C.yellow}⚠️  [${clientId}] 未认证，忽略命令: ${trimmed}${C.reset}`);
    return;
  }

  // START_HOMING
  if (trimmed === 'START_HOMING') {
    state.homingStatus = 1;
    log(`${C.blue}[HOMING] Started${C.reset}`);
    setTimeout(() => {
      state.homingStatus = 2;
      state.position = 0;
      log(`${C.green}[HOMING] Completed (position reset to 0)${C.reset}`);
    }, 3000);
    return;
  }

  // EMERGENCY_STOP
  if (trimmed === 'EMERGENCY_STOP') {
    state.jogDirection = null;
    state.prStatus = 0;
    state.speed = 0;
    log(`${C.red}${C.bold}[E-STOP] Emergency stop activated${C.reset}`);
    return;
  }

  // RESET
  if (trimmed === 'RESET') {
    state.errorCode = 0;
    state.statusWord = 0x0002;
    log(`${C.yellow}[RESET] System reset${C.reset}`);
    return;
  }

  // POSITION:Value{N}
  if (trimmed.startsWith('POSITION:Value')) {
    const n = parseInt(trimmed.replace('POSITION:Value', ''), 10);
    if (!isNaN(n)) {
      state.targetPosition = n;
      state.prStatus = 1;
      log(`${C.blue}[MOVE] Moving to ${n} pulses (${n / 1000}°)${C.reset}`);
    }
    return;
  }

  // JOG+
  if (trimmed === 'JOG+') {
    state.jogDirection = '+';
    state.speed = 500;
    log(`${C.blue}[JOG] + started${C.reset}`);
    return;
  }

  // JOG-
  if (trimmed === 'JOG-') {
    state.jogDirection = '-';
    state.speed = 500;
    log(`${C.blue}[JOG] - started${C.reset}`);
    return;
  }

  // JOG_STOP
  if (trimmed === 'JOG_STOP') {
    state.jogDirection = null;
    state.speed = 0;
    log(`${C.blue}[JOG] Stopped${C.reset}`);
    return;
  }

  // RELAY_ON:{N}
  if (trimmed.startsWith('RELAY_ON:')) {
    const n = parseInt(trimmed.split(':')[1], 10);
    if (n >= 1 && n <= 4) {
      state.relays[n - 1] = true;
      log(`${C.green}[IO] Relay ${n} ON${C.reset}`);
    }
    return;
  }

  // RELAY_OFF:{N}
  if (trimmed.startsWith('RELAY_OFF:')) {
    const n = parseInt(trimmed.split(':')[1], 10);
    if (n >= 1 && n <= 4) {
      state.relays[n - 1] = false;
      log(`${C.yellow}[IO] Relay ${n} OFF${C.reset}`);
    }
    return;
  }

  // RELAY_ALL_OFF
  if (trimmed === 'RELAY_ALL_OFF') {
    state.relays = [false, false, false, false];
    log(`${C.yellow}[IO] All relays OFF${C.reset}`);
    return;
  }

  // READ_INPUT
  if (trimmed === 'READ_INPUT') {
    // 随机变化一个输入值（模拟真实传感器波动）
    const idx = Math.floor(Math.random() * 4);
    state.inputs[idx] = state.inputs[idx] === 0 ? 1 : 0;
    const resp = `INPUT_STATUS:${state.inputs.join(',')}\n`;
    send(socket, clientId, resp);
    return;
  }

  // STOP_IO_TEST
  if (trimmed === 'STOP_IO_TEST') {
    log(`${C.yellow}[IO] IO test stopped${C.reset}`);
    return;
  }

  // SET_PARAMS
  if (trimmed.startsWith('SET_PARAMS:')) {
    const params = trimmed.substring('SET_PARAMS:'.length);
    log(`${C.magenta}[PARAMS] Received: ${params}${C.reset}`);
    return;
  }

  // 未知命令
  log(`${C.yellow}⚠️  [${clientId}] 未知命令: ${trimmed}${C.reset}`);
}

// ─── 发送辅助 ────────────────────────────────────────────
function send(socket, clientId, data) {
  if (socket.writable) {
    socket.write(data);
    logTX(clientId, data.trim());
  }
}

// ─── STATUS 广播 ─────────────────────────────────────────
function startStatusBroadcast(socket, clientCtx) {
  if (clientCtx.statusTimer) return; // 已启动
  log(`${C.green}🔄 [${clientCtx.clientId}] STATUS broadcasting started (${STATUS_INTERVAL}ms interval)${C.reset}`);
  clientCtx.statusTimer = setInterval(() => {
    if (socket.writable) {
      const msg = buildStatusMessage(clientCtx.state);
      socket.write(msg);
      // STATUS 消息频繁，不逐条打印 TX 日志，仅每 20 条打印一次
      if (clientCtx.state.seqCounter % 20 === 0) {
        logTX(clientCtx.clientId, `STATUS:${clientCtx.state.seqCounter},... (seq=${clientCtx.state.seqCounter})`);
      }
    }
  }, STATUS_INTERVAL);
}

// ─── 服务器 ──────────────────────────────────────────────
const { port } = parseArgs();
let clientCounter = 0;

const server = net.createServer((socket) => {
  clientCounter++;
  const clientId = `C${clientCounter}`;
  const addr = `${socket.remoteAddress}:${socket.remotePort}`;

  const clientCtx = {
    clientId,
    state: createClientState(),
    statusTimer: null,
    buffer: '',
  };

  log(`${C.green}🔌 [${clientId}] 客户端已连接: ${addr}${C.reset}`);

  socket.setNoDelay(true);

  socket.on('data', (data) => {
    clientCtx.buffer += data.toString('utf-8');
    // 按 \n 分行处理
    const lines = clientCtx.buffer.split('\n');
    // 最后一段可能是不完整帧，保留在 buffer
    clientCtx.buffer = lines.pop() || '';
    for (const line of lines) {
      const cleaned = line.replace(/\r$/, '');
      if (cleaned) {
        handleCommand(cleaned, socket, clientCtx);
      }
    }
  });

  socket.on('close', () => {
    if (clientCtx.statusTimer) {
      clearInterval(clientCtx.statusTimer);
      clientCtx.statusTimer = null;
    }
    log(`${C.yellow}🔌 [${clientId}] 客户端已断开: ${addr}${C.reset}`);
  });

  socket.on('error', (err) => {
    if (clientCtx.statusTimer) {
      clearInterval(clientCtx.statusTimer);
      clientCtx.statusTimer = null;
    }
    log(`${C.red}❌ [${clientId}] Socket 错误: ${err.message}${C.reset}`);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n${C.red}${C.bold}❌ 端口 ${port} 已被占用，请使用 --port 指定其他端口${C.reset}\n`);
  } else {
    console.error(`\n${C.red}❌ 服务器错误: ${err.message}${C.reset}\n`);
  }
  process.exit(1);
});

server.listen(port, HOST, () => {
  console.log(`
${C.bold}═══════════════════════════════════════════${C.reset}
${C.bold}  ${C.green}SSTS 模拟下位机服务器${C.reset}
${C.bold}  监听: ${C.cyan}${HOST}:${port}${C.reset}
${C.bold}  认证密钥: ${C.yellow}${AUTH_KEY}${C.reset}
${C.bold}  STATUS 上推间隔: ${C.cyan}${STATUS_INTERVAL}ms${C.reset}
${C.bold}═══════════════════════════════════════════${C.reset}
${C.dim}  用法: 在调试页面连接 127.0.0.1:${port}${C.reset}
${C.bold}═══════════════════════════════════════════${C.reset}
`);
  log(`${C.green}🟢 Mock Device Server started on ${HOST}:${port}${C.reset}`);
});

// 优雅关闭
process.on('SIGINT', () => {
  log(`${C.yellow}⏹️  正在关闭服务器...${C.reset}`);
  server.close(() => {
    log(`${C.green}✅ 服务器已关闭${C.reset}`);
    process.exit(0);
  });
});
