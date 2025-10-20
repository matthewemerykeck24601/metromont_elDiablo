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

      const tableId = normalizeId(table);
      
      // Check if table exists, auto-create if it's a known ACC entity
      const entityGuess = ["assets", "issues", "forms"].includes(table.toLowerCase())
        ? table.toLowerCase()
        : null;

      const exists = await tableExists(oss, bucketKey, tenantPrefix, tableId);
      if (!exists) {
        if (entityGuess) {
          // Auto-create canonical table for known ACC entities
          console.log(`🔧 Auto-creating table "${table}" from ACC entity "${entityGuess}"`);
          await ensureCanonicalTable(
            oss, bucketKey, tenantPrefix, entityGuess, table /* keep displayed name */
          );
        } else {
          return response(400, { 
            error: `Table "${table}" does not exist. Create it first or specify an ACC entity (assets/issues/forms).`,
            tableId 
          });
        }
      }

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

// Normalize ID helper
function normalizeId(s) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// Check if table exists
async function tableExists(oss, bucketKey, tenantPrefix, tableId) {
  try {
    // Will throw if not found
    await oss.getObject(bucketKey, `${tenantPrefix}/tables/${tableId}/schema.json`);
    return true;
  } catch {
    return false;
  }
}

// Fetch ACC entity schema (stub - would fetch from Autodesk API in production)
async function fetchAccEntitySchema(entityName) {
  // Simplified canonical schemas for known ACC entities
  const schemas = {
    assets: {
      version: "1.0",
      properties: {
        id: { type: "string", description: "Asset ID" },
        name: { type: "string", description: "Asset name" },
        description: { type: "string", description: "Asset description" },
        status_id: { type: "integer", description: "Status identifier" },
        category_id: { type: "integer", description: "Category identifier" },
        location: { type: "string", description: "Asset location" },
        barcode: { type: "string", description: "Asset barcode" }
      },
      required: ["id", "name"]
    },
    issues: {
      version: "1.0",
      properties: {
        id: { type: "string", description: "Issue ID" },
        title: { type: "string", description: "Issue title" },
        description: { type: "string", description: "Issue description" },
        status: { type: "string", description: "Issue status" },
        priority: { type: "string", description: "Issue priority" },
        assigned_to: { type: "string", description: "Assigned user" },
        due_date: { type: "string", description: "Due date" }
      },
      required: ["id", "title"]
    },
    forms: {
      version: "1.0",
      properties: {
        id: { type: "string", description: "Form ID" },
        title: { type: "string", description: "Form title" },
        template_id: { type: "string", description: "Form template ID" },
        status: { type: "string", description: "Form status" },
        created_by: { type: "string", description: "Creator" },
        created_at: { type: "string", description: "Creation date" }
      },
      required: ["id", "title"]
    }
  };
  
  return schemas[entityName] || null;
}

// Map ACC schema to DB schema
function mapAccSchemaToDb(tableName, accSchema) {
  return {
    tableName,
    schema: {
      type: "object",
      properties: accSchema.properties,
      required: accSchema.required || []
    }
  };
}

// Ensure canonical table exists (auto-create from ACC entity schema)
async function ensureCanonicalTable(oss, bucketKey, tenantPrefix, entityName, tableNameOverride) {
  const accSchema = await fetchAccEntitySchema(entityName);
  if (!accSchema) throw new Error(`ACC entity '${entityName}' not found in schema docs`);
  
  const { tableName, schema } = mapAccSchemaToDb(tableNameOverride || entityName, accSchema);
  const tableId = normalizeId(tableName);
  
  await oss.putJson(bucketKey, `${tenantPrefix}/tables/${tableId}/schema.json`, {
    id: tableId,
    name: tableName,
    folderId: null,
    schema,
    createdBy: "system/auto",
    createdAt: new Date().toISOString(),
    _source: { type: "acc", entity: entityName, accVersion: accSchema.version || null }
  });
  
  return tableId;
}


