'use client';

declare global {
  interface Window {
    __TAURI__?: Record<string, unknown>;
  }
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { DeviceState, LogEntry } from './types';
import { DEFAULT_DEVICE_STATE } from './types';
import * as DeviceService from './device-service';

const MAX_LOG_ENTRIES = 500;

export function useDevice() {
  const [state, setState] = useState<DeviceState>(DEFAULT_DEVICE_STATE);
  const [debugLog, setDebugLog] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const unlistenRefs = useRef<UnlistenFn[]>([]);

  useEffect(() => {
    let mounted = true;

    const setup = async () => {
      try {
        // 监听状态变更事件
        const unlistenState = await listen<DeviceState>('device-state-changed', (event) => {
          if (mounted) setState(event.payload);
        });

        // 监听调试日志事件
        const unlistenLog = await listen<LogEntry>('device-debug-log', (event) => {
          if (mounted) {
            setDebugLog(prev => {
              const next = [...prev, event.payload];
              return next.length > MAX_LOG_ENTRIES ? next.slice(-MAX_LOG_ENTRIES) : next;
            });
          }
        });

        unlistenRefs.current = [unlistenState, unlistenLog];

        // 获取初始状态
        const initialState = await DeviceService.getState().catch(() => DEFAULT_DEVICE_STATE);
        if (mounted) setState(initialState);
      } catch (e) {
        // 非 Tauri 环境（浏览器中访问）静默降级
        if (typeof window !== 'undefined' && !window.__TAURI__) {
          console.warn('[useDevice] Not in Tauri environment, using mock state');
        } else {
          console.error('[useDevice] Setup error:', e);
        }
      }
    };

    setup();

    return () => {
      mounted = false;
      unlistenRefs.current.forEach(fn => fn());
    };
  }, []);

  // 包装所有 action 添加统一错误处理
  const withErrorHandling = useCallback(<T extends (...args: any[]) => Promise<void>>(fn: T) => {
    return (async (...args: Parameters<T>) => {
      try {
        setError(null);
        await fn(...args);
      } catch (e: any) {
        // 处理各种错误类型，包括 Event 对象
        let msg = '操作失败';
        if (typeof e === 'string') {
          msg = e;
        } else if (e?.message) {
          msg = e.message;
        } else if (e?.type && e?.target) {
          // Event 对象（如 ErrorEvent）
          msg = `事件错误: ${e.type}`;
          if (e.target?.src || e.target?.href) {
            msg += ` - ${e.target.src || e.target.href}`;
          }
        } else if (e?.toString && e.toString() !== '[object Event]') {
          msg = e.toString();
        }
        setError(msg);
      }
    }) as T;
  }, []);

  const actions = {
    connect: withErrorHandling(DeviceService.connect),
    disconnect: withErrorHandling(DeviceService.disconnect),
    cancelConnect: withErrorHandling(DeviceService.cancelConnect),
    startHoming: withErrorHandling(DeviceService.startHoming),
    emergencyStop: withErrorHandling(DeviceService.emergencyStop),
    reset: withErrorHandling(DeviceService.reset),
    moveTo: withErrorHandling(DeviceService.moveTo),
    jogStart: withErrorHandling(DeviceService.jogStart),
    jogStop: withErrorHandling(DeviceService.jogStop),
    relayOn: withErrorHandling(DeviceService.relayOn),
    relayOff: withErrorHandling(DeviceService.relayOff),
    relayAllOff: withErrorHandling(DeviceService.relayAllOff),
    readInput: withErrorHandling(DeviceService.readInput),
    stopIoTest: withErrorHandling(DeviceService.stopIoTest),
    setParams: withErrorHandling(DeviceService.setParams),
    sendRaw: withErrorHandling(DeviceService.sendRaw),
    getDebugLog: DeviceService.getDebugLog,
    clearDebugLog: () => setDebugLog([]),
    clearError: () => setError(null),
  };

  return { state, actions, debugLog, error };
}
