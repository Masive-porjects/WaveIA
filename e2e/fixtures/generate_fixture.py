#!/usr/bin/env python3
"""
Genera fixture de audio determinista para E2E tests.

Output: e2e/fixtures/test-audio.wav
- 3 segundos, 44.1 kHz, 16-bit PCM, stereo
- Señal: mix de senoidales 220Hz + 440Hz + 880Hz con envelope
"""

import numpy as np
import soundfile as sf
from pathlib import Path

def generate_test_audio(output_path: str = "test-audio.wav"):
    SR = 44100
    DUR = 3.0  # segundos

    # Time axis
    t = np.linspace(0, DUR, int(SR * DUR), endpoint=False)

    # Señal: mezcla de armónicos (220Hz fundamental + octavas)
    # 220Hz (A3) + 440Hz (A4) + 880Hz (A5) con amplitudes descendentes
    sig = (
        0.35 * np.sin(2 * np.pi * 220 * t) +   # Fundamental
        0.25 * np.sin(2 * np.pi * 440 * t) +   # Octava 1
        0.15 * np.sin(2 * np.pi * 880 * t) +   # Octava 2
        0.08 * np.sin(2 * np.pi * 1760 * t)    # Octava 3
    )

    # Envelope ADSR simplificado: attack 50ms, decay natural, release final 50ms
    attack_samples = int(0.05 * 44100)
    release_samples = int(0.05 * 44100)
    total_samples = len(sig)

    env = np.ones(total_samples)
    # Attack
    if attack_samples > 0:
        env[:attack_samples] = np.linspace(0, 1, attack_samples)
    # Release
    if release_samples > 0:
        env[-release_samples:] = np.linspace(1, 0, release_samples)

    sig = sig * env

    # Stereo: L=full, R=0.95 (ligero ancho)
    stereo = np.stack([sig, sig * 0.95], axis=1).astype(np.float32)

    # Normalize to prevent clipping
    peak = np.max(np.abs(stereo))
    if peak > 0.95:
        stereo = stereo * (0.95 / peak)

    # Write 16-bit PCM WAV
    output_path = Path(__file__).parent / output_path
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(output_path), stereo, 44100, subtype='PCM_16')

    print(f"[Fixture] Generated: {output_path}")
    print(f"[Fixture] Duration: {DUR}s, Sample Rate: {SR}Hz, Channels: 2")
    print(f"[Fixture] Peak level: {np.max(np.abs(stereo)):.3f}")


if __name__ == "__main__":
    import numpy as np
    import soundfile as sf
    from pathlib import Path

    generate_test_audio("test-audio.wav")