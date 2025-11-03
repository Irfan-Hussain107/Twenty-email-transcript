# Meeting Transcript - AI-Powered CRM Integration

## Overview
Automatically transform meeting transcripts into structured CRM data using AI. This Twenty CRM app processes unstructured meeting notes received via webhooks and creates organized notes, tasks, and assignments.

## Features

- **🤖 AI-Powered Analysis**: Extracts summaries, action items, assignees, and due dates from natural language transcripts
- **📋 Smart Task Consolidation**: Merges related sub-tasks into unified deliverables (e.g., "draft" + "review" + "present" → one consolidated task)
- **👥 Intelligent Assignment**: Uses GraphQL member lookup to match extracted assignee names to workspace member IDs with flexible string matching
- **🔗 Automatic Linking**: Links generated notes and tasks to relevant contacts using `noteTargets` and `taskTargets`
- **🗓️ Date Parsing**: Converts relative date expressions (e.g., "next Monday", "end of week") into ISO-formatted dates for accurate scheduling

## Requirements

- [Twenty CLI](https://www.npmjs.com/package/twenty-cli) - Install globally: `npm install -g twenty-cli`
- Twenty CRM instance with API access
- API key from [Settings > API & Webhooks](https://twenty.com/settings/api-webhooks)
- OpenAI API key or compatible service (Groq, etc.)

## Installation

1. **Authenticate with Twenty CLI:**
   ```bash
   twenty auth login
   ```

2. **Configure environment variables:**
   
   Copy `.env.example` to `.env` and fill in your credentials:
   ```bash
   cp .env.example .env
   ```

   Required environment variables:
   - `AI_PROVIDER_API_KEY`: Your OpenAI or Groq API key
   - `TWENTY_API_KEY`: Generated from your Twenty CRM instance
   - `TWENTY_API_URL`: Your Twenty CRM instance URL (e.g., https://your-instance.twenty.com)
   - `WEBHOOK_SECRET_TOKEN`: Secret token for webhook authentication
   - `AI_PROVIDER_API_BASE_URL`: Base URL for OpenAI-compatible API (defaults to https://api.openai.com/v1)

3. **Install dependencies:**
   ```bash
   yarn install
   ```

4. **Deploy to your Twenty workspace:**
   ```bash
   twenty app sync
   ```

## Configuration

### Using Groq Instead of OpenAI

To use Groq's API (which is compatible with OpenAI's SDK), set:
```bash
AI_PROVIDER_API_BASE_URL=https://api.groq.com/openai/v1
AI_PROVIDER_API_KEY=your-groq-api-key
```

### Using OpenAI

To use OpenAI's official API:
```bash
AI_PROVIDER_API_BASE_URL=https://api.openai.com/v1
AI_PROVIDER_API_KEY=your-openai-api-key
```

## Usage

Send a POST request to your webhook endpoint with the following payload:

```json
{
  "transcript": "During the Project Phoenix Kick-off on November 1st, 2025...",
  "meetingTitle": "Project Phoenix Kick-off",
  "meetingDate": "2025-11-01",
  "participants": [
    "Brian Chesky",
    "Dario Amodei",
    "Iqra Khan"
  ],
  "token": "your-webhook-secret-token",
  "relatedPersonId": "person-uuid-from-crm"
}
```

### Response

```json
{
  "success": true,
  "noteId": "note-uuid",
  "taskIds": ["task-uuid-1", "task-uuid-2"],
  "summary": {
    "noteCreated": true,
    "tasksCreated": 2,
    "actionItemsProcessed": 2,
    "commitmentsProcessed": 0
  },
  "executionLogs": [
    "✅ Validation passed",
    "🤖 Starting transcript analysis...",
    "✅ Analysis complete"
  ]
}
```

## Technical Stack

| Component | Description |
|-----------|-------------|
| **Runtime** | Webhook-triggered serverless function (TypeScript) |
| **AI Provider** | OpenAI-compatible API (OpenAI, Groq, etc.) |
| **APIs** | Twenty CRM REST API + GraphQL |
| **Model** | `openai/gpt-oss-20b` (configurable) |

## Development

### Build
```bash
yarn build
```

### Type Check
```bash
yarn type-check
```

## Environment Variables

| Variable | Required | Secret | Description |
|----------|----------|--------|-------------|
| `AI_PROVIDER_API_KEY` | Yes | Yes | API key for OpenAI-compatible service |
| `TWENTY_API_KEY` | Yes | Yes | Twenty CRM API authentication token |
| `TWENTY_API_URL` | Yes | No | Base URL for Twenty CRM instance |
| `WEBHOOK_SECRET_TOKEN` | Yes | Yes | Secret for webhook request validation |
| `AI_PROVIDER_API_BASE_URL` | No | No | Base URL for AI service (defaults to OpenAI) |

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.