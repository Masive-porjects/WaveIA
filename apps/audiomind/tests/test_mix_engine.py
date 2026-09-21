"""TDD tests for the Mix Engine (Paso 01 — per-stem routing).

RED → GREEN → REFACTOR contract for ``POST /api/session/{id}/mix``:

* the endpoint splits the session audio into the 4 stems
  (drums/bass/other/vocals) via ``split_audio``,
* routes each stem at NEUTRAL 0 dB gains onto a stereo mono-compatible
  bus (no DSP yet — pure routing + summing),
* pads every stem to the longest one and writes
  ``outputs/{session_id}_mix.wav`` through ``write_output``,
* analyzes each stem (LUFS / DR / spectral centroid) plus the full mix
  (tempo / genre / confidence),
* returns the WAV, carrying the JSON analysis payload in the
  ``X-Mix-Result`` response header, and records ``mix_path`` /
  ``mix_analysis`` on the session — never touching ``mastered_path``
  (the mix is NOT the master).

``split_audio`` (Demucs) is monkeypatched with a synthetic stand-in: the
real model download is heavy and non-deterministic, and the routing
contract under test is the engine, not the separator.
"""
import json
import sys
import uuid
from pathlib import Path

sys.path.insert(0, "src")

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

import audiomind.processing.mix_engine as mix_engine
from audiomind.api.upload import sessions
from audiomind.config import settings
from audiomind.main import app
from audiomind.models.audio import ProcessingStatus, SessionData

client = TestClient(app)

_SR = 44100
# (tone hz, duration s) per stem — differing lengths force the pad path.
_STEM_SPECS = {
    "drums": (120.0, 0.75),
    "bass": (90.0, 1.0),
    "other": (330.0, 1.0),
    "vocals": (440.0, 1.25),
}


def _write_tone(path: Path, hz: float, seconds: float, sr: int = _SR) -> None:
    """Write a short mono sine tone (synthetic fixture, no DSP deps)."""
    t = np.linspace(0.0, seconds, int(sr * seconds), endpoint=False)
    sf.write(str(path), 0.25 * np.sin(2.0 * np.pi * hz * t), sr)


def _register_session(tmp_path: Path, with_audio: bool = True) -> str:
    """Insert a session directly into the in-memory store (no HTTP upload).

    Bypasses ``/api/upload`` so no background librosa analysis or preset
    pre-render fires; the mix endpoint only needs ``original_path``.
    """
    session_id = str(uuid.uuid4())
    original_path = None
    if with_audio:
        original_path = tmp_path / "input.wav"
        _write_tone(original_path, hz=220.0, seconds=1.0)
    sessions[session_id] = SessionData(
        session_id=session_id,
        status=ProcessingStatus.UPLOADED,
        original_path=str(original_path) if original_path else None,
        original_filename=original_path.name if original_path else None,
    )
    return session_id


def _fake_split(input_path: str | Path, output_dir: str | Path | None = None,
                model: str = "htdemucs") -> dict:
    """Stand-in for Demucs: writes 4 distinct synthetic stems synchronously."""
    out = Path(output_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)
    stems: dict[str, str] = {}
    for name, (hz, seconds) in _STEM_SPECS.items():
        stem_path = out / f"{name}.wav"
        _write_tone(stem_path, hz=hz, seconds=seconds)
        stems[name] = str(stem_path)
    return {
        "stems": stems,
        "sample_rate": _SR,
        "duration_seconds": 1.25,
        "stem_audio_dir": str(out),
    }


class TestMixEndpoint:
    """Integration tests for POST /api/session/{id}/mix."""

    def test_mix_returns_wav_and_analysis(self, tmp_path, monkeypatch):
        """200 + WAV + JSON payload + on-disk file + session fields."""
        monkeypatch.setattr(mix_engine, "split_audio", _fake_split)
        session_id = _register_session(tmp_path)

        resp = client.post(f"/api/session/{session_id}/mix")

        # (c) 200 + WAV + JSON with tempo_bpm/genre/genre_confidence/analysis
        assert resp.status_code == 200, resp.text
        assert resp.headers["content-type"] == "audio/wav"
        assert len(resp.content) > 1000, "WAV body too small"
        payload = json.loads(resp.headers["x-mix-result"])
        assert "tempo_bpm" in payload
        assert "genre" in payload
        assert "genre_confidence" in payload
        assert set(payload["analysis"]) == {"drums", "bass", "other", "vocals"}
        for stem in payload["analysis"].values():
            assert "integrated_lufs" in stem
            assert "dynamic_range_db" in stem
            assert "spectral_centroid" in stem
        # v5 — stem_presence: exactly the 4 real STEM_NAMES, all booleans.
        # The synthetic fixture writes every stem at 0.25 amplitude
        # (≈ −15 dBFS RMS, well above the −50 dBFS threshold) → present.
        assert "stem_presence" in payload
        assert list(payload["stem_presence"]) == list(mix_engine.STEM_NAMES)
        assert all(
            isinstance(v, bool) for v in payload["stem_presence"].values()
        )
        assert all(payload["stem_presence"].values())
        # The bus is padded to the LONGEST stem (vocals: 1.25 s).
        assert payload["duration_seconds"] == pytest.approx(1.25, abs=0.01)

        # (d) the WAV exists on disk
        mix_path = settings.output_dir / f"{session_id}_mix.wav"
        assert mix_path.exists(), "mix WAV not written to outputs/"
        assert mix_path.stat().st_size > 1000

        # (e) the session keeps mix_path / mix_analysis…
        session = sessions[session_id]
        assert session.mix_path == str(mix_path.resolve())
        assert session.mix_analysis == payload
        # …and the mix is NOT the master: mastered_path stays untouched.
        assert session.mastered_path is None
        assert session.master_result is None

    def test_mix_unknown_session_returns_404(self):
        """POST on a session that does not exist → 404."""
        resp = client.post("/api/session/nope-not-a-session/mix")
        assert resp.status_code == 404

    def test_mix_without_audio_returns_400(self, tmp_path):
        """POST on a session with no uploaded audio → 400."""
        session_id = _register_session(tmp_path, with_audio=False)
        resp = client.post(f"/api/session/{session_id}/mix")
        assert resp.status_code == 400

    def test_get_mix_audio_serves_persisted_wav(self, tmp_path, monkeypatch):
        """GET /audio/mix serves the persisted WAV (stable URL, no re-mix).

        Regression guard for the literal-vs-parameter route order: the
        literal ``/audio/mix`` must beat mastering's ``/audio/{audio_type}``.
        """
        monkeypatch.setattr(mix_engine, "split_audio", _fake_split)
        session_id = _register_session(tmp_path)

        mix_resp = client.post(f"/api/session/{session_id}/mix")
        assert mix_resp.status_code == 200

        resp = client.get(f"/api/session/{session_id}/audio/mix")
        assert resp.status_code == 200, resp.text
        assert resp.headers["content-type"] == "audio/wav"
        assert resp.content == mix_resp.content, "GET body differs from POST body"
        assert "attachment" in resp.headers.get("content-disposition", "")

    def test_get_mix_audio_without_mix_returns_404(self):
        """GET /audio/mix for an unknown session → 404."""
        resp = client.get("/api/session/nope-not-a-session/audio/mix")
        assert resp.status_code == 404
        assert resp.json()["detail"] == "Mix not found for this session"


#: Version names in render order (payload keys of the versions dict).
_QC_CHECK_KEYS = {
    "mono",
    "phase",
    "sibilance_5k",
    "muddy_250",
    "honky_500",
    "low_level_listen",
}
_VERSION_NAMES = {"principal", "vocal_up", "vocal_down", "instrumental", "tv_mix"}


def _bin_energy_db(audio: np.ndarray, sr: int, hz: float) -> float:
    """Hann-windowed single-bin DFT energy (dB) at ``hz``.

    Leakage-controlled measurement used to isolate one synthetic stem
    tone inside a summed mix (stems are pure tones at distinct Hz).
    Relative comparisons only — the window's 0.5 amplitude factor is
    constant across files of the same length.
    """
    x = np.asarray(audio)
    n = x.shape[-1]
    window = np.hanning(n)
    t = np.arange(n, dtype=np.float64)
    phasor = np.exp(-2j * np.pi * hz * t / sr) * window
    if x.ndim == 2:
        mag = float(np.max(np.abs(x @ phasor)))
    else:
        mag = abs(float(np.dot(x, phasor)))
    return 20.0 * np.log10(mag / n + 1e-12)


def _read_wav(path: str | Path) -> tuple[np.ndarray, int]:
    """Decode a mix WAV into (2, N) float + sample rate."""
    with sf.SoundFile(str(path), "r") as f:
        sr = int(f.samplerate)
        frames = f.read(dtype="float32", always_2d=True)
    return frames.T, sr


class TestMixQCAndVersions:
    """Paso 07: QC report + alternative versions on the /mix endpoint."""

    def test_mix_payload_includes_qc_report(self, tmp_path, monkeypatch):
        """qc_report is always present with every check + summary."""
        monkeypatch.setattr(mix_engine, "split_audio", _fake_split)
        session_id = _register_session(tmp_path)
        resp = client.post(f"/api/session/{session_id}/mix")
        assert resp.status_code == 200
        payload = json.loads(resp.headers["x-mix-result"])
        qc_report = payload["qc_report"]
        assert _QC_CHECK_KEYS <= set(qc_report)
        assert "summary" in qc_report
        assert isinstance(qc_report["summary"]["flagged"], list)
        # Informational contract: every per-check dict carries ok + details.
        for name in _QC_CHECK_KEYS:
            assert "ok" in qc_report[name]
            assert "details" in qc_report[name]

    def test_mix_renders_all_version_wavs(self, tmp_path, monkeypatch):
        """-versions dict with 5 entries; alt WAVs exist and decode."""
        monkeypatch.setattr(mix_engine, "split_audio", _fake_split)
        session_id = _register_session(tmp_path)
        resp = client.post(f"/api/session/{session_id}/mix")
        assert resp.status_code == 200
        payload = json.loads(resp.headers["x-mix-result"])
        versions = payload["versions"]
        assert set(versions) == _VERSION_NAMES
        # principal points at the same file the endpoint serves.
        assert versions["principal"]["path"] == str(
            (settings.output_dir / f"{session_id}_mix.wav").resolve()
        )
        assert versions["principal"]["trim_db"] == 0.0
        for name in ("vocal_up", "vocal_down", "instrumental", "tv_mix"):
            assert Path(versions[name]["path"]).exists()
            assert Path(versions[name]["path"]).stat().st_size > 1000
            audio, sr = _read_wav(versions[name]["path"])
            assert audio.ndim == 2 and audio.shape[0] == 2
            assert sr == _SR
            assert len(versions[name]["description"]) > 0
        assert versions["vocal_up"]["trim_db"] == 0.75
        assert versions["vocal_down"]["trim_db"] == -0.75
        assert versions["instrumental"]["trim_db"] is None
        assert versions["tv_mix"]["trim_db"] is None

    def test_versions_differ_only_in_vocals_band(self, tmp_path, monkeypatch):
        """Spectral proof: only the 440 Hz vocals band moves across versions.

        vocal_up > principal > vocal_down; instrumental/tv_mix ≈ no vocal;
        the bass band (90 Hz) stays equal within ±1.5 dB (the bus
        compressor reacts minimally to the fader move, DAW-real).
        """
        monkeypatch.setattr(mix_engine, "split_audio", _fake_split)
        session_id = _register_session(tmp_path)
        resp = client.post(f"/api/session/{session_id}/mix")
        assert resp.status_code == 200
        payload = json.loads(resp.headers["x-mix-result"])
        versions = payload["versions"]

        audios: dict[str, np.ndarray] = {}
        for name, entry in versions.items():
            audios[name], sr = _read_wav(entry["path"])

        vocals_band = {name: _bin_energy_db(a, sr, 440.0)
                       for name, a in audios.items()}
        assert vocals_band["vocal_up"] >= vocals_band["principal"] + 0.2
        assert vocals_band["vocal_down"] <= vocals_band["principal"] - 0.2
        assert vocals_band["instrumental"] <= vocals_band["principal"] - 20.0
        assert vocals_band["tv_mix"] <= vocals_band["principal"] - 20.0

        bass_band = {name: _bin_energy_db(a, sr, 90.0)
                     for name, a in audios.items()}
        for name in ("vocal_up", "vocal_down", "instrumental", "tv_mix"):
            assert abs(bass_band[name] - bass_band["principal"]) <= 1.5

    def test_principal_byte_identical_with_and_without_versions(
        self, tmp_path, monkeypatch
    ):
        """Paso 06 regression: rendering versions never perturbs principal."""
        monkeypatch.setattr(mix_engine, "split_audio", _fake_split)
        session_id = _register_session(tmp_path)
        original_path = sessions[session_id].original_path

        mix_engine.build_mix(session_id, str(original_path), with_versions=True)
        with_versions_bytes = (
            settings.output_dir / f"{session_id}_mix.wav"
        ).read_bytes()

        mix_engine.build_mix(session_id, str(original_path), with_versions=False)
        without_versions_bytes = (
            settings.output_dir / f"{session_id}_mix.wav"
        ).read_bytes()

        assert with_versions_bytes == without_versions_bytes


class TestStemPresence:
    """v5 — honest stems: presence from per-stem RMS, not fixed names.

    Demucs always emits the 4 stems; ``stem_presence`` reports which are
    actually audible so the UI never names an instrument that is not in
    the material. The endpoint test above proves the payload shape
    end-to-end; these unit tests drive the threshold helper with
    synthetic arrays (silence → absent, real tone → present, quiet
    residue → absent).
    """

    def test_digital_silence_is_absent(self):
        """All-zero stem measures ≈ −inf → never clears the threshold."""
        silence = np.zeros((2, 44100), dtype=np.float32)
        rms_db = mix_engine._stem_rms_db(silence)
        assert rms_db == -np.inf
        assert rms_db < mix_engine.STEM_PRESENCE_RMS_DBFS_THRESHOLD

    def test_sine_tone_is_present(self):
        """A real stem tone (0.25 amplitude ≈ −15 dBFS RMS) is present."""
        t = np.arange(44100, dtype=np.float64) / _SR
        tone = (0.25 * np.sin(2.0 * np.pi * 440.0 * t)).astype(np.float32)
        rms_db = mix_engine._stem_rms_db(tone)
        assert rms_db == pytest.approx(-15.05, abs=0.2)
        assert rms_db >= mix_engine.STEM_PRESENCE_RMS_DBFS_THRESHOLD

    def test_missing_stem_residue_is_absent(self):
        """A demucs "missing stem" is model residue, not silence: a tone
        65 dB below the fixture level (≈ −80 dBFS) must be ABSENT."""
        t = np.arange(44100, dtype=np.float64) / _SR
        amp = 0.25 * 10 ** (-65 / 20)
        residue = (amp * np.sin(2.0 * np.pi * 300.0 * t)).astype(np.float32)
        rms_db = mix_engine._stem_rms_db(residue)
        assert rms_db < mix_engine.STEM_PRESENCE_RMS_DBFS_THRESHOLD