"""
Mock Bridge — WebSocket Server que replica el protocolo del Bridge real.

Protocolo:
  Bridge → Cliente:  {"type": "hello", "data": {...}}
  Bridge → Cliente:  {"type": "live_params", "data": LiveParams}
  Cliente → Bridge:  {"type": "state", "data": {...}}

Valida payloads contra LiveParams schema (pydantic).
"""

import asyncio
import json
import time
import sys
from dataclasses import dataclass
from typing import Optional, Set, Dict, Any
from pathlib import Path

import websockets
from pydantic import BaseModel, Field, ValidationError

# Importar LiveParams desde el contrato compartido
# El archivo generado está en apps/bridge/live_params.py
sys.path.insert(0, str(Path(__file__).parent.parent / "apps" / "bridge"))
try:
    from live_params import LiveParams
except ImportError:
    # Fallback: definir modelo local si no existe el generado
    class LiveParams(BaseModel):
        filter_cutoff: float = Field(ge=200, le=12000, default=12000)
        filter_res: float = Field(ge=0.5, le=12, default=0.7)
        drive: float = Field(ge=0, le=1, default=0)
        delay_time: float = Field(ge=50, le=800, default=250)
        echo_feedback: float = Field(ge=0, le=0.8, default=0)
        reverb_mix: float = Field(ge=0, le=1, default=0)
        output_level: float = Field(ge=0, le=1, default=0.9)
        fx_preset: Optional[str] = Field(default=None)
        ts: float = Field(default_factory=time.time)

from simulator.scenarios import Scenario


@dataclass
class ClientInfo:
    websocket: "websockets.WebSocketServerProtocol"
    client_id: str
    connected_at: float
    last_ping: float = 0.0
    latency_ms: Optional[float] = None


class MockBridge:
    """
    Mock Bridge WebSocket Server.

    Comportamiento:
    - Acepta conexiones WS
    - Envía HELLO al conectar
    - Emite PARAM_UPDATE según el escenario a la tasa configurada
    - Responde PING con PONG (RTT)
    - Valida live_params con pydantic
    """

    def __init__(
        self,
        host: str = "localhost",
        port: int = 8765,
        scenario=None,
        rate: int = 60,
        duration: float = 10.0,
        loop: bool = False,
    ):
        self.host = host
        self.port = port
        self.scenario = scenario
        self.rate = rate
        self.duration = duration
        self.loop = loop
        self.interval = 1.0 / rate

        self.clients: Dict[str, ClientInfo] = {}
        self.server: Optional[websockets.WebSocketServer] = None
        self.running = False
        self.start_time = 0.0
        self.scenario_start_time = 0.0
        self.scenario_elapsed = 0.0

    async def run(self) -> None:
        """Inicia el servidor y ejecuta el bucle principal."""
        self.server = await websockets.serve(
            self._handle_connection,
            self.host,
            self.port,
            ping_interval=None,  # Manejamos ping/pong manualmente
            ping_timeout=None,
        )

        print(f"[MockBridge] Server listening on ws://{self.host}:{self.port}")

        self.running = True
        self.start_time = time.time()
        self.scenario_start_time = time.time()

        # Bucle principal de emisión
        try:
            await self._broadcast_loop()
        except asyncio.CancelledError:
            pass
        finally:
            await self.shutdown()

    async def _handle_connection(
        self,
        websocket: "websockets.WebSocketServerProtocol",
        path: str,
    ) -> None:
        """Maneja una nueva conexión de cliente."""
        client_id = f"client-{len(self.clients) + 1:03d}"
        client = ClientInfo(
            websocket=websocket,
            client_id=client_id,
            connected_at=time.time(),
        )
        self.clients[client_id] = client

        print(f"[MockBridge] Client connected: {client_id} (total: {len(self.clients)})")

        try:
            # Enviar HELLO
            hello = {
                "type": "hello",
                "data": {
                    "version": "1.0.0",
                    "midi_port": "simulator",
                    "gesture_mode": "studio",
                    "client_id": client_id,
                    "server_time": time.time(),
                },
            }
            await websocket.send(json.dumps(hello))

            # Manejar mensajes entrantes
            async for message in websocket:
                await self._handle_message(client, message)

        except websockets.exceptions.ConnectionClosed:
            pass
        except Exception as e:
            print(f"[MockBridge] Client {client_id} error: {e}")
        finally:
            self.clients.pop(client_id, None)
            print(f"[MockBridge] Client disconnected: {client_id} (total: {len(self.clients)})")

    async def _handle_message(self, client: ClientInfo, message: str) -> None:
        """Procesa mensaje entrante del cliente."""
        try:
            msg = json.loads(message)
        except json.JSONDecodeError:
            return

        msg_type = msg.get("type")

        if msg_type == "PING":
            client.last_ping = time.time()
            client_t = msg.get("t", 0)
            server_t = time.time()

            pong = {
                "type": "PONG",
                "t": client_t,
                "server_t": server_t,
            }
            try:
                await client.websocket.send(json.dumps(pong))
            except websockets.exceptions.ConnectionClosed:
                pass

        elif msg_type == "state":
            # Cliente reporta estado (playing, loop, position, etc.)
            pass

    async def _broadcast_loop(self) -> None:
        """Bucle principal de emisión de PARAM_UPDATE."""
        while self.running:
            loop_start = time.time()
            self.scenario_elapsed = time.time() - self.scenario_start_time

            # Verificar si el escenario terminó
            if self.scenario_elapsed >= self.duration and not self.loop:
                print(f"[MockBridge] Escenario completado ({self.duration}s)")
                if self.clients:
                    # Esperar a que los clientes se desconecten
                    await asyncio.sleep(1.0)
                self.running = False
                break

            # Generar params del escenario
            if self.scenario:
                params = self.scenario.generate_params(self.scenario_elapsed)
                if params is not None:
                    await self._broadcast_params(params)

            # Enviar PING a todos los clientes para RTT
            await self._send_ping_all()

            # Control de tasa
            elapsed = time.time() - loop_start
            sleep_time = max(0, self.interval - elapsed)
            await asyncio.sleep(sleep_time)

    async def _broadcast_params(self, params: dict) -> None:
        """Envía PARAM_UPDATE a todos los clientes conectados."""
        if not self.clients:
            return

        # Validar contra schema pydantic
        try:
            validated = LiveParams(**params)
            payload = {
                "type": "PARAM_UPDATE",
                "timestamp": params.get("ts", time.time()),
                "params": validated.model_dump(),
            }
        except ValidationError as e:
            print(f"[MockBridge] Validation error: {e}")
            return

        message = json.dumps(payload)

        # Enviar a todos los clientes
        dead_clients = []
        for client_id, client in self.clients.items():
            try:
                await client.websocket.send(message)
            except websockets.exceptions.ConnectionClosed:
                dead_clients.append(client_id)
            except Exception as e:
                print(f"[MockBridge] Send error to {client_id}: {e}")
                dead_clients.append(client_id)

        # Limpiar clientes desconectados
        for cid in dead_clients:
            self.clients.pop(cid, None)

    async def _send_ping_all(self) -> None:
        """Envía PING a todos los clientes para medir RTT."""
        if not self.clients:
            return

        ping_msg = json.dumps({
            "type": "PING",
            "t": time.time(),
        })

        for client_id, client in list(self.clients.items()):
            try:
                await client.websocket.send(ping_msg)
            except websockets.exceptions.ConnectionClosed:
                self.clients.pop(client_id, None)

    async def shutdown(self) -> None:
        """Apaga el servidor graciosamente."""
        self.running = False
        if self.server:
            self.server.close()
            await self.server.wait_closed()
        print("[MockBridge] Server shutdown complete")


async def main():
    """Entry point para testing standalone."""
    from scenarios import SweepScenario

    scenario = SweepScenario(step_mode=False)
    bridge = MockBridge(
        host="localhost",
        port=8765,
        scenario=scenario,
        rate=60,
        duration=30.0,
        loop=True,
    )

    try:
        await bridge.run()
    except KeyboardInterrupt:
        print("\nShutdown requested")


if __name__ == "__main__":
    asyncio.run(main())