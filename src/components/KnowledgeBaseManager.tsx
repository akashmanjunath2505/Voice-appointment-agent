import React, { useState, useEffect } from "react";
import { 
  UploadCloud, 
  Database, 
  FileText, 
  Search, 
  Trash2, 
  CheckCircle2, 
  Cpu, 
  Zap, 
  Layers, 
  Eye, 
  X, 
  Sparkles,
  Plus,
  BookOpen,
  ShieldAlert,
  ArrowRight
} from "lucide-react";
import { KbDocument, KbChunk, RagQueryResponse } from "../types";

interface KnowledgeBaseManagerProps {
  showToast: (msg: string, type?: "success" | "error" | "info") => void;
}

export const KnowledgeBaseManager: React.FC<KnowledgeBaseManagerProps> = ({ showToast }) => {
  const [documents, setDocuments] = useState<KbDocument[]>([]);
  const [stats, setStats] = useState<{
    totalDocuments: number;
    totalVectorChunks: number;
    totalTokens: number;
    vectorModel: string;
    ragStatus: string;
  }>({
    totalDocuments: 0,
    totalVectorChunks: 0,
    totalTokens: 0,
    vectorModel: "Dense Embedding Engine (768d)",
    ragStatus: "Active"
  });

  const [loading, setLoading] = useState(true);
  const [uploadMode, setUploadMode] = useState<"file" | "text">("file");

  // Document Upload Form State
  const [docTitle, setDocTitle] = useState("");
  const [docCategory, setDocCategory] = useState<KbDocument["category"]>("General");
  const [docContent, setDocContent] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Ingestion progress state
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestStep, setIngestStep] = useState<"" | "chunking" | "embedding" | "storing" | "completed">("");
  const [ingestProgress, setIngestProgress] = useState(0);

  // RAG Search Bench State
  const [ragQuery, setRagQuery] = useState("");
  const [isQueryingRag, setIsQueryingRag] = useState(false);
  const [ragResult, setRagResult] = useState<RagQueryResponse | null>(null);

  // Chunk Modal State
  const [selectedDocForChunks, setSelectedDocForChunks] = useState<KbDocument | null>(null);
  const [docChunks, setDocChunks] = useState<KbChunk[]>([]);
  const [loadingChunks, setLoadingChunks] = useState(false);

  // Fetch KB documents and vector stats
  const fetchKbData = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/kb/documents");
      if (!res.ok) throw new Error("Failed to load knowledge base data");
      const data = await res.json();
      setDocuments(data.documents || []);
      if (data.stats) setStats(data.stats);
    } catch (err: any) {
      console.error(err);
      showToast("Error loading Knowledge Base", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKbData();
  }, []);

  // Handle File Drag / Input Selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      if (!docTitle) {
        setDocTitle(file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "));
      }

      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const isPlainText = ["txt", "md", "json", "csv"].includes(ext) || file.type.startsWith("text/");

      const reader = new FileReader();
      reader.onload = (event) => {
        setDocContent(event.target?.result as string || "");
      };

      if (isPlainText) {
        reader.readAsText(file);
      } else {
        // Read binary files (PDF, DOC, DOCX, etc.) as Data URL (Base64)
        reader.readAsDataURL(file);
      }
    }
  };

  // Submit and Ingest Document into Vector DB
  const handleIngestDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docContent.trim()) {
      showToast("Please provide document content or select a file", "error");
      return;
    }

    try {
      setIsIngesting(true);
      setIngestStep("chunking");
      setIngestProgress(25);

      await new Promise((r) => setTimeout(r, 400));
      setIngestStep("embedding");
      setIngestProgress(60);

      await new Promise((r) => setTimeout(r, 400));
      setIngestStep("storing");
      setIngestProgress(85);

      const payload = {
        title: docTitle.trim() || selectedFile?.name || "Uploaded Knowledge Document",
        category: docCategory,
        filename: selectedFile?.name || `${(docTitle || "document").toLowerCase().replace(/\s+/g, "_")}.txt`,
        content: docContent,
        fileSize: selectedFile?.size || docContent.length,
        mimeType: selectedFile?.type || (selectedFile?.name.endsWith(".pdf") ? "application/pdf" : "text/plain")
      };

      const res = await fetch("/api/kb/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      let data: any = {};
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const textErr = await res.text();
        throw new Error(`Server returned error (${res.status}): ${textErr.slice(0, 120)}`);
      }

      if (!res.ok) throw new Error(data.error || "Failed to process document");

      setIngestStep("completed");
      setIngestProgress(100);
      showToast(data.message || "Document vectorized successfully!", "success");

      // Reset Form
      setDocTitle("");
      setDocContent("");
      setSelectedFile(null);
      await fetchKbData();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Error ingesting document into Vector DB", "error");
    } finally {
      setTimeout(() => {
        setIsIngesting(false);
        setIngestStep("");
        setIngestProgress(0);
      }, 600);
    }
  };

  // Delete Document and associated vector chunks
  const handleDeleteDocument = async (docId: string, title: string) => {
    if (!window.confirm(`Are you sure you want to delete '${title}' from the Vector DB?`)) return;

    try {
      const res = await fetch(`/api/kb/documents/${docId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete document");
      showToast(`Deleted '${title}' and its vector embeddings`, "info");
      await fetchKbData();
      if (selectedDocForChunks?.id === docId) {
        setSelectedDocForChunks(null);
      }
    } catch (err: any) {
      showToast(err.message || "Error deleting document", "error");
    }
  };

  // Test RAG Search against Vector DB
  const handleTestRagQuery = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!ragQuery.trim()) return;

    try {
      setIsQueryingRag(true);
      const res = await fetch("/api/kb/query-rag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: ragQuery.trim() })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "RAG Query failed");

      setRagResult(data);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Error performing RAG query", "error");
    } finally {
      setIsQueryingRag(false);
    }
  };

  // Open Vector Chunks Modal
  const handleInspectChunks = async (doc: KbDocument) => {
    setSelectedDocForChunks(doc);
    setLoadingChunks(true);
    try {
      const res = await fetch(`/api/kb/documents/${doc.id}/chunks`);
      if (!res.ok) throw new Error("Failed to fetch vector chunks");
      const data = await res.json();
      setDocChunks(data.chunks || []);
    } catch (err: any) {
      showToast("Error loading vector chunks", "error");
    } finally {
      setLoadingChunks(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Eyebrow */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="eyebrow flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
            <Database className="w-3.5 h-3.5" /> Vector DB & Grounded RAG Pipeline
          </div>
          <h1 className="page-title text-2xl font-bold tracking-tight text-foreground">Knowledge Base Manager</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Vectorize hospital files, consultation fee guidelines, and medical policies for real-time AI Voice Assistant & Telephony grounding.
          </p>
        </div>

        {/* Status Pill */}
        <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 rounded-lg px-3 py-1.5 text-xs font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Vector DB Active: {stats.totalVectorChunks} Chunks Embedded</span>
        </div>
      </div>


      {/* Main Grid: Upload Ingestion Section & Vector Search Test Bench */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Document Ingestion Form (5 cols) */}
        <div className="lg:col-span-5 card p-5 border border-border bg-card rounded-xl shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-border/50">
            <div className="flex items-center gap-2">
              <UploadCloud className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm text-foreground">Ingest Knowledge File</h3>
            </div>
            <div className="flex items-center gap-1 bg-muted p-0.5 rounded-md text-xs">
              <button
                type="button"
                onClick={() => setUploadMode("file")}
                className={`px-2.5 py-1 rounded-sm transition-colors font-medium ${
                  uploadMode === "file" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"
                }`}
              >
                File Upload
              </button>
              <button
                type="button"
                onClick={() => setUploadMode("text")}
                className={`px-2.5 py-1 rounded-sm transition-colors font-medium ${
                  uploadMode === "text" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"
                }`}
              >
                Paste Text
              </button>
            </div>
          </div>

          <form onSubmit={handleIngestDocument} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Document Title</label>
              <input
                type="text"
                placeholder="e.g. Clinic Fee Schedule & Emergency Rules"
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1">Knowledge Category</label>
              <select
                value={docCategory}
                onChange={(e) => setDocCategory(e.target.value as any)}
                className="w-full text-xs px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="General">General Clinic Rules</option>
                <option value="Pricing">Consultation Fees & Packages</option>
                <option value="Insurance">Insurance & Cashless Claims</option>
                <option value="Doctors">Doctor Profiles & Specializations</option>
                <option value="Services">Services & Diagnostics</option>
                <option value="Emergency">Emergency & Out-of-hours Protocols</option>
              </select>
            </div>

            {uploadMode === "file" ? (
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Select File (.pdf, .doc, .txt, .md)</label>
                <div className="border-2 border-dashed border-border hover:border-primary/50 transition-colors rounded-xl p-5 text-center bg-muted/20">
                  <input
                    type="file"
                    id="kb-file-input"
                    onChange={handleFileChange}
                    accept=".txt,.pdf,.doc,.docx,.md,.json,.csv"
                    className="hidden"
                  />
                  <label htmlFor="kb-file-input" className="cursor-pointer flex flex-col items-center gap-1.5">
                    <FileText className="w-8 h-8 text-primary/60 mb-1" />
                    <span className="text-xs font-semibold text-foreground">
                      {selectedFile ? selectedFile.name : "Click to browse or drop file here"}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {selectedFile ? `${Math.round(selectedFile.size / 1024)} KB` : "Supports PDF, DOC, TXT, Markdown, CSV"}
                    </span>
                  </label>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Paste Document Content</label>
                <textarea
                  rows={6}
                  placeholder="Paste clinic guidelines, doctor schedule details, or fee breakdowns here..."
                  value={docContent}
                  onChange={(e) => setDocContent(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-input rounded-lg bg-background text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            )}

            {/* Ingestion Progress Bar */}
            {isIngesting && (
              <div className="space-y-1.5 bg-primary/5 border border-primary/20 rounded-lg p-3">
                <div className="flex items-center justify-between text-xs font-medium text-primary">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 animate-spin" />
                    {ingestStep === "chunking" && "Splitting text into semantic chunks..."}
                    {ingestStep === "embedding" && "Generating 768d vector embeddings..."}
                    {ingestStep === "storing" && "Indexing vectors into Vector DB..."}
                    {ingestStep === "completed" && "Vectorization complete!"}
                  </span>
                  <span>{ingestProgress}%</span>
                </div>
                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300 rounded-full"
                    style={{ width: `${ingestProgress}%` }}
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isIngesting || !docContent.trim()}
              className="w-full py-2.5 px-4 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium text-xs rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Cpu className="w-4 h-4" />
              <span>{isIngesting ? "Vectorizing..." : "Ingest & Index Document into Vector DB"}</span>
            </button>
          </form>
        </div>

        {/* Right Column: Interactive Vector DB RAG Inspector & Test Bench (7 cols) */}
        <div className="lg:col-span-7 card p-5 border border-border bg-card rounded-xl shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-border/50">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-indigo-500" />
              <h3 className="font-semibold text-sm text-foreground">RAG Vector Search Inspector</h3>
            </div>
            <span className="text-[11px] text-muted-foreground font-medium bg-muted px-2 py-0.5 rounded-md">
              Cosine Similarity Search
            </span>
          </div>

          <p className="text-xs text-muted-foreground">
            Test semantic vector retrieval in real-time. Type a patient question below to see exact matching vector chunks and the grounded AI response.
          </p>

          <form onSubmit={handleTestRagQuery} className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="e.g. What is the fee for General Physician consultation?"
                value={ragQuery}
                onChange={(e) => setRagQuery(e.target.value)}
                style={{ paddingLeft: "38px" }}
                className="w-full text-xs pr-3 py-2.5 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
            <button
              type="submit"
              disabled={isQueryingRag || !ragQuery.trim()}
              className="py-2 px-3.5 bg-indigo-600 hover:bg-indigo-700 text-white transition-colors text-xs font-medium rounded-lg flex items-center gap-1.5 disabled:opacity-50"
            >
              {isQueryingRag ? <Sparkles className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
              <span>Query RAG</span>
            </button>
          </form>

          {/* Quick Preset Test Queries */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground font-medium mr-1">Quick test:</span>
            {[
              "What is the consultation fee?",
              "Which insurance plans are supported?",
              "What are Dr. Abhishek's qualifications?",
              "What are the clinic operating hours?"
            ].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setRagQuery(preset);
                  setTimeout(() => handleTestRagQuery(), 100);
                }}
                className="text-[11px] bg-muted/60 hover:bg-muted text-foreground border border-border/50 px-2 py-0.5 rounded-md transition-colors"
              >
                {preset}
              </button>
            ))}
          </div>

          {/* RAG Results Output */}
          {ragResult && (
            <div className="space-y-3 pt-2 border-t border-border/50">
              {/* Grounded Synthesis */}
              <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3.5 space-y-1.5">
                <div className="flex items-center gap-1.5 text-indigo-600 font-semibold text-xs">
                  <Sparkles className="w-3.5 h-3.5" /> Grounded RAG Answer
                </div>
                <div className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                  {ragResult.ragAnswer}
                </div>
              </div>

              {/* Retrieved Vector Chunks Breakdown */}
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center justify-between">
                  <span>Top Vector Chunks Retrieved ({ragResult.topChunks.length})</span>
                  <span>Ranked by Cosine Score</span>
                </div>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {ragResult.topChunks.map((res, idx) => (
                    <div key={idx} className="bg-muted/30 border border-border/60 rounded-lg p-2.5 text-xs space-y-1">
                      <div className="flex items-center justify-between font-medium">
                        <span className="text-foreground font-semibold flex items-center gap-1">
                          <FileText className="w-3 h-3 text-primary" /> {res.chunk.docTitle}
                        </span>
                        <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 font-bold px-1.5 py-0.5 rounded text-[10px]">
                          {Math.round(res.similarityScore * 100)}% Vector Match
                        </span>
                      </div>
                      <p className="text-muted-foreground italic text-[11px] leading-snug">
                        "{res.chunk.text}"
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Indexed Document Library Section */}
      <div className="card p-5 border border-border bg-card rounded-xl shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-border/50">
          <div>
            <h3 className="font-semibold text-sm text-foreground">Indexed Document Library</h3>
            <p className="text-xs text-muted-foreground">
              All documents currently chunked, vectorized, and actively available for AI Voice Assistant grounding.
            </p>
          </div>
          <span className="text-xs font-semibold bg-primary/10 text-primary px-2.5 py-1 rounded-md">
            {documents.length} Active Knowledge Documents
          </span>
        </div>

        {loading ? (
          <div className="py-8 text-center text-xs text-muted-foreground">Loading Knowledge Base files...</div>
        ) : documents.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">No documents indexed yet. Ingest a document above to begin!</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {documents.map((doc) => (
              <div key={doc.id} className="border border-border/70 hover:border-primary/40 transition-all bg-card/80 p-4 rounded-xl space-y-3 shadow-2xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-primary/10 text-primary rounded-lg">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-xs text-foreground line-clamp-1">{doc.title}</h4>
                      <span className="inline-block text-[10px] font-medium bg-muted text-muted-foreground px-1.5 py-0.5 rounded mt-0.5">
                        {doc.category}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteDocument(doc.id, doc.title)}
                    className="text-muted-foreground hover:text-red-500 p-1 rounded transition-colors"
                    title="Delete document"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <p className="text-[11px] text-muted-foreground line-clamp-2 italic bg-muted/20 p-2 rounded-md">
                  "{doc.sampleText}"
                </p>

                <div className="flex items-center justify-between pt-2 border-t border-border/40 text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 font-medium text-foreground">
                      <Layers className="w-3 h-3 text-indigo-500" /> {doc.chunkCount} Vector Chunks
                    </span>
                    <span>{Math.round(doc.fileSize / 1024)} KB</span>
                  </div>
                  <button
                    onClick={() => handleInspectChunks(doc)}
                    className="text-primary hover:underline font-semibold flex items-center gap-1 text-[11px]"
                  >
                    <Eye className="w-3 h-3" /> View Vectors
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Vector Chunks Inspector Modal */}
      {selectedDocForChunks && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card border border-border w-full max-w-2xl rounded-xl p-5 shadow-xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div>
                <div className="text-xs font-semibold text-primary uppercase tracking-wider">Vector Chunk Inspector</div>
                <h3 className="text-base font-bold text-foreground">{selectedDocForChunks.title}</h3>
              </div>
              <button
                onClick={() => setSelectedDocForChunks(null)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {loadingChunks ? (
              <div className="py-12 text-center text-xs text-muted-foreground">Loading vector chunks...</div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {docChunks.map((chunk) => (
                  <div key={chunk.id} className="bg-muted/30 border border-border/60 p-3 rounded-lg text-xs space-y-1.5">
                    <div className="flex items-center justify-between font-semibold">
                      <span className="text-foreground">Chunk #{chunk.chunkIndex}</span>
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className="bg-indigo-500/10 text-indigo-600 px-2 py-0.5 rounded font-mono">
                          {chunk.vectorDimensions}d Vector
                        </span>
                        <span className="bg-muted text-muted-foreground px-2 py-0.5 rounded">
                          {chunk.tokenCount} tokens
                        </span>
                      </div>
                    </div>
                    <div className="text-muted-foreground leading-relaxed bg-background p-2 rounded border border-border/40 font-mono text-[11px]">
                      {chunk.text}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
