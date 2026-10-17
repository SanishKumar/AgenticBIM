"""Linux integration checks for geometry that requires the native CAD kernel."""
import asyncio
import math
import sys
import numpy as np
import pytest
import ifcopenshell
import ifcopenshell.api
from limits import ImportLimits
from parser_process import parse_in_process
from tessellation import read_tessellation

pytestmark = pytest.mark.skipif(sys.platform != "linux", reason="Native geometry integration is required by Linux CI")


def model_and_body():
    model = ifcopenshell.file(schema="IFC4")
    ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcProject")
    units = [ifcopenshell.api.run("unit.add_si_unit", model, unit_type=kind)
        for kind in ("LENGTHUNIT", "AREAUNIT", "VOLUMEUNIT")]
    ifcopenshell.api.run("unit.assign_unit", model, units=units)
    context = ifcopenshell.api.run("context.add_context", model, context_type="Model")
    body = ifcopenshell.api.run("context.add_context", model, context_type="Model",
        context_identifier="Body", target_view="MODEL_VIEW", parent=context)
    return model, body


def parse(model, tmp_path):
    path = tmp_path / "native.ifc"
    model.write(str(path))

    async def connected():
        return False

    return asyncio.run(parse_in_process(path, "native.ifc", ImportLimits(), connected))


def volume(mesh):
    vertices = np.asarray(mesh.vertices).reshape(-1, 3)
    triangles = vertices[np.asarray(mesh.faces).reshape(-1, 3)]
    return abs(np.einsum("ij,ij->i", triangles[:, 0], np.cross(triangles[:, 1], triangles[:, 2])).sum()) / 6


def test_native_circle_and_mapped_instance_survive_the_isolated_worker(tmp_path):
    model, body = model_and_body()
    column = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcColumn")
    profile = model.create_entity("IfcCircleProfileDef", ProfileType="AREA", Radius=.5)
    rep = ifcopenshell.api.run("geometry.add_profile_representation", model, context=body, profile=profile, depth=3.)
    ifcopenshell.api.run("geometry.assign_representation", model, product=column, representation=rep)
    origin = model.create_entity("IfcAxis2Placement3D", Location=model.create_entity("IfcCartesianPoint", (0., 0., 0.)))
    mapping = model.create_entity("IfcRepresentationMap", MappingOrigin=origin, MappedRepresentation=rep)
    target = model.create_entity("IfcCartesianTransformationOperator3D",
        LocalOrigin=model.create_entity("IfcCartesianPoint", (10., 20., 0.)), Scale=1.)
    item = model.create_entity("IfcMappedItem", MappingSource=mapping, MappingTarget=target)
    mapped_rep = model.create_entity("IfcShapeRepresentation", ContextOfItems=body,
        RepresentationIdentifier="Body", RepresentationType="MappedRepresentation", Items=[item])
    second = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcColumn")
    ifcopenshell.api.run("geometry.assign_representation", model, product=second, representation=mapped_rep)
    assert read_tessellation(column, 1.) is None
    assert read_tessellation(second, 1.) is None
    result = parse(model, tmp_path)
    assert len(result.elements) == 2 and not result.warnings
    first_mesh, second_mesh = [element.mesh for element in result.elements]
    assert first_mesh and second_mesh
    assert volume(first_mesh) == pytest.approx(math.pi * .5**2 * 3, rel=.005)
    assert volume(second_mesh) == pytest.approx(volume(first_mesh), rel=1e-6)
    a, b = np.asarray(first_mesh.vertices).reshape(-1, 3), np.asarray(second_mesh.vertices).reshape(-1, 3)
    assert b.min(axis=0) - a.min(axis=0) == pytest.approx([10., 20., 0.], abs=1e-6)
    assert all(element.quantities["volume"] is None for element in result.elements)


def test_native_opening_is_subtracted_and_not_counted_as_a_physical_element(tmp_path):
    model, body = model_and_body()
    wall = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcWall")
    rep = ifcopenshell.api.run("geometry.add_wall_representation", model, context=body, length=4., height=3., thickness=.2)
    ifcopenshell.api.run("geometry.assign_representation", model, product=wall, representation=rep)
    ifcopenshell.api.run("geometry.edit_object_placement", model, product=wall)
    opening = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcOpeningElement")
    rep = ifcopenshell.api.run("geometry.add_wall_representation", model, context=body, length=1., height=2., thickness=.4)
    ifcopenshell.api.run("geometry.assign_representation", model, product=opening, representation=rep)
    placement = np.eye(4)
    placement[:3, 3] = [1., -.1, 0.]
    ifcopenshell.api.run("geometry.edit_object_placement", model, product=opening, matrix=placement)
    ifcopenshell.api.run("feature.add_feature", model, feature=opening, element=wall)
    assert read_tessellation(wall, 1.) is None
    result = parse(model, tmp_path)
    assert len(result.elements) == 1 and result.elements[0].id == wall.GlobalId
    assert not result.warnings
    mesh = result.elements[0].mesh
    assert mesh and volume(mesh) == pytest.approx((4 * 3 - 1 * 2) * .2, abs=1e-6)
    assert result.elements[0].quantities["volume"] is None
