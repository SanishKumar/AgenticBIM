"""Hand-checkable geometry fixtures independent of the native CAD kernel."""
import numpy as np
import pytest
import ifcopenshell
import ifcopenshell.api
from tessellation import read_tessellation, geometry_fingerprint


def body_model():
    model = ifcopenshell.file(schema="IFC4")
    ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcProject")
    context = ifcopenshell.api.run("context.add_context", model, context_type="Model")
    body = ifcopenshell.api.run("context.add_context", model, context_type="Model",
        context_identifier="Body", target_view="MODEL_VIEW", parent=context)
    wall = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcWall")
    representation = model.create_entity("IfcShapeRepresentation", ContextOfItems=body,
        RepresentationIdentifier="Body", RepresentationType="SweptSolid", Items=[])
    wall.Representation = model.create_entity("IfcProductDefinitionShape", Representations=[representation])
    return model, wall, representation


def rectangle(model, depth=3.):
    profile = model.create_entity("IfcRectangleProfileDef", ProfileType="AREA", XDim=2., YDim=4.)
    direction = model.create_entity("IfcDirection", (0., 0., 1.))
    return model.create_entity("IfcExtrudedAreaSolid", SweptArea=profile, ExtrudedDirection=direction, Depth=depth)


def xyz(mesh):
    return np.asarray(mesh.vertices).reshape(-1, 3)


def test_rectangle_profile_and_solid_positions_are_composed_before_unit_conversion():
    model, wall, representation = body_model()
    solid = rectangle(model, 3000.)
    solid.SweptArea.XDim = 2000.
    solid.SweptArea.YDim = 4000.
    solid.SweptArea.Position = model.create_entity("IfcAxis2Placement2D",
        Location=model.create_entity("IfcCartesianPoint", (1000., 2000.)),
        RefDirection=model.create_entity("IfcDirection", (0., 1.)))
    solid.Position = model.create_entity("IfcAxis2Placement3D",
        Location=model.create_entity("IfcCartesianPoint", (0., 0., 500.)))
    wall.ObjectPlacement = model.create_entity("IfcLocalPlacement", RelativePlacement=model.create_entity(
        "IfcAxis2Placement3D", Location=model.create_entity("IfcCartesianPoint", (10000., 0., 0.))))
    representation.Items = [solid]
    mesh = read_tessellation(wall, .001)
    assert len(mesh.faces) == 36
    assert xyz(mesh).min(axis=0) == pytest.approx([9., 1., .5])
    assert xyz(mesh).max(axis=0) == pytest.approx([13., 3., 3.5])


def test_oblique_extrusion_normalizes_direction_and_does_not_move_profile_with_it():
    model, wall, representation = body_model()
    solid = rectangle(model, 5.)
    solid.ExtrudedDirection.DirectionRatios = (3., 0., 4.)
    representation.Items = [solid]
    vertices = xyz(read_tessellation(wall, 1.))
    assert vertices[0] == pytest.approx([-1., -2., 0.])
    assert vertices[4] - vertices[0] == pytest.approx([3., 0., 4.])


def test_convex_polyline_profile_extrudes_but_concave_profile_is_delegated():
    model, wall, representation = body_model()
    solid = rectangle(model)
    curve = model.create_entity("IfcPolyline", Points=[model.create_entity("IfcCartesianPoint", p)
        for p in [(0., 0.), (2., 0.), (1., 1.), (0., 0.)]])
    solid.SweptArea = model.create_entity("IfcArbitraryClosedProfileDef", ProfileType="AREA", OuterCurve=curve)
    representation.Items = [solid]
    assert len(read_tessellation(wall, 1.).faces) == 24
    curve.Points = [model.create_entity("IfcCartesianPoint", p)
        for p in [(0., 0.), (2., 0.), (1., .5), (2., 2.), (0., 2.), (0., 0.)]]
    assert read_tessellation(wall, 1.) is None


def test_nested_mappings_apply_rotation_translation_and_nonuniform_scale():
    model, wall, representation = body_model()
    solid = rectangle(model)
    source_rep = model.create_entity("IfcShapeRepresentation", ContextOfItems=representation.ContextOfItems,
        RepresentationIdentifier="Body", RepresentationType="SweptSolid", Items=[solid])
    origin = model.create_entity("IfcAxis2Placement3D", Location=model.create_entity("IfcCartesianPoint", (0., 0., 0.)))
    source = model.create_entity("IfcRepresentationMap", MappingOrigin=origin, MappedRepresentation=source_rep)
    target = model.create_entity("IfcCartesianTransformationOperator3DnonUniform",
        LocalOrigin=model.create_entity("IfcCartesianPoint", (10., 20., 30.)), Scale=2., Scale2=3., Scale3=4.)
    mapped = model.create_entity("IfcMappedItem", MappingSource=source, MappingTarget=target)
    middle_rep = model.create_entity("IfcShapeRepresentation", ContextOfItems=representation.ContextOfItems,
        RepresentationIdentifier="Body", RepresentationType="MappedRepresentation", Items=[mapped])
    outer_source = model.create_entity("IfcRepresentationMap", MappingOrigin=origin, MappedRepresentation=middle_rep)
    outer_target = model.create_entity("IfcCartesianTransformationOperator3D",
        LocalOrigin=model.create_entity("IfcCartesianPoint", (100., 0., 0.)),
        Axis1=model.create_entity("IfcDirection", (0., 1., 0.)),
        Axis2=model.create_entity("IfcDirection", (-1., 0., 0.)))
    representation.Items = [model.create_entity("IfcMappedItem", MappingSource=outer_source, MappingTarget=outer_target)]
    vertices = xyz(read_tessellation(wall, 1.))
    assert vertices.min(axis=0) == pytest.approx([74., 8., 30.])
    assert vertices.max(axis=0) == pytest.approx([86., 12., 42.])
    # A cycle must decline safely, rather than recurse indefinitely.
    middle_rep.Items = representation.Items
    assert read_tessellation(wall, 1.) is None


def test_openings_and_mixed_unsupported_items_never_produce_a_partial_body():
    model, wall, representation = body_model()
    solid = rectangle(model)
    representation.Items = [solid, model.create_entity("IfcBoundingBox",
        Corner=model.create_entity("IfcCartesianPoint", (0., 0., 0.)), XDim=1., YDim=1., ZDim=1.)]
    assert read_tessellation(wall, 1.) is None
    representation.Items = [solid]
    opening = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcOpeningElement")
    model.create_entity("IfcRelVoidsElement", GlobalId=ifcopenshell.guid.new(),
        RelatingBuildingElement=wall, RelatedOpeningElement=opening)
    assert read_tessellation(wall, 1.) is None


def test_invalid_pnindex_and_placement_cycles_decline_safely():
    model, wall, representation = body_model()
    item = model.create_entity("IfcTriangulatedFaceSet", Coordinates=model.create_entity("IfcCartesianPointList3D",
        CoordList=[(0., 0., 0.), (1., 0., 0.), (0., 1., 0.)]), CoordIndex=[(1, 2, 4)], PnIndex=[1, 2, 3])
    representation.Items = [item]
    assert read_tessellation(wall, 1.) is None
    item.CoordIndex = [(1, 2, 3)]
    assert read_tessellation(wall, 1.) is not None
    local = model.create_entity("IfcLocalPlacement", RelativePlacement=model.create_entity("IfcAxis2Placement3D",
        Location=model.create_entity("IfcCartesianPoint", (0., 0., 0.))))
    local.PlacementRelTo = local
    wall.ObjectPlacement = local
    assert read_tessellation(wall, 1.) is None


def test_geometry_fingerprint_ignores_mesh_index_order_and_winding_but_detects_displacement():
    points = [0., 0., 0., 1., 0., 0., 1., 1., 0., 0., 1., 0.]
    first = geometry_fingerprint(points, [0, 1, 2, 0, 2, 3])
    permuted = np.asarray(points).reshape(-1, 3)[[2, 3, 0, 1]].ravel().tolist()
    assert first == geometry_fingerprint(permuted, [1, 0, 2, 0, 3, 2])
    points[0] += .001
    assert first != geometry_fingerprint(points, [0, 1, 2, 0, 2, 3])
    with pytest.raises(ValueError):
        geometry_fingerprint(points, [0, 1, 9])
