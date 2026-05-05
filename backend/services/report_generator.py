def generate_markdown(deterministic_data: dict, ai_analysis: str) -> str:
    """Combines the deterministic data and the AI analysis into a single clean markdown report."""
    
    # Calculate deterministic totals
    total_vol = sum(el.get("volume_m3", 0) for el in deterministic_data.get("elements", []))
    total_area = sum(el.get("area_m2", 0) for el in deterministic_data.get("elements", []))
    total_elements = deterministic_data.get("total_elements", 0)
    filename = deterministic_data.get("filename", "Unknown")

    md = f"""# AgenticBIM: Automated IFC Analysis Report
**File:** `{filename}`
**Total Elements Analyzed:** {total_elements}

---

## 1. Deterministic Data Extraction (Engineered Output)
*Calculated strictly from IFC geometry without AI hallucination.*

- **Total Concrete Volume:** {total_vol:.2f} m³
- **Total Surface Area:** {total_area:.2f} m²

### Element Breakdown:
"""
    for el in deterministic_data.get("elements", []):
        md += f"- **{el['type']}** ({el['id']}) | Material: {el['material']} | Volume: {el.get('volume_m3')} m³ | Width: {el.get('width_m')} m\n"

    md += f"""

---

## 2. Agentic Reasoning & Analysis (AI Output)
*Synthesized using CrewAI (Claude 3.5 Sonnet).*

{ai_analysis}
"""
    return md
