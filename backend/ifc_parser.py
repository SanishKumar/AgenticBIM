import json
import logging
from typing import Dict, Any

try:
    import ifcopenshell
    import ifcopenshell.util.element as element_util
except ImportError:
    logging.warning("ifcopenshell is not installed. Please run: pip install ifcopenshell")
    ifcopenshell = None

def parse_ifc_file(file_path: str) -> Dict[str, Any]:
    """
    Parses an IFC file and extracts structural elements (Walls, Slabs, Doors)
    along with their base quantities (Volume, Area, Dimensions) and materials.
    """
    if not ifcopenshell:
        raise ImportError("ifcopenshell is required to parse IFC files.")

    ifc_file = ifcopenshell.open(file_path)
    
    # We want to extract walls, slabs, and doors just like our mock_data.json
    element_types = ["IfcWall", "IfcWallStandardCase", "IfcSlab", "IfcDoor"]
    
    extracted_elements = []
    
    for ifc_type in element_types:
        elements = ifc_file.by_type(ifc_type)
        
        for el in elements:
            # 1. Base Element Info
            el_data = {
                "id": el.GlobalId,
                "type": "IfcWall" if "Wall" in el.is_a() else el.is_a(),
                "name": el.Name or "Unnamed",
                "material": "Unknown",
                "volume_m3": 0.0,
                "area_m2": 0.0,
                "width_m": 0.0,
                "height_m": 0.0,
                "length_m": 0.0
            }
            
            # 2. Extract Material using ifcopenshell's utility function
            material = element_util.get_material(el)
            if material:
                if material.is_a("IfcMaterial"):
                    el_data["material"] = material.Name
                elif material.is_a("IfcMaterialLayerSetUsage"):
                    layers = material.ForLayerSet.MaterialLayers
                    if layers:
                        el_data["material"] = layers[0].Material.Name
                elif material.is_a("IfcMaterialList"):
                    if material.Materials:
                        el_data["material"] = material.Materials[0].Name
            
            # 3. Extract Base Quantities
            # `get_psets` grabs all Property Sets and Quantity Sets as a flat dict of dicts
            psets = element_util.get_psets(el)
            
            # Look for standard BaseQuantities OR specific Qto_ property sets (like Qto_SlabBaseQuantities)
            q = psets.get("BaseQuantities", {})
            if not q:
                # Fallback: scan for any Quantity Takeoff (Qto) set
                for key, value in psets.items():
                    if key.startswith("Qto_"):
                        q = value
                        break
                        
            if q:
                # Round volumes and areas to 3 decimal places
                el_data["volume_m3"] = round(float(q.get("NetVolume", q.get("GrossVolume", 0.0))), 3)
                el_data["area_m2"] = round(float(q.get("NetArea", q.get("GrossArea", q.get("NetSideArea", 0.0)))), 3)
                
                # Convert linear dimensions from mm to meters AND round them to 3 decimal places
                el_data["width_m"] = round(float(q.get("Width", 0.0)) / 1000.0, 3)
                el_data["height_m"] = round(float(q.get("Height", q.get("Depth", 0.0))) / 1000.0, 3)
                el_data["length_m"] = round(float(q.get("Length", 0.0)) / 1000.0, 3)
            
            extracted_elements.append(el_data)
            
    result = {
        "filename": file_path.split("/")[-1].split("\\")[-1],
        "total_elements": len(extracted_elements),
        "elements": extracted_elements
    }
    
    return result

if __name__ == "__main__":
    # To test this standalone, you will need to provide a sample .ifc file.
    import sys
    if len(sys.argv) > 1:
        test_file = sys.argv[1]
        print(f"Parsing {test_file}...")
        parsed_data = parse_ifc_file(test_file)
        print(json.dumps(parsed_data, indent=2))
    else:
        print("Usage: python ifc_parser.py <path_to_ifc_file>")
