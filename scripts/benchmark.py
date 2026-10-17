"""Reproducible parser load check; not a customer-model or browser benchmark."""
import argparse
import asyncio
import json
from pathlib import Path
import platform
import statistics
import sys
import tempfile
import time
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
import ifcopenshell
import ifcopenshell.api
from limits import ImportLimits
from parser_process import parse_in_process


def fixture(count):
    model = ifcopenshell.file(schema="IFC4")
    ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcProject", name="Synthetic repeat-element load check")
    units = [ifcopenshell.api.run("unit.add_si_unit", model, unit_type=kind)
        for kind in ("LENGTHUNIT", "AREAUNIT", "VOLUMEUNIT")]
    ifcopenshell.api.run("unit.assign_unit", model, units=units)
    context = ifcopenshell.api.run("context.add_context", model, context_type="Model")
    body = ifcopenshell.api.run("context.add_context", model, context_type="Model",
        context_identifier="Body", target_view="MODEL_VIEW", parent=context)
    profile = model.create_entity("IfcRectangleProfileDef", ProfileType="AREA", XDim=.4, YDim=.4)
    solid = model.create_entity("IfcExtrudedAreaSolid", SweptArea=profile,
        ExtrudedDirection=model.create_entity("IfcDirection", (0., 0., 1.)), Depth=3.2)
    rep = model.create_entity("IfcShapeRepresentation", ContextOfItems=body,
        RepresentationIdentifier="Body", RepresentationType="SweptSolid", Items=[solid])
    shape = model.create_entity("IfcProductDefinitionShape", Representations=[rep])
    material = model.create_entity("IfcMaterial", Name="Concrete C30/37")
    elements = []
    for index in range(count):
        guid = ifcopenshell.guid.compress(uuid.uuid5(uuid.NAMESPACE_URL, f"trace-load/{index}").hex)
        placement = model.create_entity("IfcLocalPlacement", RelativePlacement=model.create_entity("IfcAxis2Placement3D",
            Location=model.create_entity("IfcCartesianPoint", (float(index % 100 * 3), float(index // 100 * 3), 0.))))
        element = model.create_entity("IfcColumn", GlobalId=guid, Name=f"Column {index + 1}", ObjectPlacement=placement, Representation=shape)
        volume = model.create_entity("IfcQuantityVolume", Name="NetVolume", VolumeValue=.512)
        qto = model.create_entity("IfcElementQuantity", GlobalId=ifcopenshell.guid.new(), Name="Qto_ColumnBaseQuantities", Quantities=[volume])
        model.create_entity("IfcRelDefinesByProperties", GlobalId=ifcopenshell.guid.new(), RelatedObjects=[element], RelatingPropertyDefinition=qto)
        elements.append(element)
    model.create_entity("IfcRelAssociatesMaterial", GlobalId=ifcopenshell.guid.new(), RelatedObjects=elements, RelatingMaterial=material)
    return model


async def measure(counts, repeats):
    limits = ImportLimits()

    async def connected():
        return False

    results = []
    with tempfile.TemporaryDirectory(prefix="trace-load-") as directory:
        for count in counts:
            source = Path(directory) / f"columns-{count}.ifc"
            fixture(count).write(str(source))
            times = []
            for _ in range(repeats):
                start = time.perf_counter()
                result = await parse_in_process(source, source.name, limits, connected)
                times.append(round(time.perf_counter() - start, 3))
                assert len(result.elements) == count
                assert all(element.mesh for element in result.elements)
                assert all(abs(element.quantities["volume"].value - .512) < 1e-12 for element in result.elements)
            results.append({"elements": count, "meshes": count,
                "triangles": sum(len(element.mesh.faces) // 3 for element in result.elements),
                "input_bytes": source.stat().st_size, "result_bytes": len(result.model_dump_json().encode()),
                "seconds": times, "median_seconds": statistics.median(times)})
            print(f"{count} elements: median {statistics.median(times):.3f}s, all quantities and meshes retained", file=sys.stderr)
    return {"scope": "Synthetic rectangular columns with shared source representation and unique placements/QTO. Includes worker startup, parsing, serialization and parent validation. Excludes fixture generation and browser rendering.",
        "environment": {"system": platform.system(), "release": platform.release(), "python": platform.python_version(), "ifcopenshell": ifcopenshell.version},
        "limits": {"wall_seconds": limits.parse_seconds, "cpu_seconds_linux": limits.cpu_seconds, "address_space_mb_linux": limits.memory_mb},
        "repeats": repeats, "results": results}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--elements", type=int, nargs="+", default=[1000, 5000])
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if any(not 1 <= count <= 5000 for count in args.elements) or not 1 <= args.repeats <= 5:
        parser.error("Use 1–5,000 elements and 1–5 repetitions.")
    encoded = json.dumps(asyncio.run(measure(args.elements, args.repeats)), indent=2) + "\n"
    if args.output:
        args.output.write_text(encoded, encoding="utf-8")
    else:
        print(encoded)
