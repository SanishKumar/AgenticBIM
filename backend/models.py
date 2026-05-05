from pydantic import BaseModel
from typing import List, Optional

class ElementData(BaseModel):
    id: str
    type: str # e.g., "IfcWall", "IfcDoor", "IfcSlab"
    material: str
    volume_m3: Optional[float] = 0.0
    area_m2: Optional[float] = 0.0
    width_m: Optional[float] = 0.0
    height_m: Optional[float] = 0.0
    length_m: Optional[float] = 0.0

class IFCDataExtraction(BaseModel):
    filename: str
    elements: List[ElementData]
    total_elements: int

class ReportResponse(BaseModel):
    markdown_report: str
    deterministic_data: dict
