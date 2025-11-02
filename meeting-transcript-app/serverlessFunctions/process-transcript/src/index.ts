// index.ts

import axios from 'axios';
import OpenAI from 'openai';

// --- TYPES (Adhering to Twenty's Principles) ---

type TranscriptWebhookPayload = {
  transcript: string;
  relatedPersonId: string; // Added for person relation
  meetingTitle?: string;
  meetingDate?: string;
  participants?: string[];
  metadata?: Record<string, unknown>;
  token?: string; // Webhook authentication token
};

type ActionItem = {
  title: string;
  description: string;
  assignee?: string;
  dueDate?: string;
};

type Commitment = {
  person: string;
  commitment: string;
  dueDate?: string;
};

type AnalysisResult = {
  summary: string;
  keyPoints: string[];
  actionItems: ActionItem[];
  commitments: Commitment[];
};

type RichTextV2Data = {
  markdown: string;
  blocknote: null;
};

type TwentyApiResponse = {
  id: string;
};

// --- CONFIGURATION ---
const OPENAI_API_KEY = process.env.OPENAI_API_KEY; 
const WEBHOOK_SECRET_TOKEN = process.env.WEBHOOK_SECRET_TOKEN;
const TWENTY_API_URL = process.env.TWENTY_API_URL;
const GROQ_API_BASE_URL = process.env.GROQ_API_BASE_URL;

const LLM_MODEL_ID = 'openai/gpt-oss-20b'; 
const OPENAI_MODEL_LOG_NAME = 'openai/gpt-oss-20b';
const OPENAI_TEMPERATURE = 0.3; 

const openai = new OpenAI({ 
  apiKey: OPENAI_API_KEY, 
  baseURL: GROQ_API_BASE_URL, 
});

// --- UTILITY FUNCTIONS (CRM Logic) ---

const getTwentyApiConfig = () => {
  const apiKey = process.env.TWENTY_API_KEY;
  if (!apiKey) {
    throw new Error('TWENTY_API_KEY environment variable is not set');
  }

  const baseUrl = TWENTY_API_URL; 
  if (!baseUrl) {
    throw new Error('TWENTY_API_URL environment variable is not set');
  }

  return { apiKey, baseUrl };
};

const formatNoteBody = (summary: string, keyPoints: string[]): string => {
  const keyPointsList = keyPoints.map((point) => `- ${point}`).join('\n');
  return `## Summary\n\n${summary}\n\n## Key Points\n\n${keyPointsList}\n\n*Generated from meeting transcript*`;
};

// FIX: Link note to person using REST API after creation
const linkNoteToPersonREST = async (
  noteId: string,
  personId: string,
): Promise<void> => {
  const { apiKey, baseUrl } = getTwentyApiConfig();
  
  try {
    const response = await axios.post(
      `${baseUrl}/rest/noteTargets`,
      {
        noteId: noteId,
        personId: personId,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      },
    );
    
    const noteTargetId = response.data?.data?.createNoteTarget?.id;
    
    if (noteTargetId) {
      console.log(`✅ Successfully linked note ${noteId} to person ${personId} (noteTarget: ${noteTargetId})`);
    } else {
      console.warn(`⚠️ Note linking response received but no ID found`);
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const errorMessage = error.response?.data
        ? JSON.stringify(error.response.data, null, 2)
        : error.message;
      const status = error.response?.status;
      console.error(`❌ Failed to link note to person. Status: ${status}, Error: ${errorMessage}`);
      console.error(`Attempted to link noteId: ${noteId} to personId: ${personId}`);
      throw new Error(`Failed to link note to person: ${errorMessage}`);
    }
    throw error;
  }
};

const createNoteInTwenty = async (
  summary: string,
  keyPoints: string[],
  relatedPersonId: string,
  meetingTitle?: string,
  meetingDate?: string,
): Promise<TwentyApiResponse> => {
  const { apiKey, baseUrl } = getTwentyApiConfig();
  const noteTitle =
    meetingTitle ||
    `Meeting Notes - ${meetingDate || new Date().toLocaleDateString()}`;
  const noteBodyMarkdown = formatNoteBody(summary, keyPoints);

  const requestData = {
    title: noteTitle,
    bodyV2: {
      markdown: noteBodyMarkdown,
      blocknote: null,
    } satisfies RichTextV2Data,
  };

  try {
    const response = await axios.post(
      `${baseUrl}/rest/notes`,
      requestData,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      },
    );
    
    const responseJson = JSON.stringify(response.data);
    console.log('📦 Note API Response:', responseJson);
    
    // Twenty CRM REST API returns: { data: { createNote: { id: "...", ... } } }
    const noteId = response.data?.data?.createNote?.id;
    
    if (!noteId) {
      const errorMsg = `Note created but ID not found in response. Response structure: ${responseJson}`;
      console.error('❌', errorMsg);
      throw new Error(errorMsg);
    }
    
    console.log(`✅ Note ID extracted: ${noteId}`);
    
    // FIX: Link note to person using REST API
    await linkNoteToPersonREST(noteId, relatedPersonId);
    
    return { id: noteId };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const errorMessage = error.response?.data
        ? JSON.stringify(error.response.data, null, 2)
        : error.message;
      const status = error.response?.status;
      throw new Error(
        `Failed to create note: ${errorMessage}. Status: ${status}`,
      );
    }
    throw error;
  }
};

// FIX: Link task to person using REST API
const linkTaskToPersonREST = async (
  taskId: string,
  personId: string,
): Promise<void> => {
  const { apiKey, baseUrl } = getTwentyApiConfig();
  
  try {
    const response = await axios.post(
      `${baseUrl}/rest/taskTargets`,
      {
        taskId: taskId,
        personId: personId,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      },
    );
    console.log(`✅ Successfully linked task ${taskId} to person ${personId}`, response.data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const errorMessage = error.response?.data
        ? JSON.stringify(error.response.data, null, 2)
        : error.message;
      const status = error.response?.status;
      console.error(`❌ Failed to link task to person. Status: ${status}, Error: ${errorMessage}`);
      console.error(`Attempted to link taskId: ${taskId} to personId: ${personId}`);
      // Don't throw - this is non-critical
    }
  }
};

const createTaskInTwenty = async (
  actionItem: ActionItem,
  relatedPersonId?: string,
): Promise<TwentyApiResponse> => {
  const { apiKey, baseUrl } = getTwentyApiConfig();

  const taskData: {
    title: string;
    bodyV2: RichTextV2Data;
    dueAt?: string;
  } = {
    title: actionItem.title,
    bodyV2: {
      markdown: actionItem.description,
      blocknote: null,
    },
  };

  if (actionItem.dueDate) {
    const date = new Date(actionItem.dueDate);
    if (!isNaN(date.getTime())) {
      taskData.dueAt = date.toISOString();
    }
  }

  try {
    const response = await axios.post(
      `${baseUrl}/rest/tasks`,
      taskData,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      },
    );
    
    console.log('📦 Task API Response:', JSON.stringify(response.data));
    
    // Twenty CRM REST API returns: { data: { createTask: { id: "...", ... } } }
    const taskId = response.data?.data?.createTask?.id;
    
    if (!taskId) {
      console.error('❌ Failed to extract task ID from response:', response.data);
      throw new Error('Task created but ID not found in response');
    }
    
    console.log(`✅ Task created successfully: ${taskId} - "${actionItem.title}"`);
    
    // FIX: Link task to person if provided
    if (relatedPersonId) {
      await linkTaskToPersonREST(taskId, relatedPersonId);
    }
    
    return { id: taskId };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const errorMessage = error.response?.data
        ? JSON.stringify(error.response.data, null, 2)
        : error.message;
      const status = error.response?.status;
      console.error(`❌ Failed to create task "${actionItem.title}". Status: ${status}, Error: ${errorMessage}`);
      throw new Error(
        `Failed to create task "${actionItem.title}": ${errorMessage}. Status: ${status}`,
      );
    }
    throw error;
  }
};

const createTasksFromActionItems = async (
  actionItems: ActionItem[],
  noteId: string,
  relatedPersonId: string,
): Promise<string[]> => {
  const taskIds: string[] = [];

  for (const actionItem of actionItems) {
    try {
      const taskDescription = `${actionItem.description}\n\n*Related to meeting note: ${noteId}*`;
      console.log(`Creating task: "${actionItem.title}"`);
      const task = await createTaskInTwenty({
        ...actionItem,
        description: taskDescription,
      }, relatedPersonId);
      taskIds.push(task.id);
      console.log(`✅ Task added to results: ${task.id}`);
    } catch (error) {
      console.error(`❌ Task creation failed for "${actionItem.title}":`, error instanceof Error ? error.message : error);
      // Don't push null - skip failed tasks
    }
  }

  return taskIds;
};

const createTasksFromCommitments = async (
  commitments: Commitment[],
  noteId: string,
  relatedPersonId: string,
): Promise<string[]> => {
  const taskIds: string[] = [];

  for (const commitment of commitments) {
    try {
      const taskDescription = `Commitment from ${commitment.person}: ${commitment.commitment}\n\n*Related to meeting note: ${noteId}*`;
      const task = await createTaskInTwenty({
        title: `Follow up: ${commitment.commitment}`,
        description: taskDescription,
        dueDate: commitment.dueDate || '',
      }, relatedPersonId);
      taskIds.push(task.id);
    } catch (error) {
      console.error(`Commitment task creation failed for "${commitment.commitment}":`, error);
      // Don't push null - skip failed tasks
    }
  }

  return taskIds;
};

// --- CORE AI ANALYSIS FUNCTION ---

const analyzeTranscript = async (
  transcript: string,
  openaiApiKey: string,
): Promise<AnalysisResult> => {
  
  const groqBaseUrl = process.env.GROQ_API_BASE_URL;
  if (!groqBaseUrl) {
    throw new Error('GROQ_API_BASE_URL environment variable is not set');
  }

  const openai = new OpenAI({ 
    apiKey: openaiApiKey,
    baseURL: groqBaseUrl, 
  });

  const prompt = `Analyze the following meeting transcript and extract:
1. A concise summary (2-3 sentences)
2. Key discussion points (bullet list)
3. Action items with titles, descriptions, and any mentioned assignees or due dates
4. Commitments made by participants with names and any mentioned due dates

Return the response as a JSON object with this structure:
{
  "summary": "string",
  "keyPoints": ["string"],
  "actionItems": [{"title": "string", "description": "string", "assignee": "string (optional)", "dueDate": "string (optional)"}],
  "commitments": [{"person": "string", "commitment": "string", "dueDate": "string (optional)"}]
}

Transcript:
${transcript}`;

  const completion = await openai.chat.completions.create({
    model: LLM_MODEL_ID, 
    messages: [
      {
        role: 'system',
        content:
          'You are a meeting analysis assistant. Extract key insights, action items, and commitments from meeting transcripts. Always return valid JSON.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: OPENAI_TEMPERATURE,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from AI API');
  }

  return JSON.parse(content) as AnalysisResult;
};

// --- MAIN SERVERLESS FUNCTION ENTRY POINT ---

export const main = async (
  params: TranscriptWebhookPayload,
): Promise<object> => {
  const executionLogs: string[] = [];
  const log = (message: string) => {
    console.log(message);
    executionLogs.push(message);
  };

  try {
    // FIX: Check for existence before comparing (fixes empty string bug)
    const webhookToken = params.token; 
    const expectedSecret = process.env.WEBHOOK_SECRET_TOKEN;
    
    if (!expectedSecret || !webhookToken || webhookToken !== expectedSecret) {
      throw new Error('Unauthorized webhook access: Invalid or missing token.');
    }
    
    const { transcript, meetingTitle, meetingDate, relatedPersonId } = params;

    // FIX: Add validation for transcript
    if (!transcript || typeof transcript !== 'string') {
      throw new Error('Transcript is required and must be a string');
    }

    // FIX: Add validation for relatedPersonId
    if (!relatedPersonId || typeof relatedPersonId !== 'string') {
      throw new Error('relatedPersonId is required and must be a string');
    }

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }

    log('✅ Validation passed');
    log(`📝 RelatedPersonId: ${relatedPersonId}`);
    log('🤖 Starting transcript analysis...');
    
    const analysis = await analyzeTranscript(transcript, openaiApiKey);
    log(`✅ Analysis complete: ${analysis.actionItems.length} action items, ${analysis.commitments.length} commitments`);

    log('📄 Creating note in Twenty CRM...');
    const note = await createNoteInTwenty(
      analysis.summary,
      analysis.keyPoints,
      relatedPersonId,
      meetingTitle,
      meetingDate,
    );
    log(`✅ Note created: ${note.id}`);

    log('📋 Creating tasks from action items...');
    const actionItemTaskIds = await createTasksFromActionItems(
      analysis.actionItems,
      note.id,
      relatedPersonId,
    );
    log(`✅ Action item tasks created: ${actionItemTaskIds.length}`);
    
    log('📋 Creating tasks from commitments...');
    const commitmentTaskIds = await createTasksFromCommitments(
      analysis.commitments,
      note.id,
      relatedPersonId,
    );
    log(`✅ Commitment tasks created: ${commitmentTaskIds.length}`);

    const allTaskIds = [...actionItemTaskIds, ...commitmentTaskIds];

    return {
      success: true,
      noteId: note.id,
      taskIds: allTaskIds,
      summary: {
        noteCreated: true,
        tasksCreated: allTaskIds.length,
        actionItemsProcessed: analysis.actionItems.length,
        commitmentsProcessed: analysis.commitments.length,
      },
      executionLogs: executionLogs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log(`❌ ERROR: ${errorMessage}`);
    return {
      success: false,
      error: errorMessage,
      executionLogs: executionLogs,
    };
  }
};