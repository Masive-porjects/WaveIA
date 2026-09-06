"""Phase C — external reference comparison tests (P1-1).

Covers the new external-reference surface:

  1. ``POST  /api/session/{id}/reference-file`` — upload/replace an
     external mastered reference (validation mirrors ``/api/upload``).
  2. ``POST  /api/session/{id}/compare-reference`` — measurement-only
     comparison (spectral diff + loudness/brightness profile), cached
     per session, 400 for missing master/reference.
  3. ``GET   /api/session/{id}/audio/reference-file`` — playback of the
     uploaded reference.
  4. ``compare_tracks`` unit coverage on synthetic WAVs: identity
     invariance (the neutral contract of the feature), spectral-diff
     hints pointing at the right bands, None propagation and graceful
     partial states.

Route-level tests mirror ``test_reference_render.py`` (fresh store,
stubbed DSP, no network). Unit tests use numpy-generated WAVs via
``soundfile`` (FLOAT subtype) into ``tmp_path``.
"""
import sys

sys.path.insert(0, "src")

import io
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from audiomind.analysis.analyzer import TARGET_BANDS_HZ
from audiomind.analysis.reference_compare import compare_tracks
from audiomind.api.upload import sessions
from audiomind.config import settings
from audiomind.main import app
from audiomind.models.audio import ReferenceComparison

client = TestClient(app)

SR = 44100
BAND_1K = TARGET_BANDS_HZ.index(1000)
BAND_6K = TARGET_BANDS_HZ.index(6000)


@pytest.fixture(autouse=True)
def _fresh_store(monkeypatch):
    sessions.clear()
    # Force development mode so require_license allows all requests
    monkeypatch.setattr(settings, "license_key", "")
    yield
    sessions.clear()


# ── Synthetic fixtures ─────────────────────────────────────────────────


def _write_wav(path, samples, sr=SR, subtype="FLOAT") -> None:
    """Write samples (1D mono or (channels, samples)) as a WAV."""
    x = np.asarray(samples)
    blocks = x.T if x.ndim == 2 else x
    sf.write(str(path), blocks, sr, subtype=subtype)


def _wav_bytes(samples, sr=SR) -> bytes:
    """Encode samples to WAV bytes for multipart uploads."""
    buf = io.BytesIO()
    x = np.asarray(samples)
    blocks = x.T if x.ndim == 2 else x
    sf.write(buf, blocks, sr, format="WAV", subtype="FLOAT")
    return buf.getvalue()


def _noise_with_tones(amp_6k: float, amp_1k: float) -> np.ndarray:
    """Stereo program: shared white noise + sine tones at 6 kHz / 1 kHz.

    The tones land exactly on FFT bins (integer periods at 1 s / 44.1 kHz),
    so band-energy differences between two draws stay confined to the two
    toned bands; the shared noise keeps every other band identical. Tuned
    amplitudes: a 0.30/0.05 master vs 0.05/0.25 reference differs by
    ~±15 dB at 6 kHz/1 kHz and ~1-2 dB in LUFS.
    """
    rng = np.random.default_rng(7)
    n = int(SR * 1.0)
    t = np.linspace(0.0, 1.0, n, endpoint=False)
    noise = 0.02 * rng.standard_normal(n)
    tone = amp_6k * np.sin(2 * np.pi * 6000 * t) + amp_1k * np.sin(
        2 * np.pi * 1000 * t
    )
    signal = noise + tone
    return np.stack([signal, signal])


def _master_program() -> np.ndarray:
    """Master with strong 6 kHz and weak 1 kHz compared to the reference."""
    return _noise_with_tones(amp_6k=0.30, amp_1k=0.05)


def _reference_program() -> np.ndarray:
    """Reference with weak 6 kHz and strong 1 kHz compared to the master."""
    return _noise_with_tones(amp_6k=0.05, amp_1k=0.25)


def _make_session(name="refext"):
    resp = client.post("/api/session/new", json={"name": name})
    assert resp.status_code == 200
    session_id = resp.json()["session_id"]
    session = sessions[session_id]
    original = settings.upload_dir / f"{session_id}_orig.wav"
    _write_wav(original, _master_program())
    session.original_path = str(original.resolve())
    return session_id


def _make_mastered(session_id, samples=None):
    """Point the session's mastered_path at a real WAV file."""
    if samples is None:
        samples = _master_program()
    path = (settings.output_dir / f"{session_id}_mastered.wav").resolve()
    _write_wav(path, samples)
    sessions[session_id].mastered_path = str(path)
    return path


def _upload_reference(session_id, filename="ref.wav", content=None):
    if content is None:
        content = _wav_bytes(_reference_program())
    return client.post(
        f"/api/session/{session_id}/reference-file",
        files={"file": (filename, content, "audio/wav")},
    )


# ── compare_tracks unit tests ──────────────────────────────────────────


class TestCompareTracks:
    def test_identity_self_comparison_is_neutral(self, tmp_path):
        """The feature's neutral contract: a file vs ITSELF → all deltas 0.

        Same ±0.2 dB tolerance philosophy as Phase A's identity tests.
        """
        path = tmp_path / "master.wav"
        _write_wav(path, _master_program())

        result = compare_tracks(path, path)

        assert result.status == "ready"
        assert result.band_deltas_db is not None
        assert all(abs(d) <= 0.2 for d in result.band_deltas_db)
        assert abs(result.lufs_delta_db) <= 0.2
        assert abs(result.crest_delta_db) <= 0.2
        assert abs(result.lra_delta_lu) <= 0.2
        # Correlation has no delta field; equality of the two sides is
        # the invariance check.
        assert result.master_correlation is not None
        assert abs(result.master_correlation - result.reference_correlation) < 0.01

    def test_spectral_diff_hints_and_loudness_deltas(self, tmp_path):
        """Master (loud 6k) vs reference (loud 1k) → deltas point at both."""
        master_path = tmp_path / "master.wav"
        ref_path = tmp_path / "ref.wav"
        _write_wav(master_path, _master_program())
        _write_wav(ref_path, _reference_program())

        result = compare_tracks(master_path, ref_path)

        assert result.status == "ready"
        assert result.target_bands_hz == TARGET_BANDS_HZ
        assert len(result.master_band_levels_db) == len(TARGET_BANDS_HZ)
        assert len(result.reference_band_levels_db) == len(TARGET_BANDS_HZ)
        assert len(result.band_deltas_db) == len(TARGET_BANDS_HZ)
        # Deltas carry one decimal like the rest of the engine outputs
        assert all(d == round(d, 1) for d in result.band_deltas_db)

        # Reference has LESS 6 kHz energy (master carries the bigger tone)
        sixk_delta = result.band_deltas_db[BAND_6K]
        assert sixk_delta < 0
        assert -20 < sixk_delta < -8
        assert result.biggest_decrease_band_hz == 6000.0

        # Reference has MORE 1 kHz energy (the "too quiet here" hint)
        onek_delta = result.band_deltas_db[BAND_1K]
        assert onek_delta > 8
        assert onek_delta < 20
        assert result.biggest_increase_band_hz == 1000.0

        # Master is louder (bigger 6 kHz tone, further boosted by the
        # BS.1770 k-weighting shelf) → reference − master is negative.
        assert result.lufs_delta_db is not None
        assert -8.0 < result.lufs_delta_db < 0.0
        # Near-identical dynamics on both programs → tiny crest/LRA deltas
        assert result.crest_delta_db is not None
        assert abs(result.crest_delta_db) < 3.0
        assert abs(result.lra_delta_lu) < 0.5

    def test_no_positive_delta_means_no_increase_hint(self, tmp_path):
        """Master has MORE energy in every band → no 'too quiet' hint."""
        master_path = tmp_path / "master.wav"
        ref_path = tmp_path / "ref.wav"
        _write_wav(master_path, _reference_program())
        # Quieter in BOTH toned bands (0.02 vs 0.05 @6k / 0.25 @1k)
        _write_wav(ref_path, _noise_with_tones(amp_6k=0.02, amp_1k=0.02))

        result = compare_tracks(master_path, ref_path)

        assert result.status == "ready"
        # The reference is quieter in both toned bands → no positive delta
        assert result.biggest_increase_band_hz is None
        assert result.biggest_decrease_band_hz == 1000.0

    def test_missing_master_returns_no_master(self, tmp_path):
        ref = tmp_path / "ref.wav"
        _write_wav(ref, _reference_program())

        none_path = compare_tracks(None, ref)
        assert none_path.status == "no_master"
        assert none_path.message

        absent = compare_tracks(tmp_path / "absent.wav", ref)
        assert absent.status == "no_master"
        assert absent.message

    def test_missing_reference_returns_no_reference(self, tmp_path):
        master = tmp_path / "master.wav"
        _write_wav(master, _master_program())

        none_path = compare_tracks(master, None)
        assert none_path.status == "no_reference"
        assert none_path.message

        absent = compare_tracks(master, tmp_path / "absent.wav")
        assert absent.status == "no_reference"
        assert absent.message

    def test_mono_reference_keeps_correlation_none(self, tmp_path):
        """A mono reference has no stereo image to judge → None, still ready."""
        master = tmp_path / "master.wav"
        ref = tmp_path / "ref_mono.wav"
        _write_wav(master, _master_program())
        _write_wav(ref, _reference_program()[0])  # 1D mono downmix

        result = compare_tracks(master, ref)

        assert result.status == "ready"
        assert result.reference_correlation is None
        assert result.master_correlation is not None
        # Measurable axes still fully populated
        assert len(result.band_deltas_db) == len(TARGET_BANDS_HZ)
        assert result.lufs_delta_db is not None

    def test_undecodable_file_returns_error(self, tmp_path):
        master = tmp_path / "master.wav"
        ref = tmp_path / "ref.wav"
        _write_wav(master, _master_program())
        ref.write_bytes(b"this is not audio")

        result = compare_tracks(master, ref)

        assert result.status == "error"
        assert result.message


# ── Route tests: POST /session/{id}/reference-file ─────────────────────


class TestReferenceFileUpload:
    def test_upload_valid_wav_sets_reference(self):
        session_id = _make_session()
        resp = _upload_reference(session_id, filename="mi_ref.wav")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        session = sessions[session_id]
        assert Path(data["reference_path"]).exists()
        assert data["reference_filename"] == "mi_ref.wav"
        assert session.reference_path == data["reference_path"]
        assert session.reference_filename == "mi_ref.wav"

    def test_upload_to_unknown_session_returns_404(self):
        resp = _upload_reference("does-not-exist")
        assert resp.status_code == 404

    def test_upload_invalid_suffix_rejected(self):
        session_id = _make_session()
        resp = _upload_reference(session_id, filename="ref.txt", content=b"whatever")
        assert resp.status_code == 400
        assert resp.json()["detail"] != ""
        assert sessions[session_id].reference_path is None

    def test_upload_oversize_rejected(self, monkeypatch):
        session_id = _make_session()
        monkeypatch.setattr(settings, "max_file_size_mb", 0)
        resp = _upload_reference(session_id)
        assert resp.status_code == 413
        assert sessions[session_id].reference_path is None

    def test_replace_overwrites_and_clears_comparison(self):
        session_id = _make_session()
        first = _upload_reference(session_id, filename="first.wav")
        assert first.status_code == 200, first.text
        first_path = sessions[session_id].reference_path
        sessions[session_id].reference_comparison = ReferenceComparison(
            status="ready", reference_filename="first.wav"
        )
        first_content = Path(first_path).read_bytes()

        second = _upload_reference(
            session_id, filename="second.wav", content=_wav_bytes(_master_program())
        )
        assert second.status_code == 200, second.text
        session = sessions[session_id]
        assert session.reference_filename == "second.wav"
        assert session.reference_comparison is None  # stale comparison dropped
        assert Path(session.reference_path).read_bytes() != first_content

    def test_replace_with_new_suffix_removes_old_file(self):
        session_id = _make_session()
        first = _upload_reference(session_id, filename="ref.wav")
        assert first.status_code == 200, first.text
        first_path = sessions[session_id].reference_path

        second = _upload_reference(
            session_id, filename="ref.mp3", content=b"FAKE-MP3-BYTES"
        )
        assert second.status_code == 200, second.text
        session = sessions[session_id]
        assert session.reference_path != first_path
        assert not Path(first_path).exists(), "old suffix file must be removed"
        assert session.reference_filename == "ref.mp3"


# ── Route tests: POST /session/{id}/compare-reference ──────────────────


def _stub_compare(monkeypatch, captured=None):
    """Stub compare_tracks at the module level (the lazy-wrapper slot)."""
    import audiomind.api.mastering as mastering_mod

    calls = {"n": 0}

    def _fake(master_path, reference_path):
        calls["n"] += 1
        if captured is not None:
            captured["master_path"] = master_path
            captured["reference_path"] = reference_path
        return ReferenceComparison(
            status="ready", reference_filename="will-be-overwritten"
        )

    monkeypatch.setattr(mastering_mod, "compare_tracks", _fake)
    return calls


class TestCompareReference:
    def test_unknown_session_returns_404(self):
        resp = client.post("/api/session/does-not-exist/compare-reference")
        assert resp.status_code == 404

    def test_no_reference_returns_400(self):
        session_id = _make_session()
        _make_mastered(session_id)
        resp = client.post(f"/api/session/{session_id}/compare-reference")
        assert resp.status_code == 400
        assert "reference" in resp.json()["detail"].lower()

    def test_no_master_returns_400(self):
        session_id = _make_session()
        _upload_reference(session_id)
        resp = client.post(f"/api/session/{session_id}/compare-reference")
        assert resp.status_code == 400
        assert "master" in resp.json()["detail"].lower()

    def test_compare_ready_stores_and_returns(self, monkeypatch):
        session_id = _make_session()
        _make_mastered(session_id)
        _upload_reference(session_id, filename="master_ref.wav")
        captured = {}
        _stub_compare(monkeypatch, captured)

        resp = client.post(f"/api/session/{session_id}/compare-reference")
        assert resp.status_code == 200, resp.text
        data = resp.json()
        session = sessions[session_id]

        assert data["status"] == "ready"
        assert session.reference_comparison is not None
        # The payload carries the ORIGINAL uploaded filename (the stored
        # path is session-scoped).
        assert session.reference_comparison.reference_filename == "master_ref.wav"
        assert captured["reference_path"].endswith(f"{session_id}_reference.wav")
        assert captured["master_path"] == session.mastered_path

    def test_compare_cached_second_call_skips(self, monkeypatch):
        """Cache short-circuit: an existing comparison is served as-is."""
        session_id = _make_session()
        _make_mastered(session_id)
        _upload_reference(session_id)
        calls = _stub_compare(monkeypatch)

        first = client.post(f"/api/session/{session_id}/compare-reference")
        assert first.status_code == 200, first.text
        second = client.post(f"/api/session/{session_id}/compare-reference")
        assert second.status_code == 200, second.text

        assert calls["n"] == 1, "cache hit must not re-run the comparison"
        assert first.json() == second.json()


# ── Route tests: GET /session/{id}/audio/reference-file ────────────────


class TestReferenceFileAudio:
    def test_404_when_no_reference(self):
        session_id = _make_session()
        resp = client.get(f"/api/session/{session_id}/audio/reference-file")
        assert resp.status_code == 404

    def test_unknown_session_returns_404(self):
        resp = client.get("/api/session/does-not-exist/audio/reference-file")
        assert resp.status_code == 404

    def test_serves_uploaded_file(self):
        """Also proves the literal route beats /audio/{audio_type} (which
        would 400 on an unknown audio_type)."""
        session_id = _make_session()
        content = _wav_bytes(_reference_program())
        up = _upload_reference(session_id, filename="ref.wav", content=content)
        assert up.status_code == 200, up.text

        resp = client.get(f"/api/session/{session_id}/audio/reference-file")
        assert resp.status_code == 200
        assert resp.content == content
        assert resp.headers["content-type"] == "audio/wav"
        assert "ref.wav" in resp.headers["content-disposition"]