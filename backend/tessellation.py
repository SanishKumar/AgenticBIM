"""Exact, bounded IFC preview path that does not require a native CAD kernel.

Supports convex planar face sets, mapped instances, and straight extrusions of
rectangles or convex polyline profiles. Any unsupported item rejects the whole
body. Voids, CSG, curves and tapered solids are delegated to IfcOpenShell.
Preview geometry is never used as a substitute for declared quantities.
"""
import hashlib
import numpy as np
import ifcopenshell.util.placement as placement
from models import Mesh

HASH_PREFIX = "mesh-v2-1um:"
MAX_DIRECT_TRIANGLES = 750_000


def geometry_fingerprint(vertices, faces) -> str:
    """Triangle surface in world metres, quantized to 1 µm.

    Independent of vertex indices, triangle order and winding; deliberately not
    invariant to re-triangulation. The version prefix prevents legacy hashes
    from being presented as comparable evidence.
    """
    points = np.asarray(vertices, dtype=float).reshape(-1, 3)
    indexes = np.asarray(faces, dtype=np.int64).reshape(-1, 3)
    if (not len(points) or not len(indexes) or not np.isfinite(points).all()
            or np.max(np.abs(points)) > 1e9 or indexes.min() < 0 or indexes.max() >= len(points)):
        raise ValueError("Invalid geometry for fingerprint")
    triangles = np.rint(points[indexes] * 1e6).astype("<i8")
    order = np.lexsort((triangles[:, :, 2], triangles[:, :, 1], triangles[:, :, 0]))
    canonical = np.take_along_axis(triangles, order[:, :, None], axis=1).reshape(-1, 9)
    canonical = canonical[np.lexsort(tuple(canonical[:, i] for i in range(8, -1, -1)))]
    return HASH_PREFIX + hashlib.sha256(canonical.tobytes()).hexdigest()


def _axis(axis):
    if axis is None:
        return np.eye(4)
    if axis.is_a() not in ("IfcAxis2Placement2D", "IfcAxis2Placement3D"):
        raise ValueError("Unsupported placement")
    matrix = placement.get_axis2placement(axis)
    if not np.isfinite(matrix).all():
        raise ValueError("Invalid placement")
    return matrix


def _local_matrix(local):
    chain, seen = [], set()
    while local is not None:
        if not local.is_a("IfcLocalPlacement") or local.id() in seen or len(chain) >= 64:
            raise ValueError("Unsupported or recursive object placement")
        seen.add(local.id())
        chain.append(_axis(local.RelativePlacement))
        local = local.PlacementRelTo
    result = np.eye(4)
    for matrix in reversed(chain):
        result = result @ matrix
    return result


def _convex_fan(points):
    """Return an exact fan only if every edge bounds a convex planar polygon."""
    if len(points) < 3 or len(points) > 4096 or not np.isfinite(points).all():
        raise ValueError("Invalid polygon")
    # Newell normal handles an initial run of collinear vertices.
    normal = np.sum(np.cross(points, np.roll(points, -1, axis=0)), axis=0)
    norm = np.linalg.norm(normal)
    if norm < 1e-12:
        raise ValueError("Degenerate polygon")
    normal /= norm
    tolerance = max(float(np.max(np.ptp(points, axis=0))), 1.) * 1e-9
    if np.max(np.abs((points - points[0]) @ normal)) > tolerance:
        raise ValueError("Nonplanar polygon")
    for i, point in enumerate(points):
        edge = points[(i + 1) % len(points)] - point
        if np.linalg.norm(edge) <= tolerance:
            raise ValueError("Repeated polygon vertex")
        # Checking all points, rather than just adjacent turns, also rejects stars.
        if np.min(np.cross(edge, points - point) @ normal) < -tolerance * np.linalg.norm(edge):
            raise ValueError("Nonconvex polygon")
    return [(0, i, i + 1) for i in range(1, len(points) - 1)]


def _face_set(item):
    coordinates = np.asarray(item.Coordinates.CoordList, dtype=float)
    if coordinates.ndim != 2 or coordinates.shape[1] != 3 or not np.isfinite(coordinates).all():
        raise ValueError("Invalid coordinates")
    if item.is_a("IfcPolygonalFaceSet"):
        if any(face.is_a("IfcIndexedPolygonalFaceWithVoids") for face in item.Faces):
            raise ValueError("Polygon holes need the geometry kernel")
        faces = [face.CoordIndex for face in item.Faces]
    else:
        faces = item.CoordIndex
    triangles, pn = [], item.PnIndex
    for face in faces:
        if not face or min(face) < 1 or (pn and max(face) > len(pn)):
            raise ValueError("Invalid face index")
        indexes = [(pn[i - 1] if pn else i) - 1 for i in face]
        if min(indexes) < 0 or max(indexes) >= len(coordinates):
            raise ValueError("Invalid point index")
        triangles.extend(tuple(indexes[i] for i in triangle) for triangle in _convex_fan(coordinates[indexes]))
        if len(triangles) > MAX_DIRECT_TRIANGLES:
            raise ValueError("Preview budget reached")
    return coordinates, triangles


def _extrusion(item):
    profile = item.SweptArea
    if profile.ProfileType != "AREA":
        raise ValueError("Extrusion needs an area profile")
    if profile.is_a() == "IfcRectangleProfileDef":
        x, y = float(profile.XDim) / 2, float(profile.YDim) / 2
        if x <= 0 or y <= 0:
            raise ValueError("Invalid rectangle")
        points = np.array([[-x, -y, 0], [x, -y, 0], [x, y, 0], [-x, y, 0]])
        points = (_axis(profile.Position) @ np.column_stack([points, np.ones(4)]).T).T[:, :3]
    elif profile.is_a() == "IfcArbitraryClosedProfileDef" and profile.OuterCurve.is_a("IfcPolyline"):
        points2d = np.asarray([p.Coordinates for p in profile.OuterCurve.Points], dtype=float)
        if points2d.ndim != 2 or points2d.shape[1] != 2 or len(points2d) < 4 or not np.array_equal(points2d[0], points2d[-1]):
            raise ValueError("Profile must be a closed 2D polyline")
        points = np.column_stack([points2d[:-1], np.zeros(len(points2d) - 1)])
    else:
        raise ValueError("Unsupported extrusion profile")
    caps = _convex_fan(points)
    direction = np.asarray(item.ExtrudedDirection.DirectionRatios, dtype=float)
    depth = float(item.Depth)
    if direction.shape != (3,) or not np.isfinite(direction).all() or abs(direction[2]) < 1e-12 or not np.isfinite(depth) or depth <= 0:
        raise ValueError("Invalid extrusion direction or depth")
    offset = direction / np.linalg.norm(direction) * depth
    n = len(points)
    vertices = np.vstack([points, points + offset])
    faces = [tuple(reversed(t)) for t in caps] + [tuple(i + n for i in t) for t in caps]
    for i in range(n):
        j = (i + 1) % n
        faces.extend([(i, j, j + n), (i, j + n, i + n)])
    return vertices, faces, _axis(item.Position)


def read_tessellation(entity, scale: float) -> Mesh | None:
    if not entity.Representation or getattr(entity, "HasOpenings", ()):
        # Rendering a host without its subtracted openings would be misleading.
        return None
    representations = [r for r in entity.Representation.Representations if r.RepresentationIdentifier == "Body"]
    if len(representations) != 1 or not representations[0].Items or not np.isfinite(scale) or scale <= 0:
        return None
    vertices, triangles = [], []

    def append(item, matrix, ancestry):
        if item.id() in ancestry or len(ancestry) >= 16:
            raise ValueError("Recursive mapped representation")
        if item.is_a("IfcMappedItem"):
            target = item.MappingTarget
            if not target.is_a("IfcCartesianTransformationOperator3D") or (target.Scale is not None and target.Scale <= 0):
                raise ValueError("Unsupported mapping")
            for attr in ("Scale2", "Scale3"):
                value = getattr(target, attr, None)
                if value is not None and value <= 0:
                    raise ValueError("Invalid mapping scale")
            transform = placement.get_mappeditem_transformation(item)
            if transform is None or not np.isfinite(transform).all() or abs(np.linalg.det(transform[:3, :3])) < 1e-12:
                raise ValueError("Invalid mapping")
            items = item.MappingSource.MappedRepresentation.Items
            if not items:
                raise ValueError("Empty mapped body")
            for child in items:
                append(child, matrix @ transform, ancestry | {item.id()})
            return
        if item.is_a("IfcPolygonalFaceSet") or item.is_a("IfcTriangulatedFaceSet"):
            coordinates, faces = _face_set(item)
        elif item.is_a() == "IfcExtrudedAreaSolid":
            coordinates, faces, position = _extrusion(item)
            matrix = matrix @ position
        else:
            raise ValueError("Unsupported representation item")
        if len(triangles) // 3 + len(faces) > MAX_DIRECT_TRIANGLES:
            raise ValueError("Preview budget reached")
        transformed = (matrix @ np.column_stack([coordinates, np.ones(len(coordinates))]).T).T[:, :3] * scale
        if not np.isfinite(transformed).all() or np.max(np.abs(transformed)) > 1e9:
            raise ValueError("Invalid transformed geometry")
        offset = len(vertices) // 3
        vertices.extend(transformed.ravel().tolist())
        triangles.extend(offset + index for face in faces for index in face)

    try:
        matrix = _local_matrix(entity.ObjectPlacement)
        for item in representations[0].Items:
            append(item, matrix, set())
    except (ValueError, TypeError, AttributeError, IndexError, RecursionError):
        return None
    return Mesh(vertices=vertices, faces=triangles) if triangles else None
