"""IFC declarations remain distinct from geometry; missing quantities stay unknown."""
import hashlib
import math
from pathlib import Path
import ifcopenshell
import ifcopenshell.geom
import ifcopenshell.util.element as element_util
import ifcopenshell.util.unit as unit_util
from models import Element, Mesh, ModelSnapshot, QuantityEvidence
from tessellation import read_tessellation, geometry_fingerprint

MAX_ELEMENTS = 5000
MAX_TRIANGLES = 750_000
QUANTITIES = {
    "volume": ("VOLUMEUNIT", "m³", ("NetVolume", "GrossVolume")),
    "area": ("AREAUNIT", "m²", ("NetArea", "NetSideArea", "NetFloorArea", "GrossArea", "GrossSideArea", "GrossFloorArea")),
    "width": ("LENGTHUNIT", "m", ("Width",)),
    "height": ("LENGTHUNIT", "m", ("Height", "Depth")),
    "length": ("LENGTHUNIT", "m", ("Length",)),
}

def unit_factor(unit, kind, depth=0):
    """Honor conversion factors, including custom units with nonstandard names."""
    if depth > 8 or not unit or unit.UnitType != kind:
        raise ValueError("Invalid or recursive unit definition")
    power, expected = {"LENGTHUNIT": (1, "METRE"), "AREAUNIT": (2, "SQUARE_METRE"), "VOLUMEUNIT": (3, "CUBIC_METRE")}[kind]
    if unit.is_a("IfcSIUnit") and unit.Name == expected:
        return unit_util.get_prefix_multiplier(unit.Prefix) ** power
    if unit.is_a("IfcConversionBasedUnit") and not unit.is_a("IfcConversionBasedUnitWithOffset"):
        conversion = unit.ConversionFactor
        value = float(conversion.ValueComponent.wrappedValue)
        if not math.isfinite(value) or value <= 0:
            raise ValueError("Invalid conversion factor")
        return value * unit_factor(conversion.UnitComponent, kind, depth + 1)
    raise ValueError("Unsupported unit definition")

def extract_quantities(model, element):
    """Occurrence QTO only: type quantities are not instance measurements."""
    declared = []
    for relation in getattr(element, "IsDefinedBy", ()):
        if not relation.is_a("IfcRelDefinesByProperties"):
            continue
        definition = relation.RelatingPropertyDefinition
        if definition.is_a("IfcElementQuantity"):
            declared.extend((definition.Name, q) for q in (definition.Quantities or ()))
    result, warnings = {}, []
    for key, (kind, symbol, aliases) in QUANTITIES.items():
        result[key] = None
        for alias in aliases:
            matches = [(pset, q) for pset, q in declared if q.Name == alias]
            if not matches:
                continue
            if len(matches) > 1:
                warnings.append(f"Ambiguous {alias}: multiple occurrence quantities; excluded from takeoff.")
                break
            pset, quantity = matches[0]
            expected_class = {"VOLUMEUNIT": "IfcQuantityVolume", "AREAUNIT": "IfcQuantityArea", "LENGTHUNIT": "IfcQuantityLength"}[kind]
            if not quantity.is_a(expected_class):
                warnings.append(f"{alias} has an incompatible quantity type; excluded.")
                break
            unit = quantity.Unit or unit_util.get_project_unit(model, kind)
            if not unit or unit.UnitType != kind:
                warnings.append(f"No valid {kind} for {alias}; quantity excluded.")
                break
            raw = float(quantity[3])
            try:
                factor = unit_factor(unit, kind)
                value = raw * factor
                if not math.isfinite(value) or value <= 0:
                    raise ValueError("non-positive or non-finite quantity")
            except (ValueError, TypeError, AttributeError, ZeroDivisionError):
                warnings.append(f"Invalid {alias}; quantity excluded.")
                break
            result[key] = QuantityEvidence(value=value, unit=symbol, raw_value=raw,
                raw_unit=unit_util.get_unit_symbol(unit), factor=factor,
                source=f"#{quantity.id()} / {pset}.{alias}",
                basis="net" if alias.startswith("Net") else "gross" if alias.startswith("Gross") else "declared")
            break
    if element.is_a("IfcDoor") or element.is_a("IfcWindow"):
        for key, attribute in (("width", "OverallWidth"), ("height", "OverallHeight")):
            raw = getattr(element, attribute, None)
            unit = unit_util.get_project_unit(model, "LENGTHUNIT")
            if result[key] is None and raw and unit:
                try:
                    factor = unit_factor(unit, "LENGTHUNIT")
                except ValueError:
                    warnings.append(f"Invalid unit for {attribute}; dimension excluded.")
                    continue
                value = float(raw) * factor
                if math.isfinite(value) and value > 0:
                    result[key] = QuantityEvidence(value=value, unit="m", raw_value=raw,
                        raw_unit=unit_util.get_unit_symbol(unit), factor=factor,
                        source=f"#{element.id()} / {element.is_a()}.{attribute}", basis="declared")
    return result, warnings

def parse_ifc_file(file_path: str, filename: str | None = None) -> ModelSnapshot:
    path = Path(file_path)
    model = ifcopenshell.open(str(path))
    # A single query includes subclasses without double-counting IfcWallStandardCase.
    entities = sorted(model.by_type("IfcElement"), key=lambda el: el.id())
    entities = [el for el in entities if not el.is_a("IfcFeatureElement")]
    if not entities:
        raise ValueError("This IFC contains no physical elements. No sample data has been substituted.")
    if len(entities) > MAX_ELEMENTS:
        raise ValueError(f"This review supports up to {MAX_ELEMENTS:,} elements. Export a smaller discipline model.")
    ids = [el.GlobalId for el in entities]
    if len(ids) != len(set(ids)) or any(not value for value in ids):
        raise ValueError("Missing or duplicate IFC GlobalIds prevent reliable element identity and revision matching.")
    settings = ifcopenshell.geom.settings()
    settings.set("use-world-coords", True)
    elements, warnings, triangles = [], [], 0
    if not unit_util.get_project_unit(model, "LENGTHUNIT"):
        raise ValueError("The IFC has no project length unit. Geometry cannot be interpreted reliably.")
    length_scale = unit_factor(unit_util.get_project_unit(model, "LENGTHUNIT"), "LENGTHUNIT")
    for entity in entities:
        quantities, element_warnings = extract_quantities(model, entity)
        materials = sorted({m.Name for m in element_util.get_materials(entity) if m.Name})
        container = element_util.get_container(entity)
        elevation = float(getattr(container, "Elevation", None) or 0) * length_scale
        mesh, geometry_hash = None, None
        if entity.Representation:
            try:
                tessellation = read_tessellation(entity, length_scale)
                if tessellation:
                    vertices, faces = tessellation.vertices, tessellation.faces
                else:
                    shape = ifcopenshell.geom.create_shape(settings, entity)
                    vertices, faces = list(shape.geometry.verts), list(shape.geometry.faces)
                geometry_hash = geometry_fingerprint(vertices, faces)
                if triangles + len(faces) // 3 <= MAX_TRIANGLES:
                    mesh = Mesh(vertices=vertices, faces=faces)
                    triangles += len(faces) // 3
                else:
                    element_warnings.append("Preview triangle budget reached. Quantities remain included.")
            except (RuntimeError, ValueError):
                element_warnings.append("Geometry could not be rendered. Declared quantities remain included.")
        else:
            element_warnings.append("No geometric representation in the source IFC.")
        elements.append(Element(id=entity.GlobalId, express_id=entity.id(),
            name=entity.Name or f"{entity.is_a()} #{entity.id()}", type=entity.is_a(),
            storey=(container.Name or "Unnamed level") if container else "Unassigned",
            elevation=elevation, materials=materials, quantities=quantities,
            mesh=mesh, geometry_hash=geometry_hash, warnings=element_warnings))
    if any(e.mesh is None for e in elements):
        warnings.append(f"{sum(e.mesh is None for e in elements)} elements have no preview geometry; all remain in the review.")
    projects = model.by_type("IfcProject")
    units = {}
    for kind in ("LENGTHUNIT", "AREAUNIT", "VOLUMEUNIT"):
        unit = unit_util.get_project_unit(model, kind)
        units[kind] = unit_util.get_unit_symbol(unit) if unit else "not declared"
    return ModelSnapshot(filename=filename or path.name,
        project_name=projects[0].Name if projects and projects[0].Name else path.stem,
        schema_name=model.schema, model_hash=hashlib.sha256(path.read_bytes()).hexdigest(),
        units=units, elements=elements, warnings=warnings)
