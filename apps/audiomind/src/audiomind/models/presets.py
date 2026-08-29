from pydantic import BaseModel


class PresetParameter(BaseModel):
    name: str
    min_value: float
    max_value: float
    default: float
    step: float = 0.1
    unit: str = ""


class PresetInfo(BaseModel):
    name: str
    display_name: str
    style: str
    description: str
    recommended_genres: list[str]
    parameters: list[PresetParameter]
