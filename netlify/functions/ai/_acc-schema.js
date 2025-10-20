// ACC Entity Schema Fetcher
// Provides canonical schemas for Autodesk Construction Cloud entities

/**
 * Fetch ACC entity schema definition
 * In production, this could fetch from ACC API documentation or a maintained schema registry
 * For now, we maintain canonical schemas locally
 */
export async function fetchAccEntitySchema(entityName) {
  const schemas = {
    assets: {
      version: "1.0",
      entity: "assets",
      description: "ACC Asset Management entities",
      properties: {
        id: { type: "string", description: "Asset ID" },
        name: { type: "string", description: "Asset name" },
        description: { type: "string", description: "Asset description" },
        status_id: { type: "integer", description: "Status identifier" },
        category_id: { type: "integer", description: "Category identifier" },
        location: { type: "string", description: "Asset location" },
        barcode: { type: "string", description: "Asset barcode" },
        model_number: { type: "string", description: "Model number" },
        serial_number: { type: "string", description: "Serial number" },
        install_date: { type: "string", description: "Installation date" }
      },
      required: ["id", "name"]
    },
    
    issues: {
      version: "1.0",
      entity: "issues",
      description: "ACC Issues entities",
      properties: {
        id: { type: "string", description: "Issue ID" },
        title: { type: "string", description: "Issue title" },
        description: { type: "string", description: "Issue description" },
        status: { type: "string", description: "Issue status" },
        priority: { type: "string", description: "Issue priority" },
        assigned_to: { type: "string", description: "Assigned user" },
        due_date: { type: "string", description: "Due date" },
        created_at: { type: "string", description: "Creation timestamp" },
        created_by: { type: "string", description: "Creator" },
        location: { type: "string", description: "Location" }
      },
      required: ["id", "title"]
    },
    
    forms: {
      version: "1.0",
      entity: "forms",
      description: "ACC Forms entities",
      properties: {
        id: { type: "string", description: "Form ID" },
        title: { type: "string", description: "Form title" },
        template_id: { type: "string", description: "Form template ID" },
        status: { type: "string", description: "Form status" },
        created_by: { type: "string", description: "Creator" },
        created_at: { type: "string", description: "Creation date" },
        updated_at: { type: "string", description: "Last update" },
        location: { type: "string", description: "Location" }
      },
      required: ["id", "title"]
    },
    
    rfis: {
      version: "1.0",
      entity: "rfis",
      description: "ACC RFI entities",
      properties: {
        id: { type: "string", description: "RFI ID" },
        title: { type: "string", description: "RFI title" },
        question: { type: "string", description: "RFI question" },
        answer: { type: "string", description: "RFI answer" },
        status: { type: "string", description: "RFI status" },
        assigned_to: { type: "string", description: "Assigned user" },
        due_date: { type: "string", description: "Due date" },
        created_at: { type: "string", description: "Creation timestamp" }
      },
      required: ["id", "title"]
    },
    
    checklists: {
      version: "1.0",
      entity: "checklists",
      description: "ACC Checklist entities",
      properties: {
        id: { type: "string", description: "Checklist ID" },
        name: { type: "string", description: "Checklist name" },
        template_id: { type: "string", description: "Template ID" },
        status: { type: "string", description: "Checklist status" },
        completed: { type: "boolean", description: "Completion status" },
        created_at: { type: "string", description: "Creation timestamp" }
      },
      required: ["id", "name"]
    },
    
    locations: {
      version: "1.0",
      entity: "locations",
      description: "ACC Location entities",
      properties: {
        id: { type: "string", description: "Location ID" },
        name: { type: "string", description: "Location name" },
        barcode: { type: "string", description: "Location barcode" },
        parent_id: { type: "string", description: "Parent location ID" },
        path: { type: "string", description: "Location path" }
      },
      required: ["id", "name"]
    },
    
    companies: {
      version: "1.0",
      entity: "companies",
      description: "ACC Company entities",
      properties: {
        id: { type: "string", description: "Company ID" },
        name: { type: "string", description: "Company name" },
        trade: { type: "string", description: "Trade/specialty" },
        address: { type: "string", description: "Company address" },
        phone: { type: "string", description: "Phone number" },
        email: { type: "string", description: "Email address" }
      },
      required: ["id", "name"]
    }
  };
  
  return schemas[entityName] || null;
}

/**
 * Map ACC schema to DB schema format
 */
export function mapAccSchemaToDb(tableName, accSchema) {
  return {
    tableName,
    schema: {
      type: "object",
      properties: accSchema.properties,
      required: accSchema.required || []
    },
    metadata: {
      source: "acc",
      entity: accSchema.entity,
      version: accSchema.version,
      description: accSchema.description
    }
  };
}

/**
 * Get list of all available ACC entities
 */
export function getAvailableAccEntities() {
  return [
    "assets",
    "issues", 
    "forms",
    "rfis",
    "checklists",
    "locations",
    "companies"
  ];
}

