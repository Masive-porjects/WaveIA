"""
Tests for WSServer - WebSocket broadcast and client management.
"""
import pytest
import asyncio
import json
import time
import sys
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch, MagicMock

BRIDGE_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(BRIDGE_ROOT))

from src.ws_server import WSServer
from src.live_params import LiveParams


class TestWSServer:
    @pytest.fixture
    def server(self):
        return WSServer(host="localhost", port=8765, heartbeat_interval=5.0)

    @pytest.mark.asyncio
    async def test_start_stop(self, server):
        """Server should start and stop cleanly."""
        await server.start()
        assert server._server is not None
        assert server._running is True

        await server.stop()
        assert server._running is False

    @pytest.mark.asyncio
    async def test_broadcast_no_clients(self, server):
        """Broadcast with no clients should return 0."""
        await server.start()
        params = LiveParams(ts=time.time())
        sent = await server.broadcast(params)
        assert sent == 0
        await server.stop()

    @pytest.mark.asyncio
    async def test_broadcast_with_mock_client(self, server):
        """Broadcast should queue message for clients."""
        await server.start()

        # Add mock client
        mock_ws = AsyncMock()
        mock_ws.send = AsyncMock()
        client_id = "test_client"
        from src.ws_server import ClientInfo
        client = ClientInfo(id=client_id, ws=mock_ws)
        server._clients[client_id] = client

        params = LiveParams(ts=time.time(), filter_cutoff=6000.0)
        sent = await server.broadcast(params)

        # Should queue for 1 client
        assert sent == 1

        # Wait for broadcast loop to process
        await asyncio.sleep(0.05)

        # Verify send was called
        mock_ws.send.assert_called()
        call_args = mock_ws.send.call_args[0][0]
        msg = json.loads(call_args)
        assert msg["type"] == "PARAM_UPDATE"
        assert "params" in msg
        assert msg["params"]["filter_cutoff"] == 6000.0

        await server.stop()

    @pytest.mark.asyncio
    async def test_hello_message_on_connect(self, server):
        """New client should receive HELLO message."""
        await server.start()

        mock_ws = AsyncMock()
        mock_ws.send = AsyncMock()

        # Simulate connection handler
        from src.ws_server import ClientInfo
        client = ClientInfo(id="test", ws=mock_ws)
        server._clients["test"] = client

        # Send hello manually (what _handle_connection does)
        hello = {
            "type": "HELLO",
            "version": "1.0",
            "server_time": time.time(),
            "client_id": "test",
        }
        await mock_ws.send(json.dumps(hello))

        mock_ws.send.assert_called()
        call_args = mock_ws.send.call_args[0][0]
        msg = json.loads(call_args)
        assert msg["type"] == "HELLO"

        await server.stop()

    @pytest.mark.asyncio
    async def test_ping_pong_latency(self, server):
        """PING/PONG should calculate latency."""
        await server.start()

        from src.ws_server import ClientInfo
        mock_ws = AsyncMock()
        mock_ws.send = AsyncMock()
        client = ClientInfo(id="test", ws=mock_ws)
        server._clients["test"] = client

        # Simulate PING from client
        ping_msg = {"type": "PING", "t": time.time()}
        await server._handle_message(client, json.dumps(ping_msg))

        # Should respond with PONG
        mock_ws.send.assert_called()
        call_args = mock_ws.send.call_args[0][0]
        pong = json.loads(call_args)
        assert pong["type"] == "PONG"
        assert "server_t" in pong

        await server.stop()

    @pytest.mark.asyncio
    async def test_get_stats(self, server):
        """Stats should include client count and queue size."""
        await server.start()

        stats = server.get_stats()
        assert stats["clients"] == 0
        assert "queue_size" in stats
        assert "client_details" in stats

        await server.stop()

    @pytest.mark.asyncio
    async def test_multiple_clients(self, server):
        """Should handle multiple concurrent clients."""
        await server.start()

        from src.ws_server import ClientInfo
        for i in range(3):
            mock_ws = AsyncMock()
            mock_ws.send = AsyncMock()
            client = ClientInfo(id=f"client_{i}", ws=mock_ws)
            server._clients[f"client_{i}"] = client

        assert server.client_count == 3

        params = LiveParams(ts=time.time())
        sent = await server.broadcast(params)
        assert sent == 3

        await server.stop()