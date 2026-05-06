"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { ArrowLeft, Download, FileText, CheckCircle, Box } from "lucide-react";
import { motion } from "framer-motion";

export default function ReportPage() {
  const [reportData, setReportData] = useState<any>(null);
  const router = useRouter();

  useEffect(() => {
    const data = localStorage.getItem("agenticbim_report");
    if (data) {
      setReportData(JSON.parse(data));
    } else {
      router.push("/");
    }
  }, [router]);

  if (!reportData) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><p className="text-slate-400 text-lg">Loading report...</p></div>;

  const { markdown_report, deterministic_data } = reportData;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-12 print:hidden">
          <button 
            onClick={() => router.push("/")}
            className="flex items-center space-x-2 text-slate-400 hover:text-white transition-colors bg-slate-900 px-4 py-2 rounded-full border border-slate-800"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Upload New File</span>
          </button>
          <div className="flex items-center space-x-3 bg-slate-900 border border-slate-800 px-5 py-2 rounded-full shadow-lg">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
            <span className="font-medium text-emerald-400">Analysis Complete</span>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Deterministic Data */}
          <div className="lg:col-span-1 space-y-6">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-xl"
            >
              <div className="flex items-center space-x-3 mb-6">
                <div className="p-3 bg-blue-500/10 rounded-2xl">
                  <Box className="w-6 h-6 text-blue-400" />
                </div>
                <h2 className="text-xl font-bold">Deterministic Data</h2>
              </div>
              
              <div className="space-y-4">
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800/50 shadow-inner">
                  <p className="text-slate-500 text-sm mb-1">Filename</p>
                  <p className="font-medium truncate text-slate-300">{deterministic_data.filename}</p>
                </div>
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800/50 shadow-inner">
                  <p className="text-slate-500 text-sm mb-1">Total Elements Processed</p>
                  <p className="text-4xl font-extrabold text-blue-400">{deterministic_data.total_elements}</p>
                </div>
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-slate-900 rounded-3xl p-6 border border-slate-800 shadow-xl flex flex-col h-[500px] print:h-auto print:border-none"
            >
              <h3 className="text-lg font-bold mb-4 text-slate-300 print:text-black">Extracted Geometry</h3>
              <div className="overflow-y-auto pr-2 space-y-3 print:overflow-visible">
                {deterministic_data.elements.slice(0, 15).map((el: any, i: number) => (
                  <div key={i} className="bg-slate-950 p-4 rounded-xl border border-slate-800/50 text-sm">
                    <p className="font-bold text-slate-300 truncate">{el.name}</p>
                    <div className="grid grid-cols-2 gap-2 mt-2 text-slate-400">
                      <p>Type: <span className="text-slate-200">{el.type}</span></p>
                      <p>Vol: <span className="text-blue-400 font-medium">{el.volume_m3.toFixed(2)}m³</span></p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Right Column: AI Analysis Markdown */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-2 bg-slate-900 rounded-3xl border border-slate-800 shadow-xl overflow-hidden flex flex-col h-full min-h-[700px] print:min-h-0 print:border-none print:shadow-none print:bg-white"
          >
            <div className="bg-slate-800/30 p-6 border-b border-slate-800 flex justify-between items-center print:hidden">
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-indigo-500/10 rounded-2xl">
                  <FileText className="w-6 h-6 text-indigo-400" />
                </div>
                <h2 className="text-xl font-bold">CrewAI Agent Report</h2>
              </div>
              <button 
                onClick={() => window.print()}
                className="flex items-center space-x-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-4 py-2 rounded-xl transition-all shadow-lg shadow-indigo-500/20"
              >
                <Download className="w-4 h-4" />
                <span>Export PDF</span>
              </button>
            </div>
            
            <div className="p-8 prose prose-invert prose-indigo max-w-none overflow-y-auto print:overflow-visible print:prose-p:text-black print:prose-headings:text-black print:prose-strong:text-black print:text-black">
              <ReactMarkdown>
                {markdown_report}
              </ReactMarkdown>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
