/**
 * Live Socket Client — WebSocket connection to Bridge (localhost:8765).
 * Handles auto-reconnect, ping/pong for RTT, and typed message parsing.
 */

import type { LiveParams } from './liveParams.gen';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface LiveSocketConfig {
  url?: string;                    // Default: ws://localhost:8765
  reconnectInterval?: number;      // Base reconnect interval (ms)
  maxReconnectInterval?: number;   // Max reconnect interval (ms)
  pingInterval?: number;           // Ping interval (ms)
  onStateChange?: (state: ConnectionState) => void;
  onParams?: (params: LiveParams) => void;
  onHello?: (data: HelloData) => void;
  onPong?: (rtt: number) => void;
  onError?: (error: Error) => void;
}

export interface HelloData {
  version: string;
  midi_port: string;
  gesture_mode: string;
  client_id: string;
  server_time: number;
}

export interface ParamUpdateMessage {
  type: 'PARAM_UPDATE';
  timestamp: number;
  params: LiveParams;
}

export interface HelloMessage {
  type: 'HELLO';
  version: string;
  midi_port: string;
  gesture_mode: string;
  client_id: string;
  server_time: number;
}

export interface PingMessage {
  type: 'PING';
  t: number;
}

export interface PongMessage {
  type: 'PONG';
  t: number;
  server_t: number;
}

export type IncomingMessage = ParamUpdateMessage | HelloMessage | PongMessage;

/**
 * Create a managed WebSocket connection to the Bridge.
 */
export function createLiveSocket(config: LiveSocketConfig = {}) {
  const {
    url = 'ws://localhost:8765',
    reconnectInterval = 1000,
    maxReconnectInterval = 5000,
    pingInterval = 2000,
    onStateChange,
    onParams,
    onHello,
    onPong,
    onError,
  } = config;

  let ws: WebSocket | null = null;
  let state: ConnectionState = 'disconnected';
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pingTimer: ReturnType<typeof setTimeout> | null = null;
  let currentReconnectDelay = reconnectInterval;
  let pingTimestamp = 0;

  function setState(newState: ConnectionState) {
    if (state !== newState) {
      state = newState;
      onStateChange?.(state);
    }
  }

  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    setState('connecting');

    try {
      ws = new WebSocket(url);
    } catch (err) {
      setState('error');
      onError?.(err as Error);
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      setState('connected');
      currentReconnectDelay = reconnectInterval;
      startPingLoop();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as IncomingMessage;
        handleMessage(msg);
      } catch (err) {
        console.warn('[LiveSocket] Failed to parse message:', err);
      }
    };

    ws.onclose = () => {
      stopPingLoop();
      setState('disconnected');
      scheduleReconnect();
    };

    ws.onerror = (err) => {
      setState('error');
      onError?.(new Error('WebSocket error'));
    };
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      currentReconnectDelay = Math.min(currentReconnectDelay * 1.5, maxReconnectInterval);
      connect();
    }, currentReconnectDelay);
  }

  function startPingLoop() {
    stopPingLoop();
    pingTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        pingTimestamp = performance.now();
        ws.send(JSON.stringify({ type: 'PING', t: pingTimestamp }));
      }
    }, pingInterval);
  }

  function stopPingLoop() {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  }

  function handleMessage(msg: IncomingMessage) {
    switch (msg.type) {
      case 'HELLO':
        onHello?.({
          version: msg.version,
          midi_port: msg.midi_port,
          gesture_mode: msg.gesture_mode,
          client_id: msg.client_id,
          server_time: msg.server_time,
        });
        break;

      case 'PARAM_UPDATE':
        onParams?.({
          ...msg.params,
          ts: msg.timestamp,
        });
        break;

      case 'PONG':
        const rtt = performance.now() - msg.t;
        onPong?.(rtt);
        break;
    }
  }

  function send(msg: object) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  function disconnect() {
    stopPingLoop();
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      ws.close();
      ws = null;
    }
    setState('disconnected');
  }

  // Auto-connect on creation
  connect();

  return {
    getState: () => state,
    send,
    disconnect,
    reconnect: connect,
  };
}