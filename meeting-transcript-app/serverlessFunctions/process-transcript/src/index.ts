// index.ts

import OpenAI from "openai";
import { createTwentyRecord } from "./utils.js";

// --- TYPES (Local & LLM Output) ---

type WebhookPayload = {
  transcript: string;
  relatedPersonId?: string;
  token?: string;
};

type AIResult = {
  summary: string;
  keyPoints: string[];
  actionItems: { task: string; assignee: string }[];
};

// --- CONFIGURATION ---
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const WEBHOOK_SECRET_TOKEN = process.env.WEBHOOK_SECRET_TOKEN;

// Initialize OpenAI client (only if you want to switch back later)
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// --- MAIN FUNCTION ---

export const main = async (params: WebhookPayload): Promise<object> => {
  // 1. INPUT VALIDATION & SECURITY
  if (params.token !== WEBHOOK_SECRET_TOKEN || !WEBHOOK_SECRET_TOKEN) {
    return {
      statusCode: 401,
      body: JSON.stringify({
        message: "Unauthorized webhook access: Invalid token.",
      }),
    };
  }

  if (!params.transcript || !params.relatedPersonId) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "Missing transcript or relatedPersonId.",
      }),
    };
  }

  const { transcript, relatedPersonId } = params;

  try {
    // 2. AI ANALYSIS (MOCKED LOCALLY — NO COST)

    // Instead of real OpenAI call, we simulate a fake AI result.
    const aiResult: AIResult = {
      summary:
        "This is a mock summary generated locally. The meeting discussed next steps for the project and aligned action items.",
      keyPoints: [
        "Project milestones were reviewed.",
        "Team alignment achieved on deadlines.",
        "Next phase responsibilities assigned.",
      ],
      actionItems: [
        { task: "Prepare updated project timeline", assignee: "Alice" },
        { task: "Share meeting notes with all members", assignee: "Bob" },
      ],
    };

    console.log("✅ Using mock AI response:", aiResult);

    // --- If you want to use OpenAI later, uncomment this block ---
    /*
    const prompt = `
      Analyze the following meeting transcript.
      Extract the: 1. Summary (1-3 paragraphs). 2. Key Points (bulleted list). 3. Action Items (list of tasks with the responsible assignee).

      Return the response as a single, valid JSON object with the keys: 
      "summary" (string), "keyPoints" (array of strings), and "actionItems" (array of objects: {task: string, assignee: string}).
      
      TRANSCRIPT: ${transcript}
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const content = completion.choices?.[0]?.message?.content ?? '{}';
    const aiResult: AIResult = JSON.parse(content);
    */

    // 3. CREATE RICH NOTE IN TWENTY CRM
    const noteBody =
      `# 🎙️ AI Meeting Summary\n\n` +
      `**Summary:** ${aiResult.summary}\n\n` +
      `## Key Discussion Points\n` +
      aiResult.keyPoints.map((p) => `- ${p}`).join("\n");

    const notePayload = {
      title: `AI Summary: ${new Date().toLocaleDateString()}`,
      body: noteBody,
      relatedTo: { type: "Person" as const, id: relatedPersonId },
    };

    const noteRecord = await createTwentyRecord("notes", notePayload);

    // 4. CREATE ACTION ITEMS (TASKS)
    const taskPromises = (aiResult.actionItems || []).map((item) => {
      const taskPayload = {
        title: `[${item.assignee}] - ${item.task}`,
        status: "TODO" as const,
        relatedTo: { type: "Person" as const, id: relatedPersonId },
      };
      return createTwentyRecord("tasks", taskPayload);
    });

    const taskRecords = await Promise.all(taskPromises);

    // 5. SUCCESS RESPONSE
    return {
      statusCode: 200,
      body: JSON.stringify({
        message:
          "✅ Mock transcript processed successfully, CRM updated (no API cost).",
        noteId: (noteRecord as any).id,
        tasksCreated: taskRecords.length,
      }),
    };
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message;
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Processing failed due to internal error.",
        details: errorMessage,
      }),
    };
  }
};

