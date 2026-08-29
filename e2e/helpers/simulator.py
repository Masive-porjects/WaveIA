"""
Simulator helper para tests E2E.

Maneja el ciclo de vida del mock bridge (subprocess Python).
"""

import asyncio
import subprocess
import time
import socket
from typing import Optional
from pathlib import Path


async def wait_for_port(port: int, host: str = "localhost", timeout: float = 10.0) -> bool:
    """Espera a que un puerto TCP esté disponible."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            with socket.create_connection(("localhost", port), timeout=1):
                return True
        except (ConnectionRefusedError, OSError):
            await asyncio.sleep(0.1)
    return False


async def wait_for_port_closed(port: int, host: str = "localhost", timeout: float = 5.0) -> bool:
    """Espera a que un puerto TCP se cierre."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            with socket.create_connection(("localhost", port), timeout=1):
                await asyncio.sleep(0.1)
        except (ConnectionRefusedError, OSError):
            return True
    return False


class SimulatorProcess:
    """Maneja el ciclo de vida del proceso simulador."""

    def __init__(self, scenario: str = "sweep", port: int = 8765, rate: int = 60, extra_args: list = None):
        self.scenario = scenario
        self.port = port
        self.rate = rate
        self.extra_args = extra_args or []
        self.process: Optional[subprocess.Popen] = None
        self._project_root = Path(__file__).parent.parent.parent  # WaveAI root

    def start(self) -> None:
        """Inicia el proceso simulador en background."""
        cmd = [
            "python", "-m", "simulator.main",
            "--mode", "server",
            "--scenario", self.scenario,
            "--port", str(self.port),
            "--rate", "60",
        ] + self.extra_args

        print(f"[SimulatorHelper] Starting: {' '.join(cmd)}")
        self.process = subprocess.Popen(
            cmd,
            cwd=str(self._project_root),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

        # Wait for server to be ready
        import asyncio
        asyncio.run(self._wait_ready())

    async def _wait_ready(self, timeout: float = 15.0) -> bool:
        """Espera a que el puerto WS esté listo."""
        import socket
        start = time.time()
        timeout = 15.0
        while time.time() - start < 15.0:
            try:
                with socket.create_connection(("localhost", 8765), timeout=1):
                    return True
            except (ConnectionRefusedError, OSError):
                await asyncio.sleep(0.1)
        raise TimeoutError(f"Simulator port 8765 not ready after 15s")

    def stop(self) -> None:
        """Detiene el proceso simulador."""
        if self.process:
            print("[SimulatorHelper] Stopping simulator...")
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait()
            self.process = None
            print("[SimulatorHelper] Simulator stopped")


async def start_simulator(scenario: str = "sweep", port: int = 8765, extra_args: list = None) -> "SimulatorProcess":
    """Factory async para crear e iniciar simulador."""
    sim = SimulatorProcess(scenario=scenario, port=port, extra_args=extra_args)
    sim.start()
    return sim


async def stop_simulator(sim: "SimulatorProcess") -> None:
    """Detiene el simulador."""
    sim.stop()


def wait_for_port_sync(port: int, host: str = "localhost", timeout: float = 10.0) -> bool:
    """Versión síncrona para uso en tests no-async."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            with socket.create_connection(("localhost", port), timeout=1):
                return True
        except (ConnectionRefusedError, OSError):
            time.sleep(0.1)
    return False


def wait_for_port_closed_sync(port: int, host: str = "localhost", timeout: float = 5.0) -> bool:
    """Versión síncrona para esperar cierre de puerto."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            with socket.create_connection(("localhost", port), timeout=1):
                time.sleep(0.1)
        except (ConnectionRefusedError, OSError):
            return True
    return False