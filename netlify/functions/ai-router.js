// Centralized AI Action Router
// Single endpoint for all AI commands across El Diablo modules

import OpenAI from "openai";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { response, parseUser, requireAdmin, ensureBucket, createOssClient, getBucket } from "./_db-helpers.js";
import { dispatchAction } from "./ai/_dispatch.js";
import { auditAiAction } from "./ai/_audit.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load system prompt
const SYSTEM_PROMPT = readFileSync(join(__dirname, 'ai/_system-prompt.txt'), 'utf8');

// OpenAI configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Action registry for validation
const ACTION_REGISTRY = [
  // Database actions
  'db.create_table',
  'db.insert_rows',
  'db.ensure_canonical_table',
  'db.ensure_admin_pack',
  
  // ACC import actions
  'acc.import.assets',
  'acc.import.issues',
  'acc.import.forms',
  'acc.import.rfis',
  'acc.import.checklists',
  'acc.import.locations',
  'acc.import.companies',
  
  // Admin actions
  'admin.user.assign_roles',
  'admin.module.enable',
  'admin.module.disable',
  
  // Erection sequencing actions
  'erection.ensure_db_ready',
  'erection.create_sequence',
  'erection.attach_schedule',
  
  // QC actions
  'qc.upload_bed_report',
  'qc.list_reports',
  
  // Meta actions
  'clarify'
];

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
    const { messages, direct } = JSON.parse(event.body || "{}");
    
    // Direct mode: bypass OpenAI, execute action directly (for dev/testing)
    if (direct && direct.action && direct.args) {
      console.log('🎯 Direct action mode:', direct.action);
      
      // Validate action
      if (!ACTION_REGISTRY.includes(direct.action) && direct.action !== 'clarify') {
        return response(400, { 
          error: "Invalid action", 
          action: direct.action,
          available: ACTION_REGISTRY 
        });
      }
      
      // Execute action
      try {
        const result = await dispatchAction(event, direct.action, direct.args, user);
        
        // Audit the action
        await auditAiAction(event, user, direct.action, direct.args, { ok: true, data: result });
        
        return response(200, { 
          ok: true, 
          action: direct.action, 
          result,
          mode: 'direct'
        });
      } catch (error) {
        console.error('❌ Direct action failed:', error);
        
        // Audit the failure
        await auditAiAction(event, user, direct.action, direct.args, { ok: false, error: error.message });
        
        return response(400, { 
          ok: false,
          error: error.message, 
          action: direct.action 
        });
      }
    }

    // AI mode: use OpenAI to interpret natural language
    if (!Array.isArray(messages) || messages.length === 0) {
      return response(400, { error: "Missing messages array (or use direct mode with {action, args})" });
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

    // Handle clarification requests
    if (action === 'clarify') {
      console.log('💬 AI requests clarification:', args.question);
      return response(200, {
        ok: true,
        action: 'clarify',
        question: args.question || "Please provide more information",
        requiresClarification: true
      });
    }

    // Validate action is in registry
    if (!ACTION_REGISTRY.includes(action)) {
      console.error('❌ AI returned unknown action:', action);
      await auditAiAction(event, user, action, args, { ok: false, error: 'Unknown action' });
      return response(400, { 
        error: "Unknown action", 
        action,
        available: ACTION_REGISTRY 
      });
    }

    console.log('📋 Executing action:', action, 'with args:', args);

    // Ensure bucket exists
    const oss = createOssClient(event);
    const bucketKey = getBucket();
    await ensureBucket(oss, bucketKey);

    // Execute action via dispatcher
    try {
      const result = await dispatchAction(event, action, args, user);
      
      // Audit successful action
      await auditAiAction(event, user, action, args, { ok: true, data: result });
      
      console.log('✅ Action completed:', action);
      return response(200, { 
        ok: true, 
        action, 
        result,
        mode: 'ai',
        model: 'gpt-4o'
      });
      
    } catch (error) {
      console.error('❌ Action execution failed:', error);
      
      // Audit failed action
      await auditAiAction(event, user, action, args, { ok: false, error: error.message });
      
      return response(400, { 
        ok: false,
        error: error.message, 
        action,
        args 
      });
    }

  } catch (err) {
    console.error('❌ AI router error:', err);
    return response(500, { error: "AI router failed", details: String(err.message || err) });
  }
}

