"""
Zone Mapper - Maps screen regions to musical zones.
Used by drums gesture for zone detection.
"""
import numpy as np
from typing import List, Tuple
from dataclasses import dataclass


@dataclass
class Zone:
    """Rectangular zone in normalized coordinates (0-1)."""
    x_min: float
    x_max: float
    y_min: float
    y_max: float
    label: str
    value: any  # Note, CC, or other associated value


class ZoneMapper:
    """
    Maps normalized hand position to zones.

    Can create horizontal strips (drums), vertical strips,
    or grid layouts.
    """

    def __init__(self):
        self.zones: List[Zone] = []

    def add_horizontal_strips(
        self,
        num_zones: int,
        values: List,
        labels: List[str] | None = None,
        y_range: Tuple[float, float] = (0.0, 1.0),
    ) -> None:
        """Create horizontal zones (left to right)."""
        self.zones.clear()
        for i in range(num_zones):
            x_min = i / num_zones
            x_max = (i + 1) / num_zones
            self.zones.append(Zone(
                x_min=x_min,
                x_max=x_max,
                y_min=y_range[0],
                y_max=y_range[1],
                label=labels[i] if labels else f"Zone {i}",
                value=values[i] if i < len(values) else i,
            ))

    def add_vertical_strips(
        self,
        num_zones: int,
        values: List,
        labels: List[str] | None = None,
        x_range: Tuple[float, float] = (0.0, 1.0),
    ) -> None:
        """Create vertical zones (top to bottom)."""
        self.zones.clear()
        for i in range(num_zones):
            y_min = i / num_zones
            y_max = (i + 1) / num_zones
            self.zones.append(Zone(
                x_min=x_range[0],
                x_max=x_range[1],
                y_min=y_min,
                y_max=y_max,
                label=labels[i] if labels else f"Zone {i}",
                value=values[i] if i < len(values) else i,
            ))

    def get_zone(self, x: float, y: float) -> Zone | None:
        """Get zone containing point (x, y)."""
        for zone in self.zones:
            if zone.x_min <= x < zone.x_max and zone.y_min <= y < zone.y_max:
                return zone
        return None

    def get_zone_index(self, x: float, y: float) -> int:
        """Get zone index containing point, or -1."""
        for i, zone in enumerate(self.zones):
            if zone.x_min <= x < zone.x_max and zone.y_min <= y < zone.y_max:
                return i
        return -1