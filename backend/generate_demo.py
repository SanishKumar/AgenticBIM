"""Reproducible synthetic IFC fixture. Run from backend with Python 3.12+."""
import json
from pathlib import Path
import uuid
import ifcopenshell
import ifcopenshell.api
import ifcopenshell.guid
from ifc_parser import parse_ifc_file

ROOT = Path(__file__).resolve().parents[1]


def make_model(revision=2):
    model = ifcopenshell.file(schema="IFC4")
    project = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcProject", name="Northbank Studio")
    units = [ifcopenshell.api.run("unit.add_si_unit", model, unit_type=kind) for kind in ("LENGTHUNIT", "AREAUNIT", "VOLUMEUNIT")]
    ifcopenshell.api.run("unit.assign_unit", model, units=units)
    context = ifcopenshell.api.run("context.add_context", model, context_type="Model")
    body = ifcopenshell.api.run("context.add_context", model, context_type="Model", context_identifier="Body", target_view="MODEL_VIEW", parent=context)
    building = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcBuilding", name="Northbank Studio")
    ifcopenshell.api.run("aggregate.assign_object", model, products=[building], relating_object=project)
    materials = {name: ifcopenshell.api.run("material.add_material", model, name=name) for name in ("Concrete C30/37", "Glazing", "Structural steel", "Timber")}
    levels = []
    for i in range(4):
        level = ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcBuildingStorey", name=["00 · Ground", "01 · Studio", "02 · Workspace", "03 · Roof"][i])
        level.Elevation = float(i * 3.6)
        ifcopenshell.api.run("aggregate.assign_object", model, products=[level], relating_object=building)
        levels.append(level)

    def box(key, kind, name, x, y, z, dx, dy, dz, level, material="Concrete C30/37", missing_volume=False, missing_material=False, width=None):
        entity = ifcopenshell.api.run("root.create_entity", model, ifc_class=kind, name=name)
        entity.GlobalId = ifcopenshell.guid.compress(uuid.uuid5(uuid.NAMESPACE_URL, "trace-demo/" + key).hex)
        vertices = [(x+a*dx, y+b*dy, z+c*dz) for a,b,c in ((0,0,0),(1,0,0),(1,1,0),(0,1,0),(0,0,1),(1,0,1),(1,1,1),(0,1,1))]
        faces = [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
        representation = ifcopenshell.api.run("geometry.add_mesh_representation", model, context=body, vertices=[vertices], faces=[faces])
        ifcopenshell.api.run("geometry.assign_representation", model, product=entity, representation=representation)
        ifcopenshell.api.run("spatial.assign_container", model, products=[entity], relating_structure=levels[level])
        if not missing_material:
            ifcopenshell.api.run("material.assign_material", model, products=[entity], material=materials[material])
        qto = ifcopenshell.api.run("pset.add_qto", model, product=entity, name=f"Qto_{kind[3:]}BaseQuantities")
        quantities = {"NetArea": dx * dz if kind in ("IfcWindow", "IfcDoor") else dx * dy, "Width": width or min(dx,dy), "Height": dz, "Length": max(dx,dy)}
        if not missing_volume:
            quantities["NetVolume"] = dx * dy * dz
        ifcopenshell.api.run("pset.edit_qto", model, qto=qto, properties=quantities)
        return entity

    # Two offset studio wings linked by a bridge, with an open ground-floor arcade.
    for level in range(4):
        z = level * 3.6
        for wing, y, length in (("A", 0, 22), ("B", 9, 16)):
            depth = 6.0
            thickness = .32 if revision == 2 and level == 2 and wing == "A" else .25
            box(f"slab-{wing}-{level}", "IfcSlab", f"{wing}{level}-01 · Floor plate", 0,y,z,length,depth,thickness,level,
                missing_volume=level == 1 and wing == "B")
        if level in (1,2,3):
            box(f"bridge-{level}", "IfcSlab", f"C{level}-01 · Connecting bridge", 10,6,z,6,3,.25,level)
        if level == 3:
            continue
        for wing,y,length in (("A",0,22),("B",9,16)):
            for ix,x in enumerate(range(0,length+1,5)):
                for side,cy in enumerate((y,y+5.6)):
                    box(f"col-{wing}-{level}-{ix}-{side}","IfcColumn",f"{wing}{level}-C{ix}{side} · Column",x,cy,z+.25,.35,.35,3.35,level)
            for side,wy in enumerate((y,y+5.8)):
                box(f"beam-{wing}-{level}-{side}","IfcBeam",f"{wing}{level}-B{side} · Edge beam",0,wy,z+3.15,length,.2,.45,level)
                if level > 0:
                    for n,x in enumerate(range(0,length-2,3)):
                        box(f"glass-{wing}-{level}-{side}-{n}","IfcWindow",f"{wing}{level}-G{side}{n} · Glazing panel",x+.35,wy,z+.5,2.6,.08,2.6,level,material="Glazing")
            box(f"wall-{wing}-{level}","IfcWall",f"{wing}{level}-W01 · Core wall",.1,y+.4,z+.25,.24,5.1,3.1,level,
                missing_material=wing=="B" and level==2)
    for level in range(3):
        width = .78 if level == 1 and revision == 2 else 1.0
        box(f"door-{level}","IfcDoor",f"A{level}-D01 · Stair lobby door",5,5.8,level*3.6+.25,width,.12,2.2,level,material="Timber",width=width)
    if revision == 2:
        box("new-partition","IfcWall","B2-W02 · Added partition",8,9.2,7.45,.18,5.3,3.1,2,material="Timber")
    else:
        box("old-partition","IfcWall","B1-W03 · Removed partition",8,9.2,3.85,.15,5.3,3.1,1,material="Timber")
    return model


if __name__ == "__main__":
    destination = ROOT / "frontend" / "public" / "demo"
    destination.mkdir(parents=True, exist_ok=True)
    for revision in (1,2):
        path = destination / f"northbank-r0{revision}.ifc"
        make_model(revision).write(str(path))
        snapshot = parse_ifc_file(str(path))
        snapshot.source = "demo"
        (destination / f"northbank-r0{revision}.json").write_text(snapshot.model_dump_json(), encoding="utf-8")
        print(f"R0{revision}: {len(snapshot.elements)} elements, {sum(e.mesh is not None for e in snapshot.elements)} meshes")
