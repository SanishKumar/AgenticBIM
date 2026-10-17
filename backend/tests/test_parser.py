from pathlib import Path
import io
import pytest
import ifcopenshell
import ifcopenshell.api
from fastapi.testclient import TestClient
from main import app
from ifc_parser import extract_quantities, parse_ifc_file, unit_factor
from tessellation import read_tessellation

FIXTURE = Path(__file__).resolve().parents[2] / "frontend/public/demo/northbank-r02.ifc"


def quantity_model(prefix=None):
    model = ifcopenshell.file(schema="IFC4")
    ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcProject")
    units = [ifcopenshell.api.run("unit.add_si_unit", model, unit_type=kind, prefix=prefix)
             for kind in ("LENGTHUNIT", "AREAUNIT", "VOLUMEUNIT")]
    ifcopenshell.api.run("unit.assign_unit", model, units=units)
    wall = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcWallStandardCase")
    qto = ifcopenshell.api.run("pset.add_qto", model, product=wall, name="Qto_WallBaseQuantities")
    return model, wall, qto


@pytest.mark.parametrize("prefix,values", [(None, {"Width": .2, "NetArea": 2., "NetVolume": .4}),
    ("MILLI", {"Width": 200., "NetArea": 2_000_000., "NetVolume": 400_000_000.})])
def test_unit_dimensions_normalize_independently(prefix, values):
    model, wall, qto = quantity_model(prefix)
    ifcopenshell.api.run("pset.edit_qto", model, qto=qto, properties=values)
    result, warnings = extract_quantities(model, wall)
    assert result["width"].value == pytest.approx(.2)
    assert result["area"].value == pytest.approx(2.)
    assert result["volume"].value == pytest.approx(.4)
    assert "Qto_WallBaseQuantities.NetVolume" in result["volume"].source
    assert not warnings


def test_explicit_quantity_unit_overrides_project_unit():
    model, wall, qto = quantity_model("MILLI")
    unit = ifcopenshell.api.run("unit.add_si_unit", model, unit_type="VOLUMEUNIT")
    quantity = model.create_entity("IfcQuantityVolume", Name="NetVolume", Unit=unit, VolumeValue=3.)
    qto.Quantities = [quantity]
    result, _ = extract_quantities(model, wall)
    assert result["volume"].value == 3.
    assert result["volume"].factor == 1.


def test_custom_conversion_factor_does_not_depend_on_unit_name():
    model, _, _ = quantity_model()
    metre = model.by_type("IfcSIUnit")[0]
    factor = model.create_entity("IfcMeasureWithUnit", ValueComponent=model.create_entity("IfcLengthMeasure", .3048), UnitComponent=metre)
    dimensions = model.create_entity("IfcDimensionalExponents", 1,0,0,0,0,0,0)
    custom = model.create_entity("IfcConversionBasedUnit", Dimensions=dimensions, UnitType="LENGTHUNIT", Name="Custom foot", ConversionFactor=factor)
    assert unit_factor(custom, "LENGTHUNIT") == .3048


def test_missing_invalid_and_ambiguous_quantities_are_unknown():
    model, wall, qto = quantity_model()
    ifcopenshell.api.run("pset.edit_qto", model, qto=qto, properties={"NetVolume": -1.})
    result, warnings = extract_quantities(model, wall)
    assert result["volume"] is None and result["width"] is None
    assert warnings
    qto.Quantities = [model.create_entity("IfcQuantityVolume", Name="NetVolume", VolumeValue=2.), model.create_entity("IfcQuantityVolume", Name="NetVolume", VolumeValue=4.)]
    result, warnings = extract_quantities(model, wall)
    assert result["volume"] is None
    assert "Ambiguous" in warnings[0]


def test_ifc_subclasses_are_not_double_counted_and_empty_models_are_rejected(tmp_path):
    model, wall, _ = quantity_model()
    path = tmp_path / "wall.ifc"
    model.write(str(path))
    result = parse_ifc_file(str(path))
    assert len(result.elements) == 1
    assert result.elements[0].id == wall.GlobalId
    model.remove(wall)
    model.write(str(path))
    with pytest.raises(ValueError, match="no physical elements"):
        parse_ifc_file(str(path))


def test_duplicate_guids_are_rejected(tmp_path):
    model, wall, _ = quantity_model()
    other = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcWall")
    other.GlobalId = wall.GlobalId
    path = tmp_path / "duplicate.ifc"
    model.write(str(path))
    with pytest.raises(ValueError, match="duplicate"):
        parse_ifc_file(str(path))


def test_real_fixture_has_source_geometry_and_intentional_unknowns():
    result = parse_ifc_file(str(FIXTURE))
    assert len(result.elements) == 135
    assert all(e.mesh and len(e.mesh.faces) == 36 for e in result.elements)
    assert sum(e.quantities["volume"] is None for e in result.elements) == 1
    assert sum(not e.materials for e in result.elements) == 1
    assert not result.warnings


def test_tessellation_respects_object_placement_and_project_scale():
    model = ifcopenshell.open(str(FIXTURE))
    entity = model.by_type("IfcSlab")[0]
    original = read_tessellation(entity, 1.)
    origin = model.create_entity("IfcCartesianPoint", (1000.,2000.,3000.))
    axis = model.create_entity("IfcAxis2Placement3D", Location=origin)
    entity.ObjectPlacement = model.create_entity("IfcLocalPlacement", RelativePlacement=axis)
    shifted = read_tessellation(entity, .001)
    assert shifted.vertices[:3] == pytest.approx([original.vertices[0]*.001+1, original.vertices[1]*.001+2, original.vertices[2]*.001+3])


def test_api_returns_all_elements_and_rejects_bad_input(monkeypatch):
    with TestClient(app) as client:
        assert client.get("/api/health").status_code == 200
        assert client.post("/api/analyze", files={"file": ("wrong.txt", b"no")}).status_code == 400
        assert client.post("/api/analyze", files={"file": ("empty.ifc", b"")}).status_code == 422
        assert client.post("/api/analyze", files={"file": ("bad.ifc", b"garbage")}).status_code == 422
        response = client.post("/api/analyze", files={"file": ("northbank.ifc", FIXTURE.read_bytes())})
        assert response.status_code == 200
        assert len(response.json()["elements"]) == 135
        assert response.json()["source"] == "ifc"
        monkeypatch.setattr("main.MAX_UPLOAD_BYTES", 5)
        assert client.post("/api/analyze", files={"file": ("big.ifc", b"123456")}).status_code == 413
