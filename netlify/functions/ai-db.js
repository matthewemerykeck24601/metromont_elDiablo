// AI-Powered DB Assistant Function
// Uses OpenAI to interpret natural language commands and execute DB operations
import OpenAI from "openai";
import { response, parseUser, requireAdmin, createOssClient, ensureBucket, getBucket } from "./_db-helpers.js";

// REQUIRED env var in Netlify: OPENAI_API_KEY
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const SYSTEM_PROMPT = `
You are the Metromont El Diablo DB Assistant.
The user will describe actions to perform on the pseudo DB. You MUST return a strict JSON instruction object.

Allowed actions:
- "create_table": { "table": string, "folderId": string|null, "schema": object }
- "insert_rows": { "table": string, "rows": [object, ...] }

Return format (strict JSON, no commentary):
{
  "action": "<create_table|insert_rows>",
  "args": { ... }
}

Examples:
User: "Create a table called Assets with columns id, description, and status_id"
Response: {
  "action": "create_table",
  "args": {
    "table": "Assets",
    "folderId": null,
    "schema": {
      "type": "object",
      "properties": {
        "id": { "type": "string" },
        "description": { "type": "string" },
        "status_id": { "type": "integer" }
      },
      "required": ["id"]
    }
  }
}

User: "Add 3 rows to schedules table with activityId, name, and date"
Response: {
  "action": "insert_rows",
  "args": {
    "table": "schedules",
    "rows": [
      { "activityId": "act-001", "name": "Foundation", "date": "2025-01-15" },
      { "activityId": "act-002", "name": "Columns", "date": "2025-01-20" },
      { "activityId": "act-003", "name": "Beams", "date": "2025-01-25" }
    ]
  }
}
`;

export async function handler(event) {
  try {
    // Handle preflight
    if (event.httpMethod === "OPTIONS") {
      return response(200, {});
    }

    // Only POST allowed
    if (event.httpMethod !== "POST") {
      return response(405, { error: "Method not allowed" });
    }

    // Check OpenAI key
    if (!OPENAI_API_KEY) {
      console.error('❌ Missing OPENAI_API_KEY environment variable');
      return response(500, { error: "AI service not configured - missing OPENAI_API_KEY" });
    }

    // Parse user and check admin
    const user = parseUser(event);
    const adminCheck = requireAdmin(user);
    if (adminCheck) return adminCheck;

    // Parse request body
    const { messages } = JSON.parse(event.body || "{}");
    if (!Array.isArray(messages) || messages.length === 0) {
      return response(400, { error: "Missing messages array" });
    }

    console.log('🤖 AI request from', user.email, '- messages:', messages.length);

    // Call OpenAI
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    const chat = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages
      ],
      temperature: 0
    });

    const content = chat.choices?.[0]?.message?.content || "";
    console.log('🤖 AI response:', content);

    // Parse AI response
    let plan;
    try {
      plan = JSON.parse(content);
    } catch (e) {
      console.error('❌ AI did not return valid JSON:', content);
      return response(400, { error: "AI did not return valid JSON", raw: content });
    }

    // Validate plan structure
    const action = plan?.action;
    const args = plan?.args || {};
    if (!action) {
      return response(400, { error: "Missing action in AI result", plan });
    }

    console.log('📋 Executing action:', action, 'with args:', args);

    // Prepare OSS client
    const oss = createOssClient(event);
    const bucketKey = getBucket();
    
    // Ensure bucket exists
    await ensureBucket(oss, bucketKey);

    const tenantPrefix = `tenants/${user.hubId || "default-hub"}`;

    // Execute action: CREATE_TABLE
    if (action === "create_table") {
      const { table, folderId = null, schema } = args;
      
      if (!table || typeof schema !== "object") {
        return response(400, { error: "Invalid create_table args", args });
      }

      const tableId = table.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const base = `${tenantPrefix}/tables/${tableId}`;
      
      await oss.putJson(bucketKey, `${base}/schema.json`, {
        id: tableId,
        name: table,
        folderId,
        schema,
        createdBy: user.email,
        createdAt: new Date().toISOString(),
        createdVia: 'ai-assistant'
      });

      console.log('✅ Table created:', tableId);
      return response(200, { ok: true, action, tableId, table });
    }

    // Execute action: INSERT_ROWS
    if (action === "insert_rows") {
      const { table, rows } = args;
      
      if (!table || !Array.isArray(rows) || rows.length === 0) {
        return response(400, { error: "Invalid insert_rows args", args });
      }

      if (rows.length > 200) {
        return response(400, { error: "Row limit exceeded (200 max per request)" });
      }

      const tableId = table.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const base = `${tenantPrefix}/tables/${tableId}`;

      // Write each row
      let written = 0;
      for (const row of rows) {
        const id = cryptoRandom();
        await oss.putJson(bucketKey, `${base}/rows/${id}.json`, {
          id,
          ...row,
          _meta: { 
            createdBy: user.email, 
            createdAt: new Date().toISOString(),
            createdVia: 'ai-assistant'
          }
        });
        written++;
      }

      console.log('✅ Inserted', written, 'rows into', tableId);
      return response(200, { ok: true, action, tableId, written });
    }

    return response(400, { error: "Unsupported action", action, supportedActions: ["create_table", "insert_rows"] });

  } catch (err) {
    console.error('❌ AI DB function error:', err);
    return response(500, { error: "AI DB function failed", details: String(err.message || err) });
  }
}

// Simple random ID helper for rows
function cryptoRandom() {
  // Generate 16 hex bytes (32 hex chars)
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

