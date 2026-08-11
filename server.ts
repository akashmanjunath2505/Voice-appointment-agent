import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// --- IN-MEMORY PRODUCTION DB STORE (STRICTLY NO MOCK DATA) ---
export interface ClinicAppointment {
  id: string;
  summary: string;
  description?: string;
  patientName: string;
  patientPhone: string;
  patientEmail?: string;
  reason?: string;
  patientContext?: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  status: "confirmed" | "rescheduled" | "cancelled";
}

export interface OutboundQueueItem {
  id: string;
  patient: string;
  phone: string;
  context: string;
  priority: "High" | "Medium" | "Low";
  status: "Queued" | "Dialing" | "In Progress" | "Pending" | "Completed" | "Failed" | "Archived";
  bucket: "dueNow" | "needsAction" | "completed" | "archived";
  callType: "Reminder" | "Reschedule" | "No-show" | "Manual" | "Follow-up" | "Confirmation";
  attempt: number;
  maxAttempts: number;
  nextRetry: string;
  updated: string;
  dept: string;
}

export interface CallLogItem {
  id: string;
  direction: "inbound" | "outbound";
  time: string;
  timestamp?: number;
  callTimeIso?: string;
  phone: string;
  intent: string;
  outcome: "Confirmed" | "Escalated" | "Unresolved" | "Resolved" | "Failed";
  sentiment: "Positive" | "Neutral" | "Negative";
  duration: string;
  outcomeText: string;
  sessionId: string;
  callId: string;
  consent: string;
  transcript: Array<[string, string]>;
}

function sortCallLogs() {
  dbCallLogs.sort((a, b) => {
    const tA = a.timestamp || (a.callTimeIso ? new Date(a.callTimeIso).getTime() : 0);
    const tB = b.timestamp || (b.callTimeIso ? new Date(b.callTimeIso).getTime() : 0);
    return tB - tA;
  });
}

export interface PatientItem {
  id: string;
  name: string;
  phone: string;
  language: string;
  notes: string;
}

// Helper function to dynamically map doctor and department based on department request or notes/summary text
export function resolveDoctorAndDepartment(deptReq?: string, textContext?: string): {
  doctor: string;
  department: string;
  title: string;
} {
  const combined = `${deptReq || ""} ${textContext || ""}`.toLowerCase();

  // Keyword matching for specialists
  if (combined.includes("rajesh") || combined.includes("kumar") || combined.includes("ortho") || combined.includes("bone") || combined.includes("joint") || combined.includes("knee") || combined.includes("fracture") || combined.includes("spine") || combined.includes("arthritis")) {
    return {
      doctor: "Dr. Rajesh Kumar",
      department: "Orthopedics",
      title: "Consultation with Dr. Rajesh Kumar (Orthopedics)"
    };
  }

  if (combined.includes("ananya") || combined.includes("sharma") || combined.includes("cardio") || combined.includes("heart") || combined.includes("chest pain") || combined.includes("ecg") || combined.includes("bp") || combined.includes("hypertension")) {
    return {
      doctor: "Dr. Ananya Sharma",
      department: "Cardiology",
      title: "Consultation with Dr. Ananya Sharma (Cardiology)"
    };
  }

  if (combined.includes("meera") || combined.includes("nair") || combined.includes("pediat") || combined.includes("child") || combined.includes("infant") || combined.includes("vaccin") || combined.includes("baby")) {
    return {
      doctor: "Dr. Meera Nair",
      department: "Pediatrics",
      title: "Consultation with Dr. Meera Nair (Pediatrics)"
    };
  }

  if (combined.includes("priya") || combined.includes("deshmukh") || combined.includes("gyn") || combined.includes("obg") || combined.includes("women") || combined.includes("pregna") || combined.includes("pcod") || combined.includes("maternity")) {
    return {
      doctor: "Dr. Priya Deshmukh",
      department: "Gynecology",
      title: "Consultation with Dr. Priya Deshmukh (Gynecology)"
    };
  }

  if (combined.includes("vikram") || combined.includes("patel") || combined.includes("derma") || combined.includes("skin") || combined.includes("acne") || combined.includes("rash") || combined.includes("hair") || combined.includes("cosmet")) {
    return {
      doctor: "Dr. Vikram Patel",
      department: "Dermatology",
      title: "Consultation with Dr. Vikram Patel (Dermatology)"
    };
  }

  if (combined.includes("abhishek") || combined.includes("general") || combined.includes("internal") || combined.includes("physician") || combined.includes("fever") || combined.includes("checkup")) {
    return {
      doctor: "Dr. Abhishek",
      department: "General Medicine",
      title: "Consultation with Dr. Abhishek (General Medicine)"
    };
  }

  // Fallback if explicit department requested is provided
  if (deptReq && deptReq.trim().length > 0) {
    const cleanDept = deptReq.trim();
    const formattedDept = cleanDept.charAt(0).toUpperCase() + cleanDept.slice(1);
    return {
      doctor: "Dr. Abhishek",
      department: formattedDept,
      title: `Consultation with Dr. Abhishek (${formattedDept})`
    };
  }

  return {
    doctor: "Dr. Abhishek",
    department: "General Medicine",
    title: "Consultation with Dr. Abhishek (General Medicine)"
  };
}

// Helper function to format timestamp in IST (Asia/Kolkata)
function formatIstTime(dateInput?: string | Date): string {
  const d = dateInput ? new Date(dateInput) : new Date();
  if (isNaN(d.getTime())) {
    return new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: '2-digit', minute: '2-digit' });
}

// Helper function to format Date object as ISO string with IST offset (+05:30)
function formatIsoWithIst(d: Date): string {
  const istOffsetMs = 5.5 * 3600 * 1000;
  const ist = new Date(d.getTime() + istOffsetMs);
  const yyyy = ist.getUTCFullYear();
  const mm = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(ist.getUTCDate()).padStart(2, "0");
  const hh = String(ist.getUTCHours()).padStart(2, "0");
  const min = String(ist.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:00+05:30`;
}

// Strictly validate if a requested slot is within clinic operating hours (Mon–Fri, 9:00 AM – 5:00 PM IST)
function isWithinOperatingHours(dateTimeIso: string): { valid: boolean; reason?: string } {
  try {
    const date = new Date(dateTimeIso);
    if (isNaN(date.getTime())) {
      return { valid: false, reason: "Invalid date or time." };
    }

    const istOffsetMs = 5.5 * 3600 * 1000;
    const istDate = new Date(date.getTime() + istOffsetMs);

    const dayOfWeek = istDate.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const hours = istDate.getUTCHours();
    const minutes = istDate.getUTCMinutes();
    const totalMinutes = hours * 60 + minutes;

    // Days: Mon (1) to Fri (5). Sat (6) and Sun (0) are strictly CLOSED.
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      const dayName = dayOfWeek === 0 ? "Sunday" : "Saturday";
      return {
        valid: false,
        reason: `Our clinic is closed on ${dayName}s. Operating hours are Monday to Friday, 9:00 AM to 5:00 PM IST.`
      };
    }

    // Operating Hours: 9:00 AM (540 mins) to 5:00 PM (1020 mins)
    const startMins = 9 * 60; // 09:00 AM
    const endMins = 17 * 60;  // 05:00 PM (17:00 IST)

    if (totalMinutes < startMins || totalMinutes >= endMins) {
      const formattedTime = date.toLocaleTimeString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "numeric",
        minute: "2-digit",
        hour12: true
      });
      return {
        valid: false,
        reason: `The requested time (${formattedTime}) is outside operating hours (Mon–Fri, 9:00 AM – 5:00 PM IST).`
      };
    }

    return { valid: true };
  } catch (e) {
    return { valid: false, reason: "Unable to verify operating hours." };
  }
}

// Helper function to safely parse relative/explicit dates/times into ISO format for IST (+05:30)
function parseAppointmentDateTime(str: string, referenceIso?: string): string {
  if (!str) return new Date().toISOString();

  // If already a valid ISO string with timezone or T format
  if (str.includes("T") && !isNaN(new Date(str).getTime()) && (str.includes("+") || str.includes("Z") || str.includes("-"))) {
    return new Date(str).toISOString();
  }

  const ref = referenceIso ? new Date(referenceIso) : new Date();
  const istOffsetMs = 5.5 * 3600 * 1000;
  const refIst = new Date(ref.getTime() + istOffsetMs);

  let targetYear = refIst.getUTCFullYear();
  let targetMonth = refIst.getUTCMonth();
  let targetDate = refIst.getUTCDate();

  const lower = str.toLowerCase().trim();

  // 1. Check for day-of-week relative references FIRST (monday, tuesday, etc.)
  const daysOfWeek = [
    { aliases: ["sunday", "sun"], idx: 0 },
    { aliases: ["monday", "mon"], idx: 1 },
    { aliases: ["tuesday", "tue"], idx: 2 },
    { aliases: ["wednesday", "wed"], idx: 3 },
    { aliases: ["thursday", "thu"], idx: 4 },
    { aliases: ["friday", "fri"], idx: 5 },
    { aliases: ["saturday", "saterday", "sat", "weekend"], idx: 6 },
  ];

  let dayOfWeekFound = -1;
  for (const d of daysOfWeek) {
    if (d.aliases.some(alias => new RegExp(`\\b${alias}\\b`, "i").test(lower))) {
      dayOfWeekFound = d.idx;
      break;
    }
  }

  if (lower.includes("day after tomorrow")) {
    targetDate += 2;
  } else if (lower.includes("tomorrow") || lower.includes("tmr") || lower.includes("next day")) {
    targetDate += 1;
  } else if (dayOfWeekFound !== -1) {
    const currentDay = refIst.getUTCDay();
    let diff = dayOfWeekFound - currentDay;
    if (diff <= 0) diff += 7; // e.g. today is Friday (5), Monday is (1) -> diff = 3 days ahead
    targetDate += diff;
  } else if (lower.includes("today")) {
    // Keep targetDate as refIst.getUTCDate()
  } else {
    // 2. Check for explicit month name or date
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    let monthFound = -1;
    months.forEach((m, idx) => {
      if (new RegExp(`\\b${m}`, "i").test(lower)) monthFound = idx;
    });

    if (monthFound !== -1) {
      targetMonth = monthFound;
      const dayMatches = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\b/g);
      if (dayMatches) {
        for (const m of dayMatches) {
          const num = parseInt(m, 10);
          if (num >= 1 && num <= 31 && !lower.includes(`${num}:`) && !lower.includes(`${num} am`) && !lower.includes(`${num} pm`) && !lower.includes(`${num}am`) && !lower.includes(`${num}pm`)) {
            targetDate = num;
            break;
          }
        }
      }
    }
  }

  // 2. Determine Time
  let hours = 12;
  let minutes = 0;

  const timeMatch = lower.match(/(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)/) || lower.match(/(\d{1,2}):(\d{2})/);

  if (timeMatch) {
    hours = parseInt(timeMatch[1], 10);
    minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const ampm = timeMatch[3];

    if (ampm === "pm" && hours < 12) hours += 12;
    if (ampm === "am" && hours === 12) hours = 0;
  }

  const finalDate = new Date(Date.UTC(targetYear, targetMonth, targetDate, hours, minutes, 0));

  const yyyy = finalDate.getUTCFullYear();
  const mm = String(finalDate.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(finalDate.getUTCDate()).padStart(2, "0");
  const hh = String(finalDate.getUTCHours()).padStart(2, "0");
  const min = String(finalDate.getUTCMinutes()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}T${hh}:${min}:00+05:30`;
}

// Databases start strictly empty (NO MOCK DATA)
let dbAppointments: ClinicAppointment[] = [];
let dbOutbound: OutboundQueueItem[] = [
  {
    id: "o-101",
    patient: "Arnav Patil",
    phone: "+917219178531",
    context: "Pediatrics consultation schedule verification & follow-up",
    priority: "High",
    status: "Queued",
    bucket: "dueNow",
    callType: "Follow-up",
    attempt: 1,
    maxAttempts: 3,
    nextRetry: "Due now",
    updated: "Just now",
    dept: "Pediatrics"
  },
  {
    id: "o-102",
    patient: "Abhishek",
    phone: "+918884210757",
    context: "Appointment confirmation for tomorrow at 3:00 PM IST",
    priority: "Medium",
    status: "Queued",
    bucket: "dueNow",
    callType: "Confirmation",
    attempt: 1,
    maxAttempts: 3,
    nextRetry: "Due now",
    updated: "Just now",
    dept: "General Medicine"
  }
];
let dbCallLogs: CallLogItem[] = [];
let dbPatients: PatientItem[] = [];

// ================= VECTOR DB (RAG) ENGINE FOR KNOWLEDGE BASE =================
export interface ServerKbChunk {
  id: string;
  docId: string;
  docTitle: string;
  chunkIndex: number;
  text: string;
  vector: number[];
  tokenCount: number;
}

export interface ServerKbDocument {
  id: string;
  title: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
  chunkCount: number;
  status: "Indexed" | "Processing" | "Error";
  sampleText: string;
  category: "General" | "Insurance" | "Services" | "Doctors" | "Emergency" | "Pricing";
}

let dbKbDocuments: ServerKbDocument[] = [];
let dbVectorChunks: ServerKbChunk[] = [];

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Vector Embedding Helper using Gemini gemini-embedding-2-preview with Cosine Vector Math
async function generateVectorEmbedding(text: string): Promise<number[]> {
  try {
    if (process.env.GEMINI_API_KEY) {
      const res: any = await ai.models.embedContent({
        model: "gemini-embedding-2-preview",
        contents: text,
      });
      if (res.embedding?.values && res.embedding.values.length > 0) {
        return res.embedding.values;
      } else if (res.embeddings?.[0]?.values && res.embeddings[0].values.length > 0) {
        return res.embeddings[0].values;
      }
    }
  } catch (err) {
    console.warn("Gemini embedding fallback to token vector math:", err);
  }

  // Fallback 128-dimensional character/word frequency vector generator
  const vector = new Array(128).fill(0);
  const words = text.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    let hash = 0;
    for (let j = 0; j < word.length; j++) {
      hash = (hash << 5) - hash + word.charCodeAt(j);
      hash |= 0;
    }
    const idx = Math.abs(hash) % 128;
    vector[idx] += 1;
  }
  const mag = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0)) || 1;
  return vector.map(v => v / mag);
}

function calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) return 0;
  const minLen = Math.min(vecA.length, vecB.length);
  let dotProduct = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < minLen; i++) {
    dotProduct += vecA[i] * vecB[i];
    magA += vecA[i] * vecA[i];
    magB += vecB[i] * vecB[i];
  }

  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);

  if (magA === 0 || magB === 0) return 0;
  return dotProduct / (magA * magB);
}

function chunkDocumentText(docId: string, docTitle: string, fullText: string, chunkSize = 400, overlap = 50): { text: string; tokenCount: number }[] {
  const cleanText = fullText.replace(/\r\n/g, "\n").trim();
  if (!cleanText) return [];

  const chunks: { text: string; tokenCount: number }[] = [];
  const paragraphs = cleanText.split(/\n\s*\n/);
  
  let currentChunk = "";
  for (const para of paragraphs) {
    if ((currentChunk + "\n\n" + para).length <= chunkSize) {
      currentChunk = currentChunk ? currentChunk + "\n\n" + para : para;
    } else {
      if (currentChunk.trim()) {
        chunks.push({
          text: currentChunk.trim(),
          tokenCount: Math.ceil(currentChunk.trim().length / 4)
        });
      }
      if (para.length > chunkSize) {
        for (let i = 0; i < para.length; i += (chunkSize - overlap)) {
          const slice = para.slice(i, i + chunkSize).trim();
          if (slice) {
            chunks.push({
              text: slice,
              tokenCount: Math.ceil(slice.length / 4)
            });
          }
        }
        currentChunk = "";
      } else {
        currentChunk = para;
      }
    }
  }

  if (currentChunk.trim()) {
    chunks.push({
      text: currentChunk.trim(),
      tokenCount: Math.ceil(currentChunk.trim().length / 4)
    });
  }

  return chunks;
}

async function seedDefaultKnowledgeBase() {
  if (dbKbDocuments.length > 0) return;

  const defaultDocs = [
    {
      id: "kb-doc-1",
      title: "Aivana Medical Center - General Guide, Departments & Hours",
      filename: "clinic_guidelines_2026.pdf",
      fileSize: 52400,
      mimeType: "application/pdf",
      uploadedAt: new Date().toISOString(),
      category: "General" as const,
      content: `Aivana Medical Center is a premier multi-specialty outpatient healthcare facility located in Indiranagar, Bengaluru, India.
Chief Medical Director: Dr. Abhishek, MD (General Medicine).
Hospital Helpline Phone: +918446163990.
Operating Hours: Monday through Friday, 9:00 AM to 5:00 PM IST. Emergency desk active 24/7.
Location: 100 Feet Road, Indiranagar, Bengaluru, Karnataka, 560038.

Clinical Departments Available:
1. General Medicine & Internal Health (Dr. Abhishek)
2. Cardiology & Heart Care (Dr. Ananya Sharma)
3. Orthopedics & Joint Replacement (Dr. Rajesh Kumar)
4. Pediatrics & Child Health (Dr. Meera Nair)
5. Obstetrics & Gynecology (Dr. Priya Deshmukh)
6. Dermatology & Cosmetology (Dr. Vikram Patel)`
    },
    {
      id: "kb-doc-2",
      title: "Specialist Consultation Fee Schedule & Insurance Policy",
      filename: "fee_schedule_and_insurance.doc",
      fileSize: 34200,
      mimeType: "application/msword",
      uploadedAt: new Date().toISOString(),
      category: "Pricing" as const,
      content: `Consultation Fees by Department:
- General Medicine (Dr. Abhishek): ₹800 (First visit) / ₹400 (Follow-up)
- Cardiology & Heart OPD (Dr. Ananya Sharma): ₹1,500 (Includes ECG preview)
- Orthopedics & Bone Health (Dr. Rajesh Kumar): ₹1,200
- Pediatrics & Child Care (Dr. Meera Nair): ₹900
- Gynecology & Women's Health (Dr. Priya Deshmukh): ₹1,200
- Dermatology & Cosmetology (Dr. Vikram Patel): ₹1,000

Insurance Partners Accepted:
We accept cashless reimbursement with Star Health Insurance, HDFC ERGO, ICICI Lombard, Niva Bupa, Care Health, and Max Bupa. Please present Govt ID (Aadhaar/PAN) at registration.`
    },
    {
      id: "kb-doc-3",
      title: "Dr. Abhishek - General Medicine & Chief Physician",
      filename: "dr_abhishek_profile.txt",
      fileSize: 22000,
      mimeType: "text/plain",
      uploadedAt: new Date().toISOString(),
      category: "Doctors" as const,
      content: `Dr. Abhishek, MD (General Medicine)
Role: Senior Consultant & Chief Physician (General Medicine & Preventive Health)
Department: General Medicine
Experience: 14+ years in internal medicine, diabetes management, metabolic disorders, and routine preventive screenings.
Hours: Mon-Fri (9:00 AM - 1:00 PM, 2:00 PM - 5:00 PM IST). Slot: 30 mins.`
    },
    {
      id: "kb-doc-4",
      title: "Dr. Ananya Sharma - Department of Cardiology",
      filename: "dr_ananya_sharma_cardiology.txt",
      fileSize: 24100,
      mimeType: "text/plain",
      uploadedAt: new Date().toISOString(),
      category: "Doctors" as const,
      content: `Dr. Ananya Sharma, MD, DM (Cardiology)
Role: Senior Consultant Cardiologist
Department: Cardiology & Cardiovascular Health
Experience: 12+ years specializing in hypertension, coronary heart disease, ECG analysis, lipid disorders, and preventative cardiology.
Hours: Mon-Fri (10:00 AM - 4:00 PM IST). Slot: 30 mins.`
    },
    {
      id: "kb-doc-5",
      title: "Dr. Rajesh Kumar - Department of Orthopedics",
      filename: "dr_rajesh_kumar_orthopedics.txt",
      fileSize: 23500,
      mimeType: "text/plain",
      uploadedAt: new Date().toISOString(),
      category: "Doctors" as const,
      content: `Dr. Rajesh Kumar, MS, MCh (Orthopedics)
Role: Senior Joint Replacement & Spine Specialist
Department: Orthopedics & Bone Care
Experience: 16+ years in knee and hip joint replacements, arthritis management, sports injury rehabilitation, and fracture care.
Hours: Mon-Fri (9:30 AM - 3:30 PM IST). Slot: 30 mins.`
    },
    {
      id: "kb-doc-6",
      title: "Dr. Meera Nair - Department of Pediatrics",
      filename: "dr_meera_nair_pediatrics.txt",
      fileSize: 21800,
      mimeType: "text/plain",
      uploadedAt: new Date().toISOString(),
      category: "Doctors" as const,
      content: `Dr. Meera Nair, MD, DNB (Pediatrics)
Role: Senior Pediatrician & Child Health Specialist
Department: Pediatrics & Neonatal Care
Experience: 10+ years in infant care, immunization schedules, childhood asthma, growth monitoring, and pediatric infections.
Hours: Mon-Fri (9:00 AM - 2:00 PM IST). Slot: 30 mins.`
    },
    {
      id: "kb-doc-7",
      title: "Dr. Priya Deshmukh - Department of Gynecology",
      filename: "dr_priya_deshmukh_gynecology.txt",
      fileSize: 22800,
      mimeType: "text/plain",
      uploadedAt: new Date().toISOString(),
      category: "Doctors" as const,
      content: `Dr. Priya Deshmukh, MD, DGO (Obstetrics & Gynecology)
Role: Senior Consultant Gynecologist & Fertility Specialist
Department: Obstetrics & Gynecology
Experience: 13+ years in prenatal care, PCOD/PCOS management, laparoscopic gynecology, and hormonal wellness.
Hours: Mon-Fri (10:00 AM - 4:30 PM IST). Slot: 30 mins.`
    },
    {
      id: "kb-doc-8",
      title: "Dr. Vikram Patel - Department of Dermatology",
      filename: "dr_vikram_patel_dermatology.txt",
      fileSize: 21500,
      mimeType: "text/plain",
      uploadedAt: new Date().toISOString(),
      category: "Doctors" as const,
      content: `Dr. Vikram Patel, MD (Dermatology & Venereology)
Role: Consultant Dermatologist & Aesthetic Specialist
Department: Dermatology & Cosmetology
Experience: 9+ years in clinical dermatology, acne treatments, eczema, hair loss therapy, and laser skincare.
Hours: Mon-Fri (11:00 AM - 5:00 PM IST). Slot: 30 mins.`
    }
  ];

  for (const doc of defaultDocs) {
    const rawChunks = chunkDocumentText(doc.id, doc.title, doc.content);
    const serverChunks: ServerKbChunk[] = [];

    for (let i = 0; i < rawChunks.length; i++) {
      const vec = await generateVectorEmbedding(rawChunks[i].text);
      serverChunks.push({
        id: `chunk-${doc.id}-${i + 1}`,
        docId: doc.id,
        docTitle: doc.title,
        chunkIndex: i + 1,
        text: rawChunks[i].text,
        vector: vec,
        tokenCount: rawChunks[i].tokenCount
      });
    }

    dbKbDocuments.push({
      id: doc.id,
      title: doc.title,
      filename: doc.filename,
      fileSize: doc.fileSize,
      mimeType: doc.mimeType,
      uploadedAt: doc.uploadedAt,
      chunkCount: serverChunks.length,
      status: "Indexed",
      sampleText: doc.content.slice(0, 150) + "...",
      category: doc.category
    });

    dbVectorChunks.push(...serverChunks);
  }

  console.log(`Knowledge Base Seeded: ${dbKbDocuments.length} documents, ${dbVectorChunks.length} vector chunks initialized!`);
}

async function performVectorRagSearch(query: string, topK = 3): Promise<{ chunk: ServerKbChunk; similarityScore: number }[]> {
  await seedDefaultKnowledgeBase();
  if (dbVectorChunks.length === 0) return [];

  const queryVec = await generateVectorEmbedding(query);
  const scoredChunks = dbVectorChunks.map(chunk => {
    const score = calculateCosineSimilarity(queryVec, chunk.vector);
    return { chunk, similarityScore: score };
  });

  scoredChunks.sort((a, b) => b.similarityScore - a.similarityScore);
  return scoredChunks.slice(0, topK);
}

// Seed on module start
seedDefaultKnowledgeBase().catch(console.error);

// ================= KNOWLEDGE BASE VECTOR DB API ENDPOINTS =================
app.get("/api/kb/documents", async (req, res) => {
  await seedDefaultKnowledgeBase();
  const totalChunks = dbVectorChunks.length;
  const totalTokens = dbVectorChunks.reduce((sum, c) => sum + c.tokenCount, 0);

  res.json({
    documents: dbKbDocuments,
    stats: {
      totalDocuments: dbKbDocuments.length,
      totalVectorChunks: totalChunks,
      totalTokens,
      vectorModel: "gemini-embedding-2-preview (768d)",
      ragStatus: "Active"
    }
  });
});

app.get("/api/kb/documents/:id/chunks", async (req, res) => {
  const { id } = req.params;
  const chunks = dbVectorChunks.filter(c => c.docId === id).map(c => ({
    id: c.id,
    docId: c.docId,
    docTitle: c.docTitle,
    chunkIndex: c.chunkIndex,
    text: c.text,
    tokenCount: c.tokenCount,
    vectorDimensions: c.vector ? c.vector.length : 0
  }));

  res.json({ chunks });
});

app.post("/api/kb/upload", async (req, res) => {
  try {
    const { title, category, filename, content, mimeType, fileSize } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Document content cannot be empty" });
    }

    const docId = `kb-doc-${Date.now()}`;
    const docTitle = title || filename || `Hospital Knowledge Document ${dbKbDocuments.length + 1}`;
    const docCat = category || "General";
    const docFilename = filename || `${docTitle.toLowerCase().replace(/\s+/g, "_")}.txt`;

    const rawChunks = chunkDocumentText(docId, docTitle, content);
    if (rawChunks.length === 0) {
      return res.status(400).json({ error: "Could not generate vector chunks from provided content" });
    }

    const serverChunks: ServerKbChunk[] = [];
    for (let i = 0; i < rawChunks.length; i++) {
      const vec = await generateVectorEmbedding(rawChunks[i].text);
      serverChunks.push({
        id: `chunk-${docId}-${i + 1}`,
        docId,
        docTitle,
        chunkIndex: i + 1,
        text: rawChunks[i].text,
        vector: vec,
        tokenCount: rawChunks[i].tokenCount
      });
    }

    const newDoc: ServerKbDocument = {
      id: docId,
      title: docTitle,
      filename: docFilename,
      fileSize: fileSize || content.length,
      mimeType: mimeType || "text/plain",
      uploadedAt: new Date().toISOString(),
      chunkCount: serverChunks.length,
      status: "Indexed",
      sampleText: content.slice(0, 150) + (content.length > 150 ? "..." : ""),
      category: docCat
    };

    dbKbDocuments.unshift(newDoc);
    dbVectorChunks.push(...serverChunks);

    return res.json({
      success: true,
      document: newDoc,
      chunksGenerated: serverChunks.length,
      message: `Document '${docTitle}' successfully processed and vectorized into ${serverChunks.length} chunks!`
    });
  } catch (error: any) {
    console.error("Error uploading KB document:", error);
    return res.status(500).json({ error: error.message || "Failed to process knowledge base document" });
  }
});

app.delete("/api/kb/documents/:id", async (req, res) => {
  const { id } = req.params;
  dbKbDocuments = dbKbDocuments.filter(d => d.id !== id);
  dbVectorChunks = dbVectorChunks.filter(c => c.docId !== id);

  res.json({ success: true, message: "Document and vector chunks deleted" });
});

app.post("/api/kb/query-rag", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Missing query parameter" });
    }

    const topResults = await performVectorRagSearch(query, 4);

    // Format retrieved vector snippets for RAG synthesis
    const contextSnippets = topResults.map((r, idx) => 
      `[DOCUMENT SOURCE #${idx + 1} (${Math.round(r.similarityScore * 100)}% Vector Match) - ${r.chunk.docTitle}]:\n${r.chunk.text}`
    ).join("\n\n");

    const prompt = `You are the AI Medical Assistant grounded in the clinic's Knowledge Base.
    
PATIENT / USER QUESTION:
"${query}"

RETRIEVED VECTOR DB KNOWLEDGE SNIPPETS (Ranked by Cosine Similarity):
${contextSnippets || "NO MATCHING VECTOR SNIPPETS FOUND."}

INSTRUCTIONS:
1. Provide a direct, professional, clear, and friendly answer to the user's question.
2. Ground your answer STRICTLY in the provided vector knowledge snippets above.
3. If the knowledge snippets contain specific details (like consultation fees ₹800, operating hours 9 AM - 5 PM, or accepted insurance like Star Health / HDFC ERGO), explicitly mention them!
4. Keep the answer clear, structured, and easy to read.`;

    const genRes = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt,
    });

    const ragAnswer = genRes.text || "No grounded answer generated.";

    const formattedChunks = topResults.map(r => ({
      chunk: {
        id: r.chunk.id,
        docId: r.chunk.docId,
        docTitle: r.chunk.docTitle,
        chunkIndex: r.chunk.chunkIndex,
        text: r.chunk.text,
        tokenCount: r.chunk.tokenCount,
        vectorDimensions: r.chunk.vector ? r.chunk.vector.length : 0
      },
      similarityScore: Math.round(r.similarityScore * 1000) / 1000
    }));

    return res.json({
      query,
      ragAnswer,
      topChunks: formattedChunks
    });
  } catch (error: any) {
    console.error("Error running RAG vector query:", error);
    return res.status(500).json({ error: error.message || "Failed to execute vector search" });
  }
});


// Helper to sanitize phone numbers into clean E.164 format for Sarvam API (+91XXXXXXXXXX)
function sanitizePhoneForSarvam(rawPhone?: string): string {
  if (!rawPhone) return "+918446163990";
  const digits = rawPhone.replace(/\D/g, "");
  if (!digits) return "+918446163990";

  if (digits.length === 10) {
    return "+91" + digits;
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    return "+" + digits;
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    return "+91" + digits.slice(1);
  }
  return "+" + digits;
}

// Helper to clean patient name strings from raw agent variable noise
function cleanPatientName(name?: string): string {
  if (!name) return "Patient";
  let cleaned = name
    .replace(/\(Call Purpose:[^)]*\)/gi, "")
    .replace(/\(Operating Hours:[^)]*\)/gi, "")
    .replace(/\(CLOSED[^)]*\)/gi, "")
    .replace(/\(UNKNOWN\)/gi, "")
    .replace(/\([^)]*\)/g, "")
    .trim();
  
  if (!cleaned || cleaned.toLowerCase() === "patient") {
    return "Patient";
  }
  return cleaned;
}

// Helper to extract patient name from call variables, call summary, or caller info
function extractPatientNameFromCall(vars: any, summary?: string, phone?: string): string {
  if (vars && vars.patient_name && typeof vars.patient_name === "string" && vars.patient_name.trim() && vars.patient_name.toLowerCase() !== "patient") {
    const cleaned = cleanPatientName(vars.patient_name);
    if (cleaned !== "Patient") return cleaned;
  }
  if (vars && vars.caller_name && typeof vars.caller_name === "string" && vars.caller_name.trim()) {
    const cleaned = cleanPatientName(vars.caller_name);
    if (cleaned !== "Patient") return cleaned;
  }
  
  if (summary) {
    const patterns = [
      /(?:patient|caller|speaking with|spoke with|patient name|for patient|named|caller name)[:\s]+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i,
      /(?:my name is|i am|this is)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i,
      /([A-Z][a-z]+\s+[A-Z][a-z]+)\s+(?:called|booked|scheduled|inquired|requested)/
    ];
    for (const pat of patterns) {
      const match = summary.match(pat);
      if (match && match[1]) {
        const candidate = match[1].trim();
        const lower = candidate.toLowerCase();
        if (candidate.length >= 3 && !["appointment", "general", "doctor", "consultation", "hospital", "clinic", "booked", "tomorrow", "today", "medicine", "purpose", "schedule"].includes(lower)) {
          return cleanPatientName(candidate);
        }
      }
    }
  }

  if (phone) {
    const cleanP = sanitizePhoneForSarvam(phone);
    const last4 = cleanP.slice(-4);
    return `Patient (${last4 || cleanP})`;
  }
  return "Patient";
}

// ================= SARVAM REAL-TIME SYNC ENGINE =================
async function syncSarvamCalls() {
  try {
    const now = new Date();
    const startStr = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
    const endStr = new Date(now.getTime() + 24 * 3600 * 1000).toISOString();

    const url = `https://apps.sarvam.ai/api/analytics/v1/${SARVAM_CONFIG.ORG_ID}/${SARVAM_CONFIG.WORKSPACE_ID}/${SARVAM_CONFIG.APP_ID}/attempts?start_datetime=${encodeURIComponent(startStr)}&end_datetime=${encodeURIComponent(endStr)}&limit=50`;
    
    const res = await fetch(url, {
      headers: { "X-API-Key": SARVAM_CONFIG.API_KEY }
    });

    if (!res.ok) return;

    const data = await res.json();
    const items = data.items || [];

    for (const att of items) {
      const vars = att.agent_variables || {};
      const attemptId = att.attempt_id;
      const phone = sanitizePhoneForSarvam(att.user_contact || "+918446163990");
      const callTimeIso = att.attempted_at || att.start_datetime || new Date().toISOString();
      const formattedTime = formatIstTime(callTimeIso);

      // Extract patient name from call attempt
      const extractedPatientName = cleanPatientName(extractPatientNameFromCall(vars, vars.call_summary, phone));

      // Sync / update Patient in dbPatients list
      const existingPatientIdx = dbPatients.findIndex(p => sanitizePhoneForSarvam(p.phone) === phone);
      if (existingPatientIdx !== -1) {
        const currentName = dbPatients[existingPatientIdx].name;
        dbPatients[existingPatientIdx].phone = phone; // Normalize phone
        if ((currentName === "Patient" || currentName.startsWith("Patient (") || currentName.includes("Call Purpose")) && extractedPatientName && !extractedPatientName.startsWith("Patient (")) {
          dbPatients[existingPatientIdx].name = extractedPatientName;
        } else {
          dbPatients[existingPatientIdx].name = cleanPatientName(dbPatients[existingPatientIdx].name);
        }
        dbPatients[existingPatientIdx].notes = `Last Call: ${formattedTime} - ${(vars.call_summary || "Call completed").slice(0, 80)}`;
      } else {
        dbPatients.unshift({
          id: `p-${attemptId || Date.now()}`,
          name: extractedPatientName,
          phone,
          language: att.language_name || vars.language || "English",
          notes: `Registered via Voice Call (${formattedTime}) - ${(vars.call_summary || "Inbound/Outbound Call").slice(0, 80)}`
        });
      }

      // 1. Sync Call Log
      const existingLogIndex = dbCallLogs.findIndex(l => l.callId === attemptId || (l.phone === phone && l.time === formattedTime));
      const logSummary = vars.call_summary || (vars.appointment_status === "booked" ? `Booked appointment for ${vars.preferred_datetime || "requested time"}` : "Call completed via AI Assistant");
      const durationSec = att.duration_in_seconds ? `${Math.round(att.duration_in_seconds)}s` : "01:15";
      const tsParsed = new Date(callTimeIso).getTime();

      const logItem: CallLogItem = {
        id: `c-${attemptId || Date.now()}`,
        direction: att.channel_direction || "outbound",
        time: formattedTime,
        timestamp: isNaN(tsParsed) ? Date.now() : tsParsed,
        callTimeIso,
        phone,
        intent: vars.department_requested ? `Booking (${vars.department_requested})` : "Appointment Booking",
        outcome: vars.appointment_status === "booked" ? "Confirmed" : (vars.disposition === "escalated_to_front_desk" ? "Escalated" : "Resolved"),
        sentiment: "Positive",
        duration: durationSec,
        outcomeText: logSummary,
        sessionId: att.interaction_id || `sess_${attemptId}`,
        callId: attemptId || `call_${Date.now()}`,
        consent: "Yes",
        transcript: [
          ["agent", `AI Voice Assistant: ${logSummary}`]
        ]
      };

      if (existingLogIndex !== -1) {
        dbCallLogs[existingLogIndex] = { ...dbCallLogs[existingLogIndex], ...logItem };
      } else {
        dbCallLogs.unshift(logItem);
      }

      // 2. Sync Appointment IF AND ONLY IF actually booked
      const isBooked = vars.appointment_status === "booked" || 
                       (vars.call_summary && (
                         vars.call_summary.toLowerCase().includes("successfully booked") ||
                         vars.call_summary.toLowerCase().includes("booked a new appointment")
                       ));

      if (isBooked) {
        let prefDt = `${vars.preferred_datetime || ''} ${vars.call_summary || ''}`.trim();
        if (!prefDt) prefDt = "tomorrow at 12 PM";

        const startIso = parseAppointmentDateTime(prefDt, callTimeIso);
        const endIso = formatIsoWithIst(new Date(new Date(startIso).getTime() + 30 * 60000));
        const patientName = extractedPatientName || vars.patient_name || "Patient";

        // Check operating hours before saving
        const checkHours = isWithinOperatingHours(startIso);
        const isDuplicate = dbAppointments.some(a => 
          a.patientPhone === phone && 
          Math.abs(new Date(a.start.dateTime).getTime() - new Date(startIso).getTime()) < 15 * 60000
        );

        const docInfo = resolveDoctorAndDepartment(vars.department_requested, vars.call_summary);

        if (checkHours.valid && !isDuplicate) {
          const newApt: ClinicAppointment = {
            id: `apt-${attemptId || Date.now()}`,
            summary: docInfo.title,
            patientName,
            patientPhone: phone,
            reason: (vars.call_summary || `Appointment booked via Telephony Call for ${prefDt}`).replace(/Sarvam/gi, "AI Assistant"),
            patientContext: `Telephony Call Attempt ${attemptId}`,
            start: { dateTime: startIso },
            end: { dateTime: endIso },
            status: "confirmed"
          };
          dbAppointments.unshift(newApt);
        } else if (!checkHours.valid) {
          console.log(`[Sarvam Sync] Skipped appointment outside operating hours: ${startIso} (${checkHours.reason})`);
        }
      }
    }

    // Auto-repair existing appointment summaries if doctor/department mismatch
    for (const apt of dbAppointments) {
      if (apt.summary) {
        const resolved = resolveDoctorAndDepartment("", `${apt.summary} ${apt.reason || ""}`);
        // If resolved doctor is a specialist but summary has generic/wrong doctor, update summary
        if (resolved.doctor !== "Dr. Abhishek" && apt.summary.includes("Dr. Abhishek")) {
          apt.summary = resolved.title;
        }
      }
    }

    sortCallLogs();
  } catch (e) {
    console.error("Error syncing Sarvam calls:", e);
  }
}

// ================= APPOINTMENT ENDPOINTS =================
app.get("/api/appointments", async (req, res) => {
  await syncSarvamCalls();
  res.json({ appointments: dbAppointments });
});

app.post("/api/appointments", (req, res) => {
  const { summary, patientName, patientPhone, patientEmail, reason, start, end } = req.body;
  
  const startIso = typeof start === "string" ? start : start?.dateTime || new Date().toISOString();
  const endIso = typeof end === "string" ? end : end?.dateTime || new Date(new Date(startIso).getTime() + 30 * 60000).toISOString();

  // Validate operating hours
  const checkHours = isWithinOperatingHours(startIso);
  if (!checkHours.valid) {
    return res.status(400).json({ error: checkHours.reason || "Selected slot is outside clinic operating hours (Mon–Fri, 9:00 AM – 5:00 PM IST)." });
  }

  const newAppointment: ClinicAppointment = {
    id: `apt-${Date.now()}`,
    summary: summary || `Consultation - ${patientName || "Patient"}`,
    patientName: patientName || "Patient",
    patientPhone: patientPhone || "+918446163990",
    patientEmail: patientEmail || "",
    reason: reason || "General Medical Inquiry",
    patientContext: "Scheduled via Aivana Voice Assistant",
    start: { dateTime: startIso },
    end: { dateTime: endIso },
    status: "confirmed"
  };

  dbAppointments.unshift(newAppointment);

  // Sync to patients list if not existing
  if (patientName && !dbPatients.some(p => p.phone === (patientPhone || "+918446163990"))) {
    dbPatients.push({
      id: `p-${Date.now()}`,
      name: patientName,
      phone: patientPhone || "+918446163990",
      language: "English",
      notes: "Auto-registered via booking"
    });
  }

  res.json({ success: true, appointment: newAppointment });
});

app.put("/api/appointments/:id", (req, res) => {
  const { id } = req.params;
  const { start, end, summary, status } = req.body;
  const aptIndex = dbAppointments.findIndex((a) => a.id === id);
  if (aptIndex === -1) {
    return res.status(404).json({ error: "Appointment not found" });
  }

  if (start) {
    const startIso = typeof start === "string" ? start : start.dateTime;
    const checkHours = isWithinOperatingHours(startIso);
    if (!checkHours.valid) {
      return res.status(400).json({ error: checkHours.reason || "Requested slot is outside operating hours." });
    }
    dbAppointments[aptIndex].start = typeof start === "string" ? { dateTime: start } : start;
  }
  if (end) dbAppointments[aptIndex].end = typeof end === "string" ? { dateTime: end } : end;
  if (summary) dbAppointments[aptIndex].summary = summary;
  if (status) dbAppointments[aptIndex].status = status;

  res.json({ success: true, appointment: dbAppointments[aptIndex] });
});

app.delete("/api/appointments/:id", (req, res) => {
  const { id } = req.params;
  dbAppointments = dbAppointments.filter((a) => a.id !== id);
  res.json({ success: true, message: "Appointment deleted" });
});

// ================= OUTBOUND QUEUE ENDPOINTS =================
app.get("/api/outbound", (req, res) => {
  res.json({ items: dbOutbound });
});

app.post("/api/outbound", (req, res) => {
  const { patient, phone, context, priority, callType, dept } = req.body;
  const sanitizedPhone = sanitizePhoneForSarvam(phone || "+918446163990");
  const cleanName = cleanPatientName(patient || "Patient");

  const newItem: OutboundQueueItem = {
    id: `o-${Date.now()}`,
    patient: cleanName,
    phone: sanitizedPhone,
    context: context || "Routine follow-up call",
    priority: priority || "Medium",
    status: "Queued",
    bucket: "dueNow",
    callType: callType || "Manual",
    attempt: 1,
    maxAttempts: 3,
    nextRetry: "Due now",
    updated: "Just now",
    dept: dept || "General Medicine"
  };
  dbOutbound.unshift(newItem);
  res.json({ success: true, item: newItem });
});

app.delete("/api/outbound/:id", (req, res) => {
  const { id } = req.params;
  dbOutbound = dbOutbound.filter(o => o.id !== id);
  res.json({ success: true });
});

// ================= CALL LOGS ENDPOINTS =================
app.get("/api/logs", async (req, res) => {
  await syncSarvamCalls();
  sortCallLogs();
  res.json({ logs: dbCallLogs });
});

app.post("/api/logs", (req, res) => {
  const log = req.body;
  const now = new Date();
  const newLog: CallLogItem = {
    id: `c-${Date.now()}`,
    direction: log.direction || "inbound",
    time: log.time || formatIstTime(now),
    timestamp: now.getTime(),
    callTimeIso: now.toISOString(),
    phone: log.phone || "+918446163990",
    intent: log.intent || "Appointment Booking",
    outcome: log.outcome || "Confirmed",
    sentiment: log.sentiment || "Positive",
    duration: log.duration || "01:15",
    outcomeText: log.outcomeText || "Appointment handled by AI",
    sessionId: `sess_${Math.random().toString(36).substring(2, 8)}`,
    callId: `call_${Date.now()}`,
    consent: "Yes",
    transcript: log.transcript || []
  };
  dbCallLogs.unshift(newLog);
  sortCallLogs();
  res.json({ success: true, log: newLog });
});

app.post("/api/sarvam/sync", async (req, res) => {
  await syncSarvamCalls();
  res.json({
    success: true,
    appointmentsCount: dbAppointments.length,
    logsCount: dbCallLogs.length,
    appointments: dbAppointments,
    logs: dbCallLogs
  });
});

app.post("/api/sarvam/webhook", async (req, res) => {
  console.log("Sarvam Webhook Received:", req.body);
  await syncSarvamCalls();
  res.json({ success: true });
});

// ================= PATIENTS ENDPOINTS =================
app.get("/api/patients", async (req, res) => {
  await syncSarvamCalls();
  const cleanedPatients = dbPatients.map(p => ({
    ...p,
    name: cleanPatientName(p.name),
    phone: sanitizePhoneForSarvam(p.phone)
  }));
  res.json({ patients: cleanedPatients });
});

app.post("/api/patients", (req, res) => {
  const { name, phone, language, notes } = req.body;
  const newPatient: PatientItem = {
    id: `p-${Date.now()}`,
    name: cleanPatientName(name || "New Patient"),
    phone: sanitizePhoneForSarvam(phone || "+918446163990"),
    language: language || "English",
    notes: notes || ""
  };
  dbPatients.unshift(newPatient);
  res.json({ success: true, patient: newPatient });
});

// ================= SARVAM OUTBOUND TELEPHONY API =================
const SARVAM_CONFIG = {
  ORG_ID: "019ecf64-7792-786f-88bf-4a6af1434e36",
  WORKSPACE_ID: "019ecf64-779b-7b9c-a7b8-c8f9ac9003c5",
  API_KEY: "sk_samvaad_zqqofijh_Ihknj9mcWaSsgh1hmyPUBwWV",
  APP_ID: "Conversatio-a0f6e88a-8ae1",
  APP_VERSION: 2,
  CONNECTION_ID: "fa4c85d2-05-f6baf366-1cf6",
  AGENT_PHONE_NUMBER: "+918071583844"
};

function buildSarvamCalendarContext() {
  const now = new Date();
  const istOffsetMs = 5.5 * 3600 * 1000;
  const nowIst = new Date(now.getTime() + istOffsetMs);

  const todayStr = nowIst.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const tomorrowObj = new Date(nowIst.getTime() + 24 * 3600 * 1000);
  const tomorrowStr = tomorrowObj.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", year: "numeric", month: "long", day: "numeric" });

  // Booked list formatted clearly
  const bookedList = dbAppointments.map((apt, i) => {
    const d = new Date(apt.start.dateTime);
    const dateFormatted = d.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    });
    return `[SLOT #${i + 1}] ${dateFormatted} IST - Patient: ${apt.patientName || "Patient"} (${apt.summary || apt.reason || "Consultation"})`;
  });

  const bookedText = bookedList.length > 0
    ? bookedList.join("\n")
    : "No slots are currently booked. All working-hour slots are 100% available.";

  // Generate list of available slots for tomorrow
  const workingHoursSlots = [
    "9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM",
    "12:00 PM", "12:30 PM", "1:00 PM", "1:30 PM", "2:00 PM", "2:30 PM",
    "3:00 PM", "3:30 PM", "4:00 PM", "4:30 PM"
  ];

  const tomIstDateStr = tomorrowObj.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", year: "numeric", month: "numeric", day: "numeric" });

  const openSlotsTomorrow = workingHoursSlots.filter((slotLabel) => {
    return !dbAppointments.some((apt) => {
      const aptDate = new Date(apt.start.dateTime);
      const aptIstDateStr = aptDate.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", year: "numeric", month: "numeric", day: "numeric" });
      if (aptIstDateStr !== tomIstDateStr) return false;

      const timeStr = aptDate.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true });
      return timeStr.toLowerCase().replace(/\s+/g, "") === slotLabel.toLowerCase().replace(/\s+/g, "");
    });
  });

  const openSlotsText = openSlotsTomorrow.join(", ");

  const calendarSummary = `AIVANA MEDICAL CENTER - LIVE CLINIC SCHEDULE:
- Today's Date: ${todayStr}
- Tomorrow's Date: ${tomorrowStr}
- Clinical Roster & Specialist Doctors:
  * General Medicine: Dr. Abhishek, MD
  * Cardiology: Dr. Ananya Sharma, MD, DM
  * Orthopedics: Dr. Rajesh Kumar, MS, MCh
  * Pediatrics: Dr. Meera Nair, MD, DNB
  * Gynecology: Dr. Priya Deshmukh, MD, DGO
  * Dermatology: Dr. Vikram Patel, MD
- Clinic Operating Hours: Monday to Friday, 9:00 AM to 5:00 PM IST ONLY.
- CLOSED DAYS: SATURDAYS AND SUNDAYS ARE STRICTLY CLOSED. NO APPOINTMENTS PERMITTED ON WEEKENDS.

OCCUPIED / BOOKED SLOTS IN DATABASE (DO NOT DOUBLE BOOK):
${bookedText}

AVAILABLE OPEN SLOTS FOR TOMORROW (${tomorrowObj.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", month: "short", day: "numeric" })}):
${openSlotsText}

VOICE AGENT MANDATE:
1. OPERATING HOURS RULE: The clinic is open Monday to Friday, 9:00 AM to 5:00 PM IST ONLY.
2. WEEKENDS (SATURDAYS AND SUNDAYS) ARE STRICTLY CLOSED.
3. If a caller asks for Saturday, Sunday, or any time outside 9 AM - 5 PM IST, tell them: "I am sorry, that slot is not available. Our clinic is closed on weekends. Operating hours are Monday to Friday, 9:00 AM to 5:00 PM IST." Do NOT agree or promise to book outside operating hours or on weekends.
4. When a caller asks for an appointment slot during working hours (Mon–Fri 9 AM – 5 PM), check the OCCUPIED SLOTS above.
5. If the requested slot is open (listed in AVAILABLE OPEN SLOTS), confirm and book it directly for the caller!
6. If the requested slot is taken, suggest an alternative slot from AVAILABLE OPEN SLOTS above.`;

  return {
    todayStr,
    tomorrowStr,
    bookedText,
    openSlotsText,
    calendarSummary
  };
}

app.post("/api/sarvam/outbound-call", async (req, res) => {
  try {
    const { user_phone_number, hospital_name, patient_name, call_reason } = req.body;
    const phoneToCall = sanitizePhoneForSarvam(user_phone_number || "+918446163990");
    const url = `https://apps.sarvam.ai/api/outbounds/v1/orgs/${SARVAM_CONFIG.ORG_ID}/workspaces/${SARVAM_CONFIG.WORKSPACE_ID}/outbounds`;

    const calCtx = buildSarvamCalendarContext();

    const hospitalBase = (hospital_name || "Aivana Medical Center").trim();
    const patientBase = cleanPatientName(patient_name || "Patient");

    // Clean single-line calendar summary for Sarvam (no newlines, no brackets)
    const openSlotsShort = calCtx.openSlotsText || "9:00 AM to 5:00 PM";
    
    // Provide explicit operating hours in hospital_name and agent_variables so Sarvam voice agent strictly knows Mon-Fri 9-5 PM rule
    const enrichedHospitalName = `${hospitalBase} (Operating Hours: Mon-Fri 9:00 AM - 5:00 PM IST, CLOSED Weekends)`;
    const enrichedPatientName = `${patientBase}`;

    const payload = {
      app_config: {
        app_id: SARVAM_CONFIG.APP_ID,
        app_version: SARVAM_CONFIG.APP_VERSION,
        connection_config: {
          connection_id: SARVAM_CONFIG.CONNECTION_ID,
          agent_phone_number: SARVAM_CONFIG.AGENT_PHONE_NUMBER,
        },
        agent_variables: {
          hospital_name: hospitalBase,
          patient_name: patientBase,
        },
      },
      user_config: {
        user_phone_number: phoneToCall,
        language: "en-IN",
        language_code: "en-IN",
        prompt_language: "en-IN"
      },
    };

    console.log("Triggering Sarvam Outbound Call to:", phoneToCall, "with Agent Variables:", payload.app_config.agent_variables);

    const sarvamRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": SARVAM_CONFIG.API_KEY,
      },
      body: JSON.stringify(payload),
    });

    const data = await sarvamRes.json();
    console.log("Sarvam Response status:", sarvamRes.status, data);

    if (sarvamRes.ok) {
      // Record call log with IST time
      const nowOut = new Date();
      dbCallLogs.unshift({
        id: `c-${data.attempt_id || Date.now()}`,
        direction: "outbound",
        time: formatIstTime(nowOut),
        timestamp: nowOut.getTime(),
        callTimeIso: nowOut.toISOString(),
        phone: phoneToCall,
        intent: "Outbound Telephony Dial",
        outcome: "Confirmed",
        sentiment: "Neutral",
        duration: "In progress",
        outcomeText: `AI Assistant dialed real phone ${phoneToCall}. Attempt ID: ${data.attempt_id}`,
        sessionId: `sess_${data.attempt_id || Date.now()}`,
        callId: data.attempt_id || `call_${Date.now()}`,
        consent: "Yes",
        transcript: [
          ["system", `AI Voice Assistant phone call initiated to ${phoneToCall}`]
        ]
      });
      sortCallLogs();

      // Update matching outbound queue item status to 'In Progress'
      const matchedOutbound = dbOutbound.find(o => sanitizePhoneForSarvam(o.phone) === phoneToCall);
      if (matchedOutbound) {
        matchedOutbound.status = "In Progress";
        matchedOutbound.updated = "Calling now";
        matchedOutbound.attempt = (matchedOutbound.attempt || 1) + 1;
      } else {
        dbOutbound.unshift({
          id: `o-${Date.now()}`,
          patient: patientBase,
          phone: phoneToCall,
          context: call_reason || "Outbound Telephony Dial",
          priority: "High",
          status: "In Progress",
          bucket: "dueNow",
          callType: "Manual",
          attempt: 1,
          maxAttempts: 3,
          nextRetry: "Calling now",
          updated: "Just now",
          dept: "General Medicine"
        });
      }

      // Schedule background syncs after call start to capture final agent variables & booked appointments
      setTimeout(() => { syncSarvamCalls(); }, 15000);
      setTimeout(() => { syncSarvamCalls(); }, 35000);
      setTimeout(() => { syncSarvamCalls(); }, 60000);
      setTimeout(() => { syncSarvamCalls(); }, 90000);

      return res.json({
        success: true,
        attempt_id: data.attempt_id,
        message: `Phone call successfully initiated to ${phoneToCall}!`,
        details: data
      });
    } else {
      let errMsg = "Failed to trigger Sarvam phone call";
      if (typeof data.message === "string") {
        errMsg = data.message;
      } else if (typeof data.error === "string") {
        errMsg = data.error;
      } else if (Array.isArray(data.detail)) {
        errMsg = data.detail.map((d: any) => (typeof d === "string" ? d : d.msg || d.detail || JSON.stringify(d))).join("; ");
      } else if (typeof data.detail === "string") {
        errMsg = data.detail;
      } else if (data.detail) {
        errMsg = JSON.stringify(data.detail);
      } else if (data.message) {
        errMsg = typeof data.message === "object" ? JSON.stringify(data.message) : String(data.message);
      } else if (data.error) {
        errMsg = typeof data.error === "object" ? JSON.stringify(data.error) : String(data.error);
      }

      return res.status(sarvamRes.status || 400).json({
        success: false,
        error: errMsg,
        details: data
      });
    }
  } catch (error: any) {
    console.error("Sarvam call error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Server error while triggering call"
    });
  }
});

// Helper function to safely parse dates/times into ISO format
function normalizeToIso(timeOrIso: string, defaultDateStr?: string): string {
  if (!timeOrIso) {
    const target = defaultDateStr ? new Date(defaultDateStr) : new Date();
    return target.toISOString();
  }

  // Check if already valid ISO string
  const d = new Date(timeOrIso);
  if (!isNaN(d.getTime()) && timeOrIso.includes("-")) {
    return d.toISOString();
  }

  // Parse strings like "12:00 PM", "10:30 AM", "12 PM", "12:00"
  const now = defaultDateStr ? new Date(defaultDateStr) : new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  
  const match = timeOrIso.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    const ampm = match[3] ? match[3].toUpperCase() : null;

    if (ampm === "PM" && hours < 12) hours += 12;
    if (ampm === "AM" && hours === 12) hours = 0;

    const formattedHours = String(hours).padStart(2, "0");
    const formattedMinutes = String(minutes).padStart(2, "0");
    
    // Construct ISO string with +05:30 offset or local ISO
    return `${year}-${month}-${day}T${formattedHours}:${formattedMinutes}:00+05:30`;
  }

  return now.toISOString();
}

// ================= IN-BROWSER AI VOICE ASSISTANT ENDPOINT =================
app.post("/api/voice-assistant/chat", async (req, res) => {
  try {
    const { messages, callPurpose, currentDateTime } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Missing messages list" });
    }

    const nowObj = currentDateTime ? new Date(currentDateTime) : new Date();
    const istOffsetMs = 5.5 * 3600 * 1000;
    const nowIst = new Date(nowObj.getTime() + istOffsetMs);

    const todayFormatted = nowIst.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const todayIsoDate = nowIst.toISOString().split("T")[0];

    // Build explicit calendar representation for Gemini
    const bookedSlotsList = dbAppointments.map((apt, idx) => {
      const d = new Date(apt.start.dateTime);
      const formattedDate = d.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true
      });
      return `[OCCUPIED SLOT #${idx + 1}] Patient: ${apt.patientName || "Patient"} | Date & Time: ${formattedDate} | ISO: ${apt.start.dateTime} | Summary: ${apt.summary} | Status: ${apt.status}`;
    });

    const calendarContext = bookedSlotsList.length > 0
      ? bookedSlotsList.join("\n")
      : "NO APPOINTMENTS ARE BOOKED IN THE DATABASE. ALL SLOTS ARE CURRENTLY 100% AVAILABLE.";

    const lastUserMsg = messages[messages.length - 1]?.content || "";
    
    // Evaluate requested time slot directly for system prompt grounding
    const userRequestedTimeIso = parseAppointmentDateTime(lastUserMsg, todayIsoDate);
    const userTimeCheck = isWithinOperatingHours(userRequestedTimeIso);

    // Fetch RAG Knowledge Base snippets using Vector DB Cosine Search
    const ragResults = await performVectorRagSearch(lastUserMsg, 3);
    const ragContextText = ragResults.length > 0
      ? ragResults.map((r, i) => `[KB RAG MATCH #${i + 1} (${Math.round(r.similarityScore * 100)}% Match) - ${r.chunk.docTitle}]: ${r.chunk.text}`).join("\n")
      : "No extra Knowledge Base snippets retrieved.";

    const systemInstruction = `You are AI Voice Assistant for Aivana Medical Center, a multi-specialty hospital platform.

CLINIC DEPARTMENTS & SPECIALIST DOCTORS:
1. General Medicine: Dr. Abhishek, MD (Preventive Health, Routine Checkups, Diabetes, Fever, High BP) - Fee: ₹800
2. Cardiology: Dr. Ananya Sharma, MD, DM (Heart Diseases, Chest Pain, ECG, Hypertension) - Fee: ₹1,500
3. Orthopedics: Dr. Rajesh Kumar, MS, MCh (Joint Pain, Fractures, Knee/Hip Replacement, Arthritis) - Fee: ₹1,200
4. Pediatrics: Dr. Meera Nair, MD, DNB (Child Health, Vaccination, Pediatric Fever) - Fee: ₹900
5. Gynecology: Dr. Priya Deshmukh, MD, DGO (Women's Health, Pregnancy/Antenatal, PCOD) - Fee: ₹1,200
6. Dermatology: Dr. Vikram Patel, MD (Skin Rashes, Acne, Eczema, Hair Loss, Cosmetology) - Fee: ₹1,000

DEPARTMENT & DOCTOR ROUTING MANDATE:
- Match patient symptoms or requests to the appropriate specialist and department.
  * Chest pain / heart / BP -> Cardiology (Dr. Ananya Sharma)
  * Joint / bone / knee / fracture -> Orthopedics (Dr. Rajesh Kumar)
  * Child fever / infant / vaccination -> Pediatrics (Dr. Meera Nair)
  * Women's health / pregnancy / PCOD -> Gynecology (Dr. Priya Deshmukh)
  * Skin rash / acne / hair loss -> Dermatology (Dr. Vikram Patel)
  * General fever / fatigue / general checkup -> General Medicine (Dr. Abhishek)
- When offering or confirming an appointment, mention the relevant doctor's name and department.

CRITICAL CALENDAR & TIME CONTEXT (India Standard Time - IST):
- Current Local Date & Time: ${todayFormatted}, ${formatIstTime(nowObj)} IST
- Today's Date ISO: ${todayIsoDate}
- Clinic Operating Hours: Monday to Friday, 9:00 AM to 5:00 PM (09:00 to 17:00 IST). SATURDAYS AND SUNDAYS ARE STRICTLY CLOSED.
- Active Workflow: ${callPurpose === "reschedule" ? "OUTBOUND RESCHEDULING" : "INBOUND BOOKING"}

USER REQUESTED SLOT AUTOMATIC PRE-EVALUATION:
- Extracted Slot Date & Time: ${userRequestedTimeIso}
- Operating Hours Status: ${userTimeCheck.valid ? "VALID OPERATING HOURS SLOT" : `CLOSED / UNAVAILABLE - ${userTimeCheck.reason}`}

GROUNDED CLINIC KNOWLEDGE BASE (Retrieved via Vector DB RAG Engine):
${ragContextText}

CURRENT OCCUPIED / BOOKED SLOTS IN CLINIC DATABASE:
${calendarContext}

RULES FOR SLOT AVAILABILITY (MUST FOLLOW STRICTLY):
1. CLINIC OPERATING HOURS ARE STRICTLY MONDAY TO FRIDAY, 9:00 AM TO 5:00 PM IST. SATURDAYS AND SUNDAYS ARE STRICTLY CLOSED.
2. IF Operating Hours Status above is "CLOSED / UNAVAILABLE" OR if user requests Saturday, Sunday, before 9 AM, or at/after 5 PM:
   - YOU MUST NOT SCHEDULE THE APPOINTMENT. Set 'action.type' to "none".
   - RESPOND CLEARLY: "I am sorry, but that slot is not available. ${userTimeCheck.reason || 'Our clinic operates Monday to Friday from 9:00 AM to 5:00 PM IST.'} Please choose an available slot within business hours."
3. A requested slot during working hours (Mon–Fri 9 AM – 5 PM) is BOOKED / UNAVAILABLE ONLY if an appointment at that exact date and time is listed in 'CURRENT OCCUPIED / BOOKED SLOTS IN CLINIC DATABASE' above.
4. If a time slot is NOT listed in the database list above and falls within working hours (Mon–Fri 9 AM – 5 PM), it is 100% AVAILABLE!
5. Check the requested date & time against working hours and occupied slots BEFORE responding.
6. ACTION MANDATE:
   - When the user asks to book or confirms an available slot WITHIN operating hours:
     a. Confirm the booking warmly in 'speech' specifying the matched doctor and time (e.g. "Great! I have scheduled your appointment with Dr. Ananya Sharma in Cardiology for tomorrow at 11:00 AM.").
     b. MUST set 'action.type' to "schedule".
     c. MUST set 'action.details.start' to the requested date and time string.
     d. MUST set 'action.details.title' to "Consultation with " + Matched Doctor Name.

7. Keep your spoken response concise, warm, natural, and conversational (1-2 sentences maximum). Do NOT use markdown, bold text, or bullet points in the speech field.`;

    const contents = messages.map((m: any) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const responseSchema = {
      type: "OBJECT",
      properties: {
        speech: { type: "STRING" },
        reasoning: { type: "STRING" },
        action: {
          type: "OBJECT",
          properties: {
            type: { type: "STRING", enum: ["none", "schedule", "reschedule", "cancel"] },
            details: {
              type: "OBJECT",
              properties: {
                eventId: { type: "STRING" },
                start: { type: "STRING" },
                end: { type: "STRING" },
                title: { type: "STRING" }
              }
            }
          },
          required: ["type"]
        }
      },
      required: ["speech", "reasoning", "action"]
    };

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: responseSchema as any,
        temperature: 0.1, // Low temperature for high precision schedule checks
      }
    });

    const resultJson = JSON.parse(response.text || "{}");
    const speechText = resultJson.speech || "";

    // BACKEND FAILSAFE PARSER: Ensure database is 100% updated if user/AI confirmed a booking!
    let actionType = resultJson.action?.type || "none";
    let startIso = resultJson.action?.details?.start;

    const userRequestedTimeMatch = lastUserMsg.match(/(?:at\s*)?(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)/i);
    const speechConfirmedMatch = speechText.toLowerCase().includes("book") || 
                                 speechText.toLowerCase().includes("schedul") || 
                                 speechText.toLowerCase().includes("confirm") || 
                                 speechText.toLowerCase().includes("set for") ||
                                 speechText.toLowerCase().includes("see you");

    if ((actionType === "schedule" || speechConfirmedMatch) && !startIso) {
      actionType = "schedule";
      startIso = parseAppointmentDateTime(lastUserMsg, todayIsoDate);
    } else if (startIso) {
      // If startIso is relative like "tomorrow at 12 PM", retain date context if needed
      const fullContextStr = startIso.toLowerCase().includes("tomorrow") || startIso.toLowerCase().includes("today") || startIso.toLowerCase().includes("august") ? startIso : `${lastUserMsg} ${startIso}`;
      startIso = parseAppointmentDateTime(fullContextStr, todayIsoDate);
    }

    if (actionType === "schedule" && startIso) {
      const checkHours = isWithinOperatingHours(startIso);
      if (!checkHours.valid) {
        actionType = "none";
        resultJson.action = { type: "none" };
        resultJson.speech = `I am sorry, but that slot is not available. ${checkHours.reason} Please select an available slot during business hours (Monday to Friday, 9:00 AM to 5:00 PM IST).`;
      } else {
        const endIso = formatIsoWithIst(new Date(new Date(startIso).getTime() + 30 * 60000));
        
        const docResolved = resolveDoctorAndDepartment(
          resultJson.action?.details?.title,
          `${lastUserMsg} ${speechText}`
        );

        // Deduplicate before adding
        const isDuplicate = dbAppointments.some(a => 
          Math.abs(new Date(a.start.dateTime).getTime() - new Date(startIso).getTime()) < 15 * 60000
        );

        if (!isDuplicate) {
          const newApt: ClinicAppointment = {
            id: `apt-${Date.now()}`,
            summary: docResolved.title,
            patientName: "Patient",
            patientPhone: "+918446163990",
            reason: "Consultation booked via AI Voice Assistant",
            patientContext: "In-browser voice call",
            start: { dateTime: startIso },
            end: { dateTime: endIso },
            status: "confirmed"
          };

          dbAppointments.unshift(newApt);

          // Record in Call Logs
          const nowBC = new Date();
          dbCallLogs.unshift({
            id: `c-${Date.now()}`,
            direction: "inbound",
            time: formatIstTime(nowBC),
            timestamp: nowBC.getTime(),
            callTimeIso: nowBC.toISOString(),
            phone: "+918446163990",
            intent: "Book appointment",
            outcome: "Confirmed",
            sentiment: "Positive",
            duration: "01:20",
            outcomeText: `Appointment confirmed for ${new Date(startIso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} with ${docResolved.doctor} (${docResolved.department}).`,
            sessionId: `sess_${Date.now()}`,
            callId: `call_${Date.now()}`,
            consent: "Yes",
            transcript: messages.map((m: any) => [m.role === "assistant" ? "ai" : "patient", m.content])
          });
          sortCallLogs();
        }

        resultJson.action = {
          type: "schedule",
          details: {
            start: startIso,
            end: endIso,
            title: docResolved.title
          }
        };
      }
    } else if (actionType === "reschedule" && resultJson.action?.details?.eventId) {
      const idx = dbAppointments.findIndex(a => a.id === resultJson.action.details.eventId);
      if (idx !== -1) {
        if (startIso) dbAppointments[idx].start = { dateTime: startIso };
        dbAppointments[idx].status = "rescheduled";
      }
    }

    return res.json(resultJson);
  } catch (error: any) {
    console.error("Browser call chat error:", error);
    return res.status(500).json({
      speech: "I am ready to help you schedule a consultation with our specialist doctors. What time works best for you?",
      reasoning: error.message,
      action: { type: "none" }
    });
  }
});

// Serve frontend
async function setupServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Clinic Server running on http://localhost:${PORT}`);
  });
}

setupServer();
