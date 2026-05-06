# AgenticBIM 🏗️🤖
Automated IFC Analysis Pipeline bridging Deterministic Engineering with Agentic AI

## 🚀 Overview
AgenticBIM is a production-grade AI system designed to analyze raw .ifc (Industry Foundation Classes) files and automatically generate verified Cost Estimations and Building Code Compliance Reports.

## The Problem
Large Language Models (LLMs) excel at semantic reasoning but notoriously hallucinate spatial mathematics and geometry. Asking an AI to natively parse a 3D structural graph results in fabricated volumes and inaccurate cost analyses.

## The Solution (Deterministic-First AI)
AgenticBIM solves the hallucination problem by strictly separating mathematical extraction from AI reasoning:

- **Deterministic Pipeline**: Uses IfcOpenShell in Python to securely parse the BIM graph and extract exact Qto_BaseQuantities (Volumes, Areas, Widths) into a clean, structured JSON payload.

- **Agentic Pipeline**: Uses CrewAI to orchestrate specialized AI agents that evaluate the deterministic JSON against building codes and pricing matrices, generating highly accurate, hallucination-free reports.

## ✨ Features

![Upload Interface](./public/screenshot-upload.png)
*Upload your `.ifc` file via the beautiful drag-and-drop interface.*

- **Zero-Friction UI**: Drag-and-drop Next.js interface for uploading complex 3D structural models.

- **Deterministic Extraction**: Bypasses LLM math limitations by programmatically extracting true geometric properties.

- **Multi-Agent Orchestration**:
  - 👷‍♂️ **The Estimator**: Cross-references deterministic volumes with live material pricing matrices to generate cost breakdowns.
  - 📋 **The Compliance Officer**: Evaluates exact wall thicknesses and door widths against strict safety protocols (e.g., minimum 0.2m thickness for concrete walls) and flags missing required elements (e.g., Fire Exit Doors).

![Analysis Report](./public/screenshot-report.png)
*The final generated report, securely separating mathematical geometry from AI reasoning.*

## 🛠️ Tech Stack

### Frontend
- Next.js 15 (App Router)
- React Dropzone (File handling)
- Vanilla CSS / Framer Motion (Styling & Animation)

### Backend
- Python 3.12
- FastAPI (REST API & Server)
- IfcOpenShell (BIM/CAD Data Parsing)
- CrewAI (Multi-Agent Orchestration)
- Groq / Anthropic (LLM Inference)

## 💻 Getting Started

### Prerequisites
- Node.js (v18+)
- Python 3.10+
- Groq or Anthropic API Key

### Backend Setup

Navigate to the backend directory and set up your Python environment:

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# macOS/Linux
source venv/bin/activate

# Install dependencies (ensure ifcopenshell is installed)
pip install fastapi uvicorn crewai python-dotenv ifcopenshell
```

Create a `.env` file in the `/backend` directory:

```
GROQ_API_KEY=your_groq_api_key_here
```

Start the FastAPI server:

```bash
uvicorn main:app --reload
```

The backend will be running on [http://127.0.0.1:8000](http://127.0.0.1:8000)

### Frontend Setup

Open a new terminal, navigate to the frontend directory:

```bash
cd frontend
npm install
npm install lucide-react framer-motion react-markdown @tailwindcss/typography
```

Create a `.env.local` file in the `/frontend` directory:

```
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

Start the Next.js development server:

```bash
npm run dev
```

The application will be running at [http://localhost:3000](http://localhost:3000)

## 🏗️ Architecture Flow

- **Upload**: User drops an .ifc file into the Next.js client.
- **Ingest**: FastAPI receives the file and triggers ifc_parser.py.
- **Parse**: IfcOpenShell traverses the IfcProduct entities, extracting BaseQuantities and material assignments.
- **Orchestrate**: The resulting JSON is passed to orchestrator.py where CrewAI agents sequentially process the data.
- **Report**: The final Markdown report is streamed back to the client, clearly separating deterministic engineering data from AI-synthesized reasoning.

## 📄 License
MIT
