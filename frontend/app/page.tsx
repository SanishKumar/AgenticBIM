"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.name.toLowerCase().endsWith(".ifc")) {
        setFile(droppedFile);
        setError("");
      } else {
        setError("Only .ifc files are supported.");
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      if (selectedFile.name.toLowerCase().endsWith(".ifc")) {
        setFile(selectedFile);
        setError("");
      } else {
        setError("Only .ifc files are supported.");
      }
    }
  };

  const startPipeline = async () => {
    if (!file) return;
    setLoading(true);
    setError("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("http://127.0.0.1:8000/api/analyze", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to analyze file");
      }

      const data = await response.json();
      
      // Store the result in localStorage to pass to the report page
      localStorage.setItem("agenticbim_report", JSON.stringify(data));
      
      // Navigate to the report page
      router.push("/report");
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-200 font-sans">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl w-full"
      >
        <div className="text-center mb-12">
          <h1 className="text-5xl font-extrabold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent mb-4">
            AgenticBIM
          </h1>
          <p className="text-slate-400 text-lg">
            Upload your Industry Foundation Classes (.ifc) model and let our AI agents automatically extract quantities, estimate costs, and verify building code compliance.
          </p>
        </div>

        <div 
          className={`relative border-2 border-dashed rounded-3xl p-12 text-center transition-all duration-300 ease-in-out ${
            isDragging ? "border-blue-500 bg-blue-500/10" : "border-slate-700 hover:border-slate-500 bg-slate-900/50"
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input 
            type="file" 
            accept=".ifc" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleFileSelect}
          />
          
          <div className="flex flex-col items-center justify-center space-y-4 cursor-pointer">
            <div className="p-4 bg-slate-800 rounded-full shadow-lg border border-slate-700">
              <UploadCloud className="w-12 h-12 text-blue-400" />
            </div>
            
            {file ? (
              <div className="flex items-center space-x-2 text-emerald-400 font-medium">
                <CheckCircle2 className="w-6 h-6" />
                <span className="text-lg">{file.name}</span>
              </div>
            ) : (
              <div>
                <p className="text-xl font-medium text-slate-200 mb-1">
                  Drag & Drop your IFC file here
                </p>
                <p className="text-slate-500 text-sm">
                  or click to browse from your computer
                </p>
              </div>
            )}
          </div>
        </div>

        {error && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mt-6 flex items-center space-x-2 text-red-400 bg-red-400/10 p-4 rounded-xl border border-red-400/20"
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{error}</p>
          </motion.div>
        )}

        <div className="mt-8 flex justify-center">
          <button
            onClick={startPipeline}
            disabled={!file || loading}
            className={`
              relative px-8 py-4 rounded-xl font-bold text-lg shadow-lg transition-all duration-300
              ${!file 
                ? "bg-slate-800 text-slate-500 cursor-not-allowed" 
                : "bg-blue-600 hover:bg-blue-500 text-white hover:shadow-blue-500/25"}
            `}
          >
            {loading ? (
              <div className="flex items-center space-x-3">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span>Agents are analyzing...</span>
              </div>
            ) : (
              "Start AI Pipeline"
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
