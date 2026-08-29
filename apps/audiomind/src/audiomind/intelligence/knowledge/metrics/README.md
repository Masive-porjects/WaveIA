# Knowledge / Metrics

## Propósito
Definir, estandarizar y documentar todas las métricas técnicas que AudioMind mide, calcula y reporta.

## Responsabilidad
- Especificar fórmulas, unidades y referencias normativas (ITU-R BS.1770-4, EBU R128, AES TD1004)
- Definir thresholds de alerta/calidad por métrica
- Documentar cómo se calcula cada métrica en el backend (librosa, pyloudnorm, pedalboard)
- Servir como contrato entre analizador, motor DSP, y futuros modelos ML

## Estructura de archivo
```
metrics/
├── lufs-integrated.md
├── lufs-short-term.md
├── lufs-momentary.md
├── true-peak.md
├── dynamic-range.md
├── crest-factor.md
├── spectral-centroid.md
├── spectral-bandwidth.md
├── spectral-flatness.md
├── zero-crossing-rate.md
├── mfcc.md
├── tempo-bpm.md
├── key-detection.md
├── stereo-width.md
├── correlation.md
└── waveform-stats.md
```

## Ejemplos de contenido
- **lufs-integrated.md**: "ITU-R BS.1770-4. K-weighting filter → mean square → -0.691 offset. Target: -14 LUFS (streaming). Alarm: > -9 LUFS (over-compressed). Cálculo: `pyloudnorm.Meter(sr).integrated_loudness(audio)`."
- **dynamic-range.md**: "EBU Tech 3342 / AES TD1004. DR = Pk (dBFS) - RMS (dBFS) en ventana 3s. Target: > 6 dB streaming, > 8 dB CD. Alarm: < 4 dB (over-limited)."

## Futuras integraciones
- **AudioAnalyzer**: Implementa cada métrica según su spec
- **Preset Recommender (XGBoost)**: Features = subset de métricas
- **Genre Detector (CNN)**: Input incluye métricas espectrales + temporales
- **Quality Gate**: Valida output contra thresholds en metrics/
- **RAG**: Responde "¿qué es crest factor y por qué importa?"