/**
 * liveSocket — tests de robustez (spec AGENTS.md):
 *  - Heartbeat cada 5 s
 *  - Watchdog: sin PONG en pongTimeout (10 s) → estado 'stale'
 *  - PONG a tiempo → nunca 'stale'
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLiveSocket, ConnectionState } from '@/adapters/live/liveSocket';

class MockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.OPEN;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3; // CLOSED
  }
}

function lastSocket(): MockWebSocket {
  return MockWebSocket.instances[MockWebSocket.instances.length - 1];
}

describe('liveSocket — robustez', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('envía PING (heartbeat) cada 5 s según spec', () => {
    const socket = createLiveSocket({});
    lastSocket().onopen?.();

    vi.advanceTimersByTime(15000);

    // PINGs en t=5s, t=10s, t=15s
    expect(lastSocket().sent).toHaveLength(3);
    socket.disconnect();
  });

  it('marca stale si no llega PONG en pongTimeout (10 s)', () => {
    const states: ConnectionState[] = [];
    const socket = createLiveSocket({ onStateChange: (s) => states.push(s) });
    lastSocket().onopen?.();

    vi.advanceTimersByTime(5000); // heartbeat → PING + watchdog
    expect(states).not.toContain('stale');

    vi.advanceTimersByTime(10000); // sin PONG → watchdog vence
    expect(states).toContain('stale');
    socket.disconnect();
  });

  it('NO marca stale si el PONG llega a tiempo', () => {
    const states: ConnectionState[] = [];
    const socket = createLiveSocket({ onStateChange: (s) => states.push(s) });
    lastSocket().onopen?.();

    vi.advanceTimersByTime(5000); // PING
    lastSocket().onmessage?.({ data: JSON.stringify({ type: 'PONG', t: 0, server_t: 0 }) });

    vi.advanceTimersByTime(9000); // antes de que venza el próximo watchdog
    expect(states).not.toContain('stale');
    socket.disconnect();
  });

  it('reporta RTT en cada PONG', () => {
    const rtts: number[] = [];
    const socket = createLiveSocket({ onPong: (rtt) => rtts.push(rtt) });
    lastSocket().onopen?.();

    lastSocket().onmessage?.({ data: JSON.stringify({ type: 'PONG', t: performance.now() - 42, server_t: 0 }) });
    expect(rtts[0]).toBeGreaterThanOrEqual(40);
    socket.disconnect();
  });
});
