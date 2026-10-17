"""Versioned boundary between IFC extraction and the review application."""
from typing import Literal
from pydantic import BaseModel, Field

class QuantityEvidence(BaseModel):
    value: float
    unit: Literal["m", "m²", "m³"]
    source: str
    raw_value: float
    raw_unit: str
    factor: float
    basis: Literal["net", "gross", "declared"]

class Mesh(BaseModel):
    vertices: list[float]
    faces: list[int]

class Element(BaseModel):
    id: str
    express_id: int
    name: str
    type: str
    storey: str
    elevation: float = 0
    materials: list[str] = Field(default_factory=list)
    quantities: dict[str, QuantityEvidence | None]
    mesh: Mesh | None = None
    geometry_hash: str | None = None
    warnings: list[str] = Field(default_factory=list)

class ModelSnapshot(BaseModel):
    version: Literal["1.0"] = "1.0"
    filename: str
    project_name: str
    schema_name: str
    model_hash: str
    source: Literal["ifc", "demo"] = "ifc"
    units: dict[str, str]
    elements: list[Element]
    warnings: list[str] = Field(default_factory=list)
