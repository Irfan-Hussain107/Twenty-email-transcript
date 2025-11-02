import axios from 'axios';
import OpenAI from 'openai';


type TranscriptWebhookPayload = {
  transcript: string;
  relatedPersonId: string;
  meetingTitle?: string;
  meetingDate?: string;
  participants?: string[];
  metadata?: Record<string, unknown>;
  token?: string;
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

const OPENAI_API_KEY = process.env.OPENAI_API_KEY; 
const WEBHOOK_SECRET_TOKEN = process.env.WEBHOOK_SECRET_TOKEN;
const TWENTY_API_URL = process.env.TWENTY_API_URL;
const GROQ_API_BASE_URL = process.env.GROQ_API_BASE_URL;

const LLM_MODEL_ID = 'openai/gpt-oss-20b'; 
const OPENAI_TEMPERATURE = 0.3; 

const openai = new OpenAI({ 
  apiKey: OPENAI_API_KEY, 
  baseURL: GROQ_API_BASE_URL, 
});


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

const lookupWorkspaceMemberByName = async (
  name: string,
): Promise<string | null> => {
  const { apiKey, baseUrl } = getTwentyApiConfig();
  
  try {
    const graphqlQuery = {
      query: `
        query GetAllWorkspaceMembers {
          workspaceMembers {
            edges {
              node {
                id
                name {
                  firstName
                  lastName
                }
              }
            }
          }
        }
      `,
    };
    
    const response = await axios.post(
      `${baseUrl}/graphql`,
      graphqlQuery,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      },
    );
    
    const edges = response.data?.data?.workspaceMembers?.edges;
    
    if (!edges || edges.length === 0) {
      console.log('⚠️ No workspace members found');
      return null;
    }

    const searchName = name.trim().toLowerCase();
    
    for (const edge of edges) {
      const firstName = edge.node.name?.firstName || '';
      const lastName = edge.node.name?.lastName || '';
      const fullName = `${firstName} ${lastName}`.trim().toLowerCase();
      
      if (fullName === searchName) {
        console.log(`✅ Found workspace member (exact): ${firstName} ${lastName} (ID: ${edge.node.id})`);
        return edge.node.id;
      }
    }
    
    for (const edge of edges) {
      const firstName = edge.node.name?.firstName || '';
      if (firstName.toLowerCase() === searchName) {
        const lastName = edge.node.name?.lastName || '';
        console.log(`✅ Found workspace member (first name): ${firstName} ${lastName} (ID: ${edge.node.id})`);
        return edge.node.id;
      }
    }
    
    for (const edge of edges) {
      const lastName = edge.node.name?.lastName || '';
      if (lastName.toLowerCase() === searchName) {
        const firstName = edge.node.name?.firstName || '';
        console.log(`✅ Found workspace member (last name): ${firstName} ${lastName} (ID: ${edge.node.id})`);
        return edge.node.id;
      }
    }
    
    for (const edge of edges) {
      const firstName = edge.node.name?.firstName || '';
      const lastName = edge.node.name?.lastName || '';
      const fullName = `${firstName} ${lastName}`.trim().toLowerCase();
      
      if (fullName.includes(searchName) || searchName.includes(fullName)) {
        console.log(`✅ Found workspace member (partial): ${firstName} ${lastName} (ID: ${edge.node.id})`);
        return edge.node.id;
      }
    }
    
    console.log(`⚠️ No workspace member found matching: "${name}"`);
    return null;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const errorMessage = error.response?.data
        ? JSON.stringify(error.response.data, null, 2)
        : error.message;
      console.error(`❌ Failed to lookup workspace member "${name}": ${errorMessage}`);
    }
    return null;
  }
};

const formatNoteBody = (summary: string, keyPoints: string[]): string => {
  const keyPointsList = keyPoints.map((point) => `- ${point}`).join('\n');
  return `## Summary\n\n${summary}\n\n## Key Points\n\n${keyPointsList}\n\n*Generated from meeting transcript*`;
};

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
    
    const noteId = response.data?.data?.createNote?.id;
    
    if (!noteId) {
      const errorMsg = `Note created but ID not found in response. Response structure: ${responseJson}`;
      console.error('❌', errorMsg);
      throw new Error(errorMsg);
    }
    
    console.log(`✅ Note ID extracted: ${noteId}`);
    
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
    assigneeId?: string;
  } = {
    title: actionItem.title,
    bodyV2: {
      markdown: actionItem.description,
      blocknote: null,
    },
  };

  if (actionItem.assignee) {
    console.log(`🔍 Looking up assignee: "${actionItem.assignee}"`);
    const assigneeId = await lookupWorkspaceMemberByName(actionItem.assignee);
    if (assigneeId) {
      taskData.assigneeId = assigneeId;
      console.log(`✅ Task will be assigned to: ${actionItem.assignee} (${assigneeId})`);
    } else {
      console.log(`⚠️ Could not find workspace member "${actionItem.assignee}", task will be unassigned`);
    }
  }

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
    
    const taskId = response.data?.data?.createTask?.id;
    
    if (!taskId) {
      console.error('❌ Failed to extract task ID from response:', response.data);
      throw new Error('Task created but ID not found in response');
    }
    
    console.log(`✅ Task created successfully: ${taskId} - "${actionItem.title}"`);
    
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

const areSimilarTasks = (task1: string, task2: string): boolean => {
  const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalized1 = normalize(task1);
  const normalized2 = normalize(task2);
  
  if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
    return true;
  }
  
  const words1 = normalized1.split(/\s+/).filter(w => w.length > 3);
  const words2 = normalized2.split(/\s+/).filter(w => w.length > 3);
  const commonWords = words1.filter(w => words2.includes(w));
  
  if (words1.length === 0 || words2.length === 0) return false;
  
  const overlapRatio = (commonWords.length * 2) / (words1.length + words2.length);
  return overlapRatio > 0.7;
};

const createAllTasks = async (
  actionItems: ActionItem[],
  commitments: Commitment[],
  noteId: string,
  relatedPersonId: string,
): Promise<{ taskIds: string[], duplicatesSkipped: number }> => {
  const taskIds: string[] = [];
  const createdTasks: Set<string> = new Set();
  let duplicatesSkipped = 0;

  const commitmentTasks: ActionItem[] = commitments.map(commitment => ({
    title: `Follow up: ${commitment.commitment}`,
    description: `Commitment from ${commitment.person}: ${commitment.commitment}\n\n*Related to meeting note: ${noteId}*`,
    assignee: commitment.person,
    dueDate: commitment.dueDate || '',
  }));

  const allTasks = [
    ...actionItems.map(item => ({
      ...item,
      description: `${item.description}\n\n*Related to meeting note: ${noteId}*`
    })),
    ...commitmentTasks
  ];

  for (const task of allTasks) {
    // Check if similar task already created
    let isDuplicate = false;
    for (const existingTitle of createdTasks) {
      if (areSimilarTasks(task.title, existingTitle)) {
        console.log(`⏭️ Skipping duplicate task: "${task.title}" (similar to "${existingTitle}")`);
        duplicatesSkipped++;
        isDuplicate = true;
        break;
      }
    }
    
    if (isDuplicate) continue;

    try {
      console.log(`Creating task: "${task.title}"`);
      const createdTask = await createTaskInTwenty(task, relatedPersonId);
      taskIds.push(createdTask.id);
      createdTasks.add(task.title);
      console.log(`✅ Task added to results: ${createdTask.id}`);
    } catch (error) {
      console.error(`❌ Task creation failed for "${task.title}":`, error instanceof Error ? error.message : error);
    }
  }

  return { taskIds, duplicatesSkipped };
};


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

IMPORTANT for assignees: 
- Only extract an assignee name if the transcript EXPLICITLY states WHO will do the task
- Look for phrases like "John will", "assigned to Sarah", "Mike is responsible for"
- If the transcript mentions a person's name but doesn't explicitly assign them the task, leave assignee empty
- External contacts mentioned in the transcript should NOT be assignees unless explicitly stated
- Avoid creating duplicate tasks - if an action item and commitment refer to the same task, only include it once as an action item

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


export const main = async (
  params: TranscriptWebhookPayload,
): Promise<object> => {
  const executionLogs: string[] = [];
  const log = (message: string) => {
    console.log(message);
    executionLogs.push(message);
  };

  try {
    const webhookToken = params.token; 
    const expectedSecret = process.env.WEBHOOK_SECRET_TOKEN;
    
    if (!expectedSecret || !webhookToken || webhookToken !== expectedSecret) {
      throw new Error('Unauthorized webhook access: Invalid or missing token.');
    }
    
    const { transcript, meetingTitle, meetingDate, relatedPersonId } = params;

    if (!transcript || typeof transcript !== 'string') {
      throw new Error('Transcript is required and must be a string');
    }

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

    log('📋 Creating all tasks (with deduplication)...');
    const { taskIds: allTaskIds, duplicatesSkipped } = await createAllTasks(
      analysis.actionItems,
      analysis.commitments,
      note.id,
      relatedPersonId,
    );
    log(`✅ Tasks created: ${allTaskIds.length} (${duplicatesSkipped} duplicates skipped)`);

    return {
      success: true,
      noteId: note.id,
      taskIds: allTaskIds,
      summary: {
        noteCreated: true,
        tasksCreated: allTaskIds.length,
        duplicatesSkipped: duplicatesSkipped,
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
}