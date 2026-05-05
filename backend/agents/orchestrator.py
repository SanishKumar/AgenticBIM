import os
from crewai import Agent, Task, Crew, Process, LLM
from dotenv import load_dotenv

load_dotenv()

def run_analysis_crew(extracted_data: dict) -> str:
    llm = LLM(model="groq/llama-3.1-8b-instant", api_key=os.getenv("GROQ_API_KEY"))

    estimator = Agent(
        role="Senior Quantity Surveyor and Estimator",
        goal="Accurately estimate material costs and quantities based on extracted structural data.",
        backstory="""You are an expert estimator in the AEC industry. You know current material costs:
        - bitumen_dbm_generic: $120 per cubic meter
        - bitumen_asphalt_generic: $150 per cubic meter
        - bulk-material_gravel_generic: $40 per cubic meter
        - bulk-material_crushed-stone_generic: $55 per cubic meter
        - stone_sand-lime: $55 per cubic meter
        - gypsum_fiber-board_panel: $40 per cubic meter
        - concrete_reinforced_in-situ: $150 per cubic meter
        - composite_element_roof: $80 per cubic meter
        - Concrete: $150 per cubic meter
        - Timber: $500 per cubic meter
        - Steel: $2500 per cubic meter
        You use exact mathematical reasoning. Do not hallucinate prices.""",
        verbose=True,
        allow_delegation=False,
        llm=llm
    )

    compliance_checker = Agent(
        role="Building Code Compliance Officer",
        goal="Identify potential building code violations from the structural data.",
        backstory="""You are a strict building code compliance officer. Your rules are:
        - All fire exit doors (IfcDoor) must be at least 0.85m wide (width_m >= 0.85).
        - Concrete or stone walls must have a width of 0.2m or greater. If the width is exactly 0.2m, IT PASSES COMPLIANCE. Only flag walls that are strictly less than 0.2m (e.g., 0.19m).
        - IMPORTANT: Handle floating-point precision gracefully. Treat 0.199999 and 0.2000000000000007 as exactly 0.2. Do not flag walls that are infinitesimally off from the required dimension.
        - Inventory required safety elements (like Fire Doors) and flag if they are missing from the JSON.
        You review the element dimensions and flag any exact violations.""",
        verbose=True,
        allow_delegation=False,
        llm=llm
    )

    estimator_task = Task(
        description=f"Analyze this structured IFC data and calculate the total material costs. Data: {extracted_data}",
        expected_output="A detailed cost breakdown table by material type, showing volume, unit cost, and total estimated cost.",
        agent=estimator
    )

    compliance_task = Task(
        description=f"Analyze this structured IFC data and flag any building code violations based on your rules. Data: {extracted_data}",
        expected_output="""Assemble the final report in Markdown. Use exact headers. 
        First, create a header '# Cost Estimation' and insert the exact cost breakdown table provided by the Estimator agent. 
        Second, create a header '# Compliance Violations' and insert your own list of compliance violations (or explicitly state 'No violations found' and mention missing elements). Do not mix the Estimator's cost data into your compliance section.""",
        agent=compliance_checker
    )

    crew = Crew(
        agents=[estimator, compliance_checker],
        tasks=[estimator_task, compliance_task],
        process=Process.sequential,
        verbose=True
    )

    result = crew.kickoff()
    return str(result)