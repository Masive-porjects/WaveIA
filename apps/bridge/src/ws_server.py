"""
WebSocket Server - Broadcasts LiveParams to connected clients.
Supports multiple clients, ping/pong for latency measurement.
"""
import asyncio
import json
import time
import uuid
from typing import Dict, Set, Optional, Any
from dataclasses import dataclass, field

import websockets
from websockets.server import WebSocketServerProtocol

from .live_params import LiveParams
from .config import DEFAULT_CONFIG


@dataclass
class ClientInfo:
    """Connected client metadata."""
    id: str
    ws: WebSocketServerProtocol
    connected_at: float = field(default_factory=time.time)
    last_ping: float = 0.0
    latency_ms: Optional[float] = None


class WSServer:
    """
    WebSocket server for LiveParams broadcasting.

    Protocol:
    - Server -> Client: {"type": "PARAM_UPDATE", "timestamp": ..., "params": {...}}
    - Server -> Client: {"type": "HELLO", "version": "1.0", "server_time": ...}
    - Client -> Server: {"type": "PING", "t": client_timestamp}
    - Server -> Client: {"type": "PONG", "t": client_timestamp, "server_t": server_timestamp}
    """

    def __init__(
        self,
        host: str = DEFAULT_CONFIG.ws_host,
        port: int = DEFAULT_CONFIG.ws_port,
        heartbeat_interval: float = DEFAULT_CONFIG.heartbeat_interval_s,
    ):
        self.host = host
        self.port = port
        self.heartbeat_interval = heartbeat_interval

        self._clients: Dict[str, ClientInfo] = {}
        self._server: Optional[websockets.Server] = None
        self._running = False
        self._broadcast_queue: asyncio.Queue = asyncio.Queue(maxsize=1000)
        self._tasks: Set[asyncio.Task] = set()

    @property
    def client_count(self) -> int:
        return len(self._clients)

    async def start(self) -> None:
        """Start WebSocket server."""
        self._running = True
        self._server = await websockets.serve(
            self._handle_connection,
            self.host,
            self.port,
            ping_interval=None,  # We handle our own ping/pong
            ping_timeout=None,
        )
        print(f"[WS] Server listening on ws://{self.host}:{self.port}")

        # Start background tasks
        self._tasks.add(asyncio.create_task(self._broadcast_loop()))
        self._tasks.add(asyncio.create_task(self._heartbeat_loop()))

    async def stop(self) -> None:
        """Stop server and cleanup."""
        self._running = False

        # Close all client connections
        for client in list(self._clients.values()):
            await client.ws.close()

        # Cancel background tasks
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)

        if self._server:
            self._server.close()
            await self._server.wait_closed()

    async def broadcast(self, params: LiveParams) -> int:
        """
        Queue LiveParams for broadcast to all clients.

        Returns number of clients message was queued for.
        """
        if not self._clients:
            return 0

        # Convert to JSON message
        message = {
            "type": "PARAM_UPDATE",
            "timestamp": params.ts,
            "params": {
                "filter_cutoff": params.filter_cutoff,
                "filter_res": params.filter_res,
                "drive": params.drive,
                "delay_time": params.delay_time,
                "echo_feedback": params.echo_feedback,
                "reverb_mix": params.reverb_mix,
                "output_level": params.output_level,
                "fx_preset": params.fx_preset,
            },
        }

        # Non-blocking queue put
        try:
            self._broadcast_queue.put_nowait(message)
        except asyncio.QueueFull:
            pass  # Drop if queue full

        return len(self._clients)

    async def _handle_connection(self, ws: WebSocketServerProtocol) -> None:
        """Handle new client connection."""
        client_id = str(uuid.uuid4())[:8]
        client = ClientInfo(id=client_id, ws=ws)
        self._clients[client_id] = client

        print(f"[WS] Client connected: {client_id} (total: {len(self._clients)})")

        # Send hello message
        hello = {
            "type": "HELLO",
            "version": "1.0",
            "server_time": time.time(),
            "client_id": client_id,
        }
        try:
            await ws.send(json.dumps(hello))
        except Exception:
            pass

        try:
            async for raw_msg in ws:
                await self._handle_message(client, raw_msg)
        except websockets.ConnectionClosed:
            pass
        finally:
            self._clients.pop(client_id, None)
            print(f"[WS] Client disconnected: {client_id} (total: {len(self._clients)})")

    async def _handle_message(self, client: ClientInfo, raw_msg: str) -> None:
        """Handle incoming client message."""
        try:
            msg = json.loads(raw_msg)
        except json.JSONDecodeError:
            return

        msg_type = msg.get("type")

        if msg_type == "PING":
            client_t = msg.get("t", 0)
            server_t = time.time()
            client.last_ping = server_t

            pong = {
                "type": "PONG",
                "t": client_t,
                "server_t": server_t,
            }
            try:
                await client.ws.send(json.dumps(pong))
            except Exception:
                pass

            # Calculate latency
            if client_t:
                client.latency_ms = (server_t - client_t) * 1000

    async def _broadcast_loop(self) -> None:
        """Background task: process broadcast queue."""
        while self._running:
            try:
                message = await asyncio.wait_for(
                    self._broadcast_queue.get(),
                    timeout=0.1
                )
            except asyncio.TimeoutError:
                continue

            if not self._clients:
                continue

            # Send to all clients
            dead_clients = []
            for client_id, client in self._clients.items():
                try:
                    await client.ws.send(json.dumps(message))
                except Exception:
                    dead_clients.append(client_id)

            # Clean up dead connections
            for cid in dead_clients:
                self._clients.pop(cid, None)

    async def _heartbeat_loop(self) -> None:
        """Background task: send periodic heartbeat/ping to clients."""
        while self._running:
            await asyncio.sleep(self.heartbeat_interval)

            if not self._clients:
                continue

            # Send ping to all clients for latency measurement
            ping_msg = {
                "type": "PING",
                "t": time.time(),
            }
            ping_json = json.dumps(ping_msg)

            for client in list(self._clients.values()):
                try:
                    await client.ws.send(ping_json)
                except Exception:
                    pass

    def get_stats(self) -> dict:
        """Get server statistics."""
        return {
            "clients": len(self._clients),
            "client_details": [
                {
                    "id": c.id,
                    "connected_for_s": time.time() - c.connected_at,
                    "latency_ms": c.latency_ms,
                }
                for c in self._clients.values()
            ],
            "queue_size": self._broadcast_queue.qsize(),
        }


async def run_server(
    host: str = DEFAULT_CONFIG.ws_host,
    port: int = DEFAULT_CONFIG.ws_port,
    heartbeat_interval: float = DEFAULT_CONFIG.heartbeat_interval_s,
) -> WSServer:
    """Convenience function to create and start server."""
    server = WSServer(host, port, heartbeat_interval)
    await server.start()
    return server