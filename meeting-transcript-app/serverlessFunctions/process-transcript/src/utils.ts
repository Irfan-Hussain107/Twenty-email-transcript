// utils.ts

import axios from 'axios';

// --- TYPES (Adhering to "Types over interfaces") ---

type TwentyRecordType = 'notes' | 'tasks';

type RelatedTo = {
  type: 'Person' | 'Company'; // Simplified types for this scope
  id: string;
};

type NotePayload = {
  title: string;
  body: string; // Markdown content
  relatedTo: RelatedTo;
};

type TaskPayload = {
  title: string;
  status: 'TODO' | 'DONE';
  relatedTo: RelatedTo;
  // Note: Twenty CRM typically auto-assigns the API key user if assigneeId is null
  // assigneeId?: string; 
};

// --- CORE API FUNCTIONALITY ---

/**
 * Executes a POST request to the local Twenty CRM API.
 * @param endpoint The resource endpoint (e.g., 'notes', 'tasks')
 * @param data The JSON payload for the new record
 * @returns The response data from the CRM
 */
export const createTwentyRecord = async (
  endpoint: TwentyRecordType,
  data: NotePayload | TaskPayload,
): Promise<object> => {
  const TWENTY_BASE_URL = process.env.TWENTY_BASE_URL || 'http://localhost:3000';
  const TWENTY_API_KEY = process.env.TWENTY_API_KEY;

  if (!TWENTY_API_KEY) {
    throw new Error('TWENTY_API_KEY is not defined in the environment.');
  }

  const url = `${TWENTY_BASE_URL}/rest/${endpoint}`;

  try {
    const response = await axios.post(url, data, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TWENTY_API_KEY}`,
      },
    });
    return response.data;
  } catch (error: any) {
    console.error(`Error creating Twenty record on ${endpoint}:`, error.response?.data || error.message);
    throw new Error(`Failed to create Twenty record. Details: ${error.response?.data?.message || error.message}`);
  }
};