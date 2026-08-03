import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Modality, Type } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

// Initialize Gemini SDK with User-Agent header for telemetry
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

app.use(express.json());

// API route: Voice assistant chat powered by Gemini
app.post("/api/voice-assistant/chat", async (req, res) => {
  try {
    const { messages, doctorCalendarEvents, currentDateTime } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Missing or invalid messages list" });
    }

    // Prepare doctor calendar summary to insert into system instructions
    let calendarContext = "No upcoming events scheduled.";
    if (doctorCalendarEvents && Array.isArray(doctorCalendarEvents) && doctorCalendarEvents.length > 0) {
      calendarContext = doctorCalendarEvents
        .map((event: any, idx: number) => {
          const start = event.start?.dateTime || event.start?.date || "unknown";
          const end = event.end?.dateTime || event.end?.date || "unknown";
          return `Appointment ${idx + 1}:
  ID: ${event.id}
  Title: ${event.summary || "Untitled"}
  Start: ${start}
  End: ${end}
  Description: ${event.description || "None"}`;
        })
        .join("\n\n");
    }

    const systemInstruction = `You are a warm, highly human, natural, and professional AI voice assistant for Dr. Abhishek's medical clinic. You handle two distinct clinical scheduling workflows:
1. INBOUND CALL (Book Appointment): Someone new calling our clinic asking when an appointment should be booked for them. When answering an inbound call, greet them warmly as the clinic AI assistant ("Thank you for calling Dr. Abhishek's medical clinic! I'm Zephyr, the clinic AI assistant. How can I help you today?"), ask for their name/reason, check clinic working hours (Monday to Friday, 9:00 AM - 5:00 PM) and the Doctor's Calendar below, and propose available times one by one. When they agree, use the schedule action.
2. OUTBOUND CALL (Reschedule): Us calling an existing patient to schedule or reschedule their appointment. When calling an existing patient, introduce yourself as calling from Dr. Abhishek's clinic for the patient, explain we need to reschedule their appointment to a time that works best for them, and propose open slots during working hours (Mon-Fri 9:00 AM - 5:00 PM). When they agree, use the reschedule action.

Current Patient Local Time: ${currentDateTime || new Date().toISOString()}

Doctor's Calendar (Current Schedule):
${calendarContext}

CRITICAL TIMEZONE ACCURACY RULE:
The patient's current local date, time, and timezone offset are specified in 'Current Patient Local Time'.
You MUST construct the start and end ISO 8601 datetime strings using the patient's actual local timezone offset (e.g. if the patient's local offset is '-07:00', then 10:30 AM must be formatted as 'YYYY-MM-DDT10:30:00-07:00' and NOT as UTC 'YYYY-MM-DDT10:30:00Z' or any other timezone offset).
DO NOT make arithmetic shifts to the hours! If the patient agrees to 10:30 AM, the hour portion in the ISO string MUST be exactly '10:30:00', with the patient's local timezone offset appended. Ensure that all booking, rescheduling, and cancellation times remain absolutely faithful to the patient's local time of day.

Your personality guidelines:
1. ACT LIKE A REAL HUMAN: Use realistic speech fillers like "Oh", "Hmm...", "Let me see...", "Sure!", "Ah, perfect," "Got it." This makes the conversation flow naturally rather than sounding like a cold machine.
2. KEEP IT EXTENSIVELY SHORT: Speak in very short, concise, and bite-sized sentences (1-2 sentences maximum per turn). Long blocks of speech are painful to listen to. Give the patient space to reply.
3. CONVERSE FREELY AND FLUIDLY: If the patient cuts you off, changes the topic, asks about the weather, asks how you are doing, or talks about something else, respond to them in a friendly, conversational manner. Then, gracefully and warmly pivot back to booking the appointment when appropriate.
4. NO MARKDOWN: Never use bullet points, asterisks, bold text, lists, or markdown in your 'speech' field, as it is spoken out loud.
5. RECOMMEND SPECIFIC TIMES: Look at the doctor's calendar, find free slots, and propose them one-by-one. (e.g., "Would Tuesday morning at 10:00 work for you?") rather than asking "When are you free?"
6. ACTIONS: If the patient agrees to a specific slot (or confirms rescheduling/cancelling), output the correct 'action' structure.
   - For booking a new appointment: set action.type to "schedule", and supply start, end (usually 30 minutes duration), and a title (e.g. "Appointment with Dr. Abhishek").
   - For rescheduling an existing patient's appointment: set action.type to "reschedule", supply the 'eventId' of their appointment, and the new start/end times.
   - For cancelling: set action.type to "cancel", and supply the 'eventId'.
   - If still negotiating or greeting: set action.type to "none".

Always output valid JSON according to the schema provided. Keep internal reasoning helpful and clean.`;

    // Map the incoming dialogue history to Gemini Content structure
    const contents = messages.map((m: any) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    // Enforce structured JSON output
    const responseSchema = {
      type: "OBJECT",
      properties: {
        speech: { 
          type: "STRING", 
          description: "What the voice assistant says aloud to the patient. Must be conversational and clear." 
        },
        reasoning: { 
          type: "STRING", 
          description: "Your brief internal reasoning, slot checking, or scheduling decisions." 
        },
        action: {
          type: "OBJECT",
          properties: {
            type: { 
              type: "STRING", 
              enum: ["none", "schedule", "reschedule", "cancel"] 
            },
            details: {
              type: "OBJECT",
              properties: {
                eventId: { type: "STRING", description: "The ID of the event to reschedule or cancel" },
                start: { type: "STRING", description: "ISO 8601 datetime string for the appointment start" },
                end: { type: "STRING", description: "ISO 8601 datetime string for the appointment end (30 min duration default)" },
                title: { type: "STRING", description: "Event title" },
                description: { type: "STRING", description: "Event description" }
              }
            }
          },
          required: ["type"]
        }
      },
      required: ["speech", "reasoning", "action"]
    };

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: responseSchema as any,
        temperature: 0.7,
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("No response text from Gemini");
    }

    const resultJson = JSON.parse(text);
    return res.json(resultJson);

  } catch (error: any) {
    console.error("Gemini Assistant Chat Error:", error);
    return res.status(500).json({
      speech: "I am having trouble connecting to my brain right now. Can we try again?",
      reasoning: error.message || "Unknown server error",
      action: { type: "none" }
    });
  }
});

// API route: Post-call reconciliation and auto-transcription review
app.post("/api/voice-assistant/post-call-reconcile", async (req, res) => {
  try {
    const { messages, doctorCalendarEvents, currentDateTime } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.json({
        hasChange: false,
        transcriptSummary: "No active dialogue occurred during this call.",
        action: { type: "none" }
      });
    }

    const transcriptText = messages
      .map(m => `${m.role === "user" ? "Patient" : "Assistant"}: "${m.content}"`)
      .join("\n");

    let calendarContext = "No upcoming events scheduled.";
    if (doctorCalendarEvents && Array.isArray(doctorCalendarEvents) && doctorCalendarEvents.length > 0) {
      calendarContext = doctorCalendarEvents
        .map((event: any, idx: number) => {
          const start = event.start?.dateTime || event.start?.date || "unknown";
          const end = event.end?.dateTime || event.end?.date || "unknown";
          return `Appointment ${idx + 1}: ID: ${event.id}, Title: ${event.summary || "Untitled"}, Start: ${start}, End: ${end}`;
        })
        .join("\n");
    }

    const systemInstruction = `You are a clinical coordinator backend audit engine. Your task is to analyze a completed clinical voice call transcript between Dr. Abhishek's AI Voice Assistant and a patient.
Analyze the transcript carefully and determine if the patient and assistant agreed on any appointment schedule change (booking, rescheduling, or cancelling).

Current Patient Local Time: ${currentDateTime || new Date().toISOString()}
Doctor's Calendar events list:
${calendarContext}

CRITICAL TIMEZONE ACCURACY RULE:
The patient's current local date, time, and timezone offset are specified in 'Current Patient Local Time'.
You MUST construct the start and end ISO 8601 datetime strings using the patient's actual local timezone offset (e.g. if the patient's local offset is '-07:00', then 10:30 AM must be formatted as 'YYYY-MM-DDT10:30:00-07:00' and NOT as UTC 'YYYY-MM-DDT10:30:00Z' or any other timezone offset).
DO NOT make arithmetic shifts to the hours! If the patient agrees to 10:30 AM, the hour portion in the ISO string MUST be exactly '10:30:00', with the patient's local timezone offset appended. Ensure that all booking, rescheduling, and cancellation times remain absolutely faithful to the patient's local time of day.

Determine if there was an agreed-upon change:
- If booking: extract start, end (30 mins default), and title ("Appointment with Dr. Abhishek").
- If rescheduling: find the eventId of the original appointment, and extract the new agreed-upon start and end times.
- If cancelling: find the eventId of the appointment to cancel.
- If no final scheduling agreement or action was made, set hasChange to false.`;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        hasChange: { type: Type.BOOLEAN, description: "True if a schedule change was mutually agreed during the call" },
        transcriptSummary: { type: Type.STRING, description: "A brief summary of what was decided in the call" },
        action: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING, description: "Must be 'schedule', 'reschedule', 'cancel', or 'none'" },
            details: {
              type: Type.OBJECT,
              properties: {
                eventId: { type: Type.STRING, description: "The Google Calendar Event ID if rescheduling or cancelling" },
                start: { type: Type.STRING, description: "ISO 8601 datetime string for start" },
                end: { type: Type.STRING, description: "ISO 8601 datetime for end" },
                title: { type: Type.STRING, description: "E.g. 'Appointment with Dr. Abhishek'" },
                description: { type: Type.STRING, description: "Optional notes" }
              }
            }
          },
          required: ["type"]
        }
      },
      required: ["hasChange", "transcriptSummary", "action"]
    };

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [{ role: "user", parts: [{ text: `Please review the following voice transcript:\n\n${transcriptText}` }] }],
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: responseSchema as any,
        temperature: 0.1,
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("Empty analysis from Gemini");
    }

    const result = JSON.parse(text);
    return res.json(result);

  } catch (error: any) {
    console.error("Post-call reconcile error:", error);
    return res.status(500).json({
      hasChange: false,
      transcriptSummary: "Error during post-call analysis: " + error.message,
      action: { type: "none" }
    });
  }
});

import http from "http";
import { WebSocketServer } from "ws";

// Create native http server wrapping Express app
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Handle WebSocket upgrade request for "/api/live-stream"
server.on("upgrade", (request, socket, head) => {
  const pathname = new URL(request.url || "", `http://${request.headers.host}`).pathname;
  if (pathname === "/api/live-stream") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  }
});

// Configure Gemini Live websocket connection
wss.on("connection", async (clientWs) => {
  console.log("Client connected to Gemini Live stream WebSocket.");
  
  let session: any = null;

  clientWs.on("message", async (data) => {
    try {
      const parsed = JSON.parse(data.toString());
      
      if (parsed.type === "setup") {
        const events = parsed.events || [];
        const currentDateTime = parsed.currentDateTime || new Date().toISOString();
        const callPurpose = parsed.callPurpose || "new";
        const patientName = parsed.patientName || "Abhishek";
        const patientEmail = parsed.patientEmail || "";
        const patientPhone = parsed.patientPhone || "";
        const appointmentTitle = parsed.appointmentTitle || "Consultation with Dr. Abhishek";
        const appointmentStart = parsed.appointmentStart || "";
        const targetEventId = parsed.targetEventId || "";
        const patientContext = parsed.patientContext || "";
        
        let calendarContext = "No upcoming events scheduled.";
        if (events && Array.isArray(events) && events.length > 0) {
          calendarContext = events
            .map((event: any, idx: number) => {
              const start = event.start?.dateTime || event.start?.date || "unknown";
              const end = event.end?.dateTime || event.end?.date || "unknown";
              return `Appointment ${idx + 1}:
  ID: ${event.id}
  Title: ${event.summary || "Untitled"}
  Start: ${start}
  End: ${end}
  Description: ${event.description || "None"}`;
            })
            .join("\n\n");
        }

        let purposeInstruction = "";
        if (callPurpose === "new") {
          purposeInstruction = `You are answering an INBOUND phone call from a new patient calling Dr. Abhishek's medical clinic asking when an appointment should be booked for them.
1. Answer the incoming call warmly: e.g. "Thank you for calling Dr. Abhishek's medical clinic! I am Zephyr, the clinic AI assistant. How can I help you today?"
2. When the caller asks to book an appointment, ask for their name and what kind of consultation they need if they haven't mentioned it.
3. Check Dr. Abhishek's working hours (Monday to Friday, 9:00 AM - 5:00 PM) and cross-reference the Doctor's Calendar below so you do NOT propose taken slots.
4. Recommend open slots one by one (e.g., "We have an opening on Tuesday morning at 10:00 AM, or Wednesday at 2:00 PM. Which of those works better for you?").
5. When the caller agrees on a specific date and time, call the 'scheduleAppointment' tool immediately!`;
        } else if (callPurpose === "reschedule") {
          purposeInstruction = `You are making an OUTBOUND call from Dr. Abhishek's clinic to an EXISTING PATIENT (${patientName}) to schedule or reschedule their upcoming appointment ("${appointmentTitle}").
1. Warmly introduce yourself: e.g. "Hello! This is Zephyr calling from Dr. Abhishek's clinic for ${patientName}. I'm calling regarding your upcoming appointment with Dr. Abhishek, as we need to reschedule it to a time that works best for you."
2. Ask if they have a moment to find a time that works best, and suggest available open times during our clinic working hours (Monday to Friday, 9:00 AM - 5:00 PM). Cross-reference the Doctor's Calendar below so you do NOT propose taken slots.
3. Recommend open slots one by one (e.g., "Would Tuesday at 2:00 PM or Wednesday at 10:00 AM work well for you?").
4. Once the patient agrees on a new date and time, call the 'rescheduleAppointment' tool immediately with eventId: "${targetEventId || "surgery-conflict"}", start, and end times!`;
        } else if (callPurpose === "followup") {
          purposeInstruction = `You are making an automated 2-day prior follow-up call to the patient, ${patientName} (Phone: ${patientPhone || "On file"}), regarding their upcoming appointment: "${appointmentTitle}" scheduled for ${appointmentStart}.
Patient Context/Notes: ${patientContext || "Routine clinical follow-up"}.

YOUR GOALS FOR THIS AUTOMATED FOLLOW-UP CALL:
1. Introduce yourself warmly as Dr. Abhishek's AI Voice Assistant and inform ${patientName} that you are calling 2 days in advance to confirm their appointment on ${appointmentStart}.
2. Ask ${patientName} if they will be able to make it to the appointment that day.
3. IF THEY CONFIRM THEY CAN COME: Thank them warmly, confirm that their appointment is locked in, and wish them a wonderful day.
4. IF THEY ARE BUSY OR ASK TO RESCHEDULE:
   - Ask them what new day and time they would prefer.
   - CLINIC WORKING HOURS: Monday to Friday, 9:00 AM to 5:00 PM.
   - Cross-reference the Doctor's Calendar below to verify the requested slot is within working hours and NOT already booked.
   - If the slot is free, call the 'rescheduleAppointment' tool with eventId: "${targetEventId}", new start time, and end time.
   - If the slot is taken or outside working hours (weekends/after 5 PM), politely explain and offer the closest available open slot during working hours (Mon-Fri 9:00 AM - 5:00 PM)!`;
        } else {
          purposeInstruction = `You are answering an INBOUND phone call from a new patient calling Dr. Abhishek's medical clinic asking when an appointment should be booked for them.
Warmly greet them ("Thank you for calling Dr. Abhishek's medical clinic! I am Zephyr, the clinic AI assistant. How can I help you today?"), check working hours (Mon-Fri 9 AM - 5 PM) and the Doctor's Calendar below, and help them schedule an appointment slot one-by-one. When they agree to a slot, call the 'scheduleAppointment' tool.`;
        }

        const systemInstruction = `You are a warm, highly human, natural, and professional AI voice assistant for Dr. Abhishek's medical clinic. You are having an active, real-time, bidirectional voice call (${callPurpose === "new" ? "INBOUND call answered from a new patient calling our clinic asking to book an appointment" : "OUTBOUND call to existing patient " + patientName}).

Current Patient Local Time: ${currentDateTime}

CALL PURPOSE:
${purposeInstruction}

Doctor's Calendar (Current Schedule):
${calendarContext}

CRITICAL TIMEZONE ACCURACY RULE:
The patient's current local date, time, and timezone offset are specified in 'Current Patient Local Time'.
You MUST construct the start and end ISO 8601 datetime strings using the patient's actual local timezone offset (e.g. if the patient's local offset is '-07:00', then 10:30 AM must be formatted as 'YYYY-MM-DDT10:30:00-07:00' and NOT as UTC 'YYYY-MM-DDT10:30:00Z' or any other timezone offset).
DO NOT make arithmetic shifts to the hours! If the patient agrees to 10:30 AM, the hour portion in the ISO string MUST be exactly '10:30:00', with the patient's local timezone offset appended. Ensure that all booking, rescheduling, and cancellation times remain absolutely faithful to the patient's local time of day.

Your personality guidelines:
1. ACT LIKE A REAL HUMAN: Use realistic speech fillers like "Oh", "Hmm...", "Let me see...", "Sure!", "Ah, perfect," "Got it." This makes the conversation flow naturally rather than sounding like a cold machine.
2. KEEP IT EXTENSIVELY SHORT: Speak in very short, concise, and bite-sized sentences (1-2 sentences maximum per turn). Long blocks of speech are painful to listen to. Give the patient space to reply.
3. CONVERSE FREELY AND FLUIDLY: If the patient cuts you off, changes the topic, asks about the weather, asks how you are doing, or talks about something else, respond to them in a friendly, conversational manner. Then, gracefully and warmly pivot back to booking the appointment when appropriate.
4. RECOMMEND SPECIFIC TIMES: Look at the doctor's calendar, find free slots, and propose them one-by-one (e.g., "Would Tuesday morning at 10:00 work for you?") rather than asking "When are you free?"
5. FUNCTION CALLING: If the patient agrees to a specific slot (or confirms rescheduling/cancelling), call the corresponding tool/function to perform the action! Do not just say you will do it, trigger the tool.
   - For booking a new appointment: call 'scheduleAppointment' tool.
   - For rescheduling: call 'rescheduleAppointment' tool.
   - For cancelling: call 'cancelAppointment' tool.

Greet the patient warmly, introduce yourself as Dr. Abhishek's AI Clinic Assistant, and start the conversation.`;

        // Connect to Gemini Live API
        session = await ai.live.connect({
          model: "gemini-3.1-flash-live-preview",
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
            },
            systemInstruction: systemInstruction,
            tools: [{
              functionDeclarations: [
                {
                  name: "scheduleAppointment",
                  description: "Call this function when the patient agrees to book a brand new appointment slot.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      start: { type: Type.STRING, description: "ISO 8601 datetime string for the appointment start" },
                      end: { type: Type.STRING, description: "ISO 8601 datetime string for the appointment end (default 30 min duration)" },
                      title: { type: Type.STRING, description: "Title, e.g. 'Appointment with Dr. Abhishek'" },
                      description: { type: Type.STRING, description: "Optional notes or reason for the visit" }
                    },
                    required: ["start", "end", "title"]
                  }
                },
                {
                  name: "rescheduleAppointment",
                  description: "Call this function when the patient confirms a new slot to reschedule an existing appointment conflict.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      eventId: { type: Type.STRING, description: "The ID of the conflict appointment/event to reschedule" },
                      start: { type: Type.STRING, description: "ISO 8601 datetime string for the new appointment start" },
                      end: { type: Type.STRING, description: "ISO 8601 datetime string for the new appointment end (default 30 min duration)" }
                    },
                    required: ["eventId", "start", "end"]
                  }
                },
                {
                  name: "cancelAppointment",
                  description: "Call this function when the patient requests to cancel their appointment.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      eventId: { type: Type.STRING, description: "The ID of the appointment/event to cancel" }
                    },
                    required: ["eventId"]
                  }
                }
              ]
            }]
          },
          callbacks: {
            onmessage: async (message) => {
              // 1. Send Audio chunks
              const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
              if (audio) {
                clientWs.send(JSON.stringify({ type: "audio", audio }));
              }
              
              // 2. Send interruption notification
              if (message.serverContent?.interrupted) {
                clientWs.send(JSON.stringify({ type: "interrupted" }));
              }
              
              // 3. Send text transcription
              const partsText = message.serverContent?.modelTurn?.parts
                ?.filter((p: any) => p.text)
                ?.map((p: any) => p.text)
                ?.join("");
              if (partsText) {
                clientWs.send(JSON.stringify({ type: "transcription", text: partsText }));
              }

              // 3b. Send patient/user text transcription if available
              const userPartsText = (message.serverContent as any)?.userTurn?.parts
                ?.filter((p: any) => p.text)
                ?.map((p: any) => p.text)
                ?.join("");
              if (userPartsText) {
                clientWs.send(JSON.stringify({ type: "patientTranscription", text: userPartsText }));
              }

              // 4. Handle Function Calling
              const toolCall = message.toolCall;
              if (toolCall && toolCall.functionCalls) {
                for (const call of toolCall.functionCalls) {
                  clientWs.send(JSON.stringify({
                    type: "action",
                    action: {
                      type: call.name === "scheduleAppointment" ? "schedule" : call.name === "rescheduleAppointment" ? "reschedule" : "cancel",
                      details: call.args,
                      callId: call.id
                    }
                  }));

                  // Resolve the function call back to Gemini Live
                  try {
                    await session.sendToolResponse({
                      functionResponses: [{
                        name: call.name,
                        id: call.id,
                        response: { success: true, message: `Action '${call.name}' triggered successfully. Wait for patient confirmation in the clinic dashboard.` }
                      }]
                    });
                  } catch (e) {
                    console.error("Error sending tool response to Gemini Live:", e);
                  }
                }
              }
            }
          }
        });

        clientWs.send(JSON.stringify({ type: "status", status: "ready" }));
      } else if (parsed.type === "audio") {
        if (session) {
          session.sendRealtimeInput({
            audio: { data: parsed.audio, mimeType: "audio/pcm;rate=16000" }
          });
        }
      }
    } catch (err: any) {
      console.error("WebSocket server message error:", err);
      clientWs.send(JSON.stringify({ type: "error", message: err.message }));
    }
  });

  clientWs.on("close", () => {
    console.log("Client connection closed, shutting down Gemini Live session.");
    if (session) {
      try {
        session.close();
      } catch (_) {}
    }
  });
});

// Serve frontend assets in development/production
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

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

setupServer();
