'use client';

declare global {
  interface Window {
    __TAURI__?: Record<string, unknown>;
  }
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { ScaleState, ScaleData, ScaleConnectionState, ScaleDeviceInfo } from './types';
import * as ScaleService from './scale-service';

const initialState: ScaleState = {
  isScanning: false,
  isConnected: false,
  deviceName: '',
  deviceAddress: '',
  data: null,
};

export function useScale() {
  const [state, setState] = useState<ScaleState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const unlistenRefs = useRef<UnlistenFn[]>([]);

  useEffect(() => {
    let mounted = true;

    const setup = async () => {
      try {
        // 监听实时称重数据
        const unlistenData = await listen<ScaleData>('scale-data', (event) => {
          if (mounted) {
            setState(prev => ({
              ...prev,
              data: event.payload,
            }));
          }
        });

        // 监听连接状态变更
        const unlistenConnection = await listen<ScaleConnectionState>('scale-connection-changed', (event) => {
          if (mounted) {
            setState(prev => ({
              ...prev,
              isScanning: event.payload.isScanning,
              isConnected: event.payload.isConnected,
              deviceName: event.payload.deviceName,
              deviceAddress: event.payload.deviceAddress,
              // 断开连接时清除数据
              data: event.payload.isConnected ? prev.data : null,
            }));
          }
        });

        unlistenRefs.current = [unlistenData, unlistenConnection];

        // 获取初始连接状态
        const initialConn = await ScaleService.scaleConnectionState().catch(() => null);
        if (mounted && initialConn) {
          setState(prev => ({
            ...prev,
            isScanning: initialConn.isScanning,
            isConnected: initialConn.isConnected,
            deviceName: initialConn.deviceName,
            deviceAddress: initialConn.deviceAddress,
          }));
        }
      } catch (e) {
        // 非 Tauri 环境（浏览器中访问）静默降级
        if (typeof window !== 'undefined' && !window.__TAURI__) {
          console.warn('[useScale] Not in Tauri environment, using mock state');
        } else {
          console.error('[useScale] Setup error:', e);
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
  const withErrorHandling = useCallback(<T extends (...args: any[]) => Promise<any>>(fn: T) => {
    return (async (...args: Parameters<T>) => {
      try {
        setError(null);
        return await fn(...args);
      } catch (e: any) {
        let msg = '操作失败';
        if (typeof e === 'string') {
          msg = e;
        } else if (e?.message) {
          msg = e.message;
        } else if (e?.type && e?.target) {
          msg = `事件错误: ${e.type}`;
          if (e.target?.src || e.target?.href) {
            msg += ` - ${e.target.src || e.target.href}`;
          }
        } else if (e?.toString && e.toString() !== '[object Event]') {
          msg = e.toString();
        }
        setError(msg);
        return undefined;
      }
    }) as unknown as T;
  }, []);

  const actions = {
    scan: withErrorHandling(async (): Promise<ScaleDeviceInfo[]> => {
      setState(prev => ({ ...prev, isScanning: true }));
      try {
        return await ScaleService.scaleScan();
      } finally {
        setState(prev => ({ ...prev, isScanning: false }));
      }
    }),
    connect: withErrorHandling(ScaleService.scaleConnect),
    disconnect: withErrorHandling(ScaleService.scaleDisconnect),
    zero: withErrorHandling(ScaleService.scaleZero),
    calibrate: withErrorHandling(ScaleService.scaleCalibrate),
    clearError: () => setError(null),
  };

  return { state, actions, error };
}
