"""
AudioMind Intelligence — Knowledge Core Schemas

Modelos Pydantic que definen la estructura de datos del Knowledge Core.
SOLO definen esquemas — no conectan a BD, no implementan lógica.

Módulos:
- preset_knowledge: PresetKnowledge — presets de mastering
- plugin_knowledge: PluginKnowledge — plugins DSP
- genre_knowledge: GenreKnowledge — perfiles de género
- experiment_knowledge: ExperimentKnowledge — experimentos I+D
- idea_knowledge: IdeaKnowledge — ideas de producto/ingeniería
"""

from .preset_knowledge import PresetKnowledge, PluginRef, PresetMetrics, PresetGenreCompatibility
from .plugin_knowledge import PluginKnowledge, PluginParameter, SonicImpact, PluginInteraction, UsageExample
from .genre_knowledge import (
    GenreKnowledge, BPMRange, EnergyProfile, TonalBalance, DynamicsProfile,
    DSPRecommendation, PresetCompatibility, DetectionFeatures, ReferenceTrack, SubgenreVariant
)
from .experiment_knowledge import ExperimentKnowledge, ExperimentDesign, ExperimentChanges, ExperimentResults, TechnicalMetrics
from .idea_knowledge import IdeaKnowledge, IdeaReference

__all__ = [
    # Preset
    "PresetKnowledge", "PluginRef", "PresetMetrics", "PresetGenreCompatibility",
    # Plugin
    "PluginKnowledge", "PluginParameter", "SonicImpact", "PluginInteraction", "UsageExample",
    # Genre
    "GenreKnowledge", "BPMRange", "EnergyProfile", "TonalBalance", "DynamicsProfile",
    "DSPRecommendation", "PresetCompatibility", "DetectionFeatures", "ReferenceTrack", "SubgenreVariant",
    # Experiment
    "ExperimentKnowledge", "ExperimentDesign", "ExperimentChanges", "ExperimentResults", "TechnicalMetrics",
    # Idea
    "IdeaKnowledge", "IdeaReference",
]