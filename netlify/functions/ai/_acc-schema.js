// ACC Entity Schema Fetcher with Relationships
// Provides canonical schemas for Autodesk Construction Cloud entities + Admin tables
// Includes relational metadata (foreign keys) for referential integrity

/**
 * Fetch entity schema definition with relationships
 */
export function getEntitySchema(entity) {
  const E = String(entity || "").toLowerCase();

  const schemas = {
    // ===== Core Admin =====
    accounts: {
      version: "1.0",
      entity: "accounts",
      description: "ACC Account entities",
      properties: {
        bim360_account_id: { type: "string", description: "BIM360 Account ID" },
        display_name: { type: "string", description: "Account display name" },
        start_date: { type: "string", format: "date-time", description: "Account start date" },
        end_date: { type: "string", format: "date-time", description: "Account end date" }
      },
      required: ["bim360_account_id", "display_name"],
      relationships: {}
    },

    business_units: {
      version: "1.0",
      entity: "business_units",
      description: "Business unit organizational structure",
      properties: {
        id: { type: "string", description: "Business unit ID" },
        bim360_account_id: { type: "string", description: "Parent account ID" },
        parent_id: { type: "string", description: "Parent business unit ID" },
        name: { type: "string", description: "Business unit name" },
        description: { type: "string", description: "Business unit description" }
      },
      required: ["id", "bim360_account_id", "name"],
      relationships: {
        bim360_account_id: { references: "accounts.bim360_account_id", onDelete: "restrict" },
        parent_id: { references: "business_units.id", onDelete: "setNull" }
      }
    },

    roles: {
      version: "1.0",
      entity: "roles",
      description: "User roles and permissions",
      properties: {
        id: { type: "string", description: "Role ID" },
        bim360_account_id: { type: "string", description: "Account ID" },
        name: { type: "string", description: "Role name" },
        status: { type: "string", enum: ["active", "inactive"], description: "Role status" }
      },
      required: ["id", "bim360_account_id", "name"],
      relationships: {
        bim360_account_id: { references: "accounts.bim360_account_id", onDelete: "restrict" }
      }
    },

    users: {
      version: "1.0",
      entity: "users",
      description: "User accounts",
      properties: {
        id: { type: "string", description: "HQ user ID" },
        autodesk_id: { type: "string", description: "Autodesk user ID" },
        bim360_account_id: { type: "string", description: "Account ID" },
        email: { type: "string", description: "User email" },
        name: { type: "string", description: "Full name" },
        first_name: { type: "string", description: "First name" },
        last_name: { type: "string", description: "Last name" },
        phone: { type: "string", description: "Phone number" },
        job_title: { type: "string", description: "Job title" },
        default_role_id: { type: "string", description: "Default role" },
        default_company_id: { type: "string", description: "Default company" },
        status: { type: "string", enum: ["active", "inactive"], description: "User status" },
        created_at: { type: "string", format: "date-time", description: "Creation timestamp" },
        updated_at: { type: "string", format: "date-time", description: "Last update" }
      },
      required: ["id", "bim360_account_id", "email"],
      relationships: {
        bim360_account_id: { references: "accounts.bim360_account_id", onDelete: "restrict" },
        default_role_id: { references: "roles.id", onDelete: "setNull" }
      }
    },

    companies: {
      version: "1.0",
      entity: "companies",
      description: "Companies and trade partners",
      properties: {
        id: { type: "string", description: "Company ID" },
        bim360_account_id: { type: "string", description: "Account ID" },
        name: { type: "string", description: "Company name" },
        trade: { type: "string", description: "Trade/specialty" },
        status: { type: "string", enum: ["deleted", "active"], description: "Company status" },
        created_at: { type: "string", format: "date-time", description: "Creation timestamp" }
      },
      required: ["id", "bim360_account_id", "name"],
      relationships: {
        bim360_account_id: { references: "accounts.bim360_account_id", onDelete: "restrict" }
      }
    },

    projects: {
      version: "1.0",
      entity: "projects",
      description: "Construction projects",
      properties: {
        id: { type: "string", description: "BIM360 project ID" },
        bim360_account_id: { type: "string", description: "Account ID" },
        name: { type: "string", description: "Project name" },
        start_date: { type: "string", format: "date-time", description: "Project start date" },
        end_date: { type: "string", format: "date-time", description: "Project end date" },
        status: { type: "string", enum: ["active", "pending", "expired", "archived", "deleted"], description: "Project status" },
        job_number: { type: "string", description: "Job number" },
        created_at: { type: "string", format: "date-time", description: "Creation timestamp" },
        updated_at: { type: "string", format: "date-time", description: "Last update" }
      },
      required: ["id", "bim360_account_id", "name"],
      relationships: {
        bim360_account_id: { references: "accounts.bim360_account_id", onDelete: "restrict" }
      }
    },

    // ===== Account-level services =====
    account_services: {
      version: "1.0",
      entity: "account_services",
      description: "Services enabled at account level",
      properties: {
        bim360_account_id: { type: "string", description: "Account ID" },
        service: { 
          type: "string", 
          enum: ["documentManagement", "projectManagement", "costManagement", "designCollaboration", "fieldManagement", "modelCoordination", "field", "glue", "plan", "insight"],
          description: "Service type"
        }
      },
      required: ["bim360_account_id", "service"],
      relationships: {
        bim360_account_id: { references: "accounts.bim360_account_id", onDelete: "restrict" }
      }
    },

    // ===== Project-level services/products =====
    project_services: {
      version: "1.0",
      entity: "project_services",
      description: "Services enabled for projects",
      properties: {
        project_id: { type: "string", description: "Project ID" },
        bim360_account_id: { type: "string", description: "Account ID" },
        service: {
          type: "string",
          enum: ["documentManagement", "projectManagement", "costManagement", "designCollaboration", "fieldManagement", "modelCoordination", "field", "glue", "plan", "insight"],
          description: "Service type"
        },
        status: { type: "string", enum: ["active", "inactive", "archived"], description: "Service status" },
        created_at: { type: "string", format: "date-time", description: "Creation timestamp" }
      },
      required: ["project_id", "bim360_account_id", "service"],
      relationships: {
        project_id: { references: "projects.id", onDelete: "cascade" },
        bim360_account_id: { references: "accounts.bim360_account_id", onDelete: "restrict" }
      }
    },

    project_products: {
      version: "1.0",
      entity: "project_products",
      description: "Products enabled for projects",
      properties: {
        bim360_project_id: { type: "string", description: "Project ID" },
        bim360_account_id: { type: "string", description: "Account ID" },
        product_key: {
          type: "string",
          enum: ["autoSpecs", "build", "buildingConnected", "capitalPlanning", "cost", "designCollaboration", "docs", "financials", "insight", "modelCoordination", "projectAdministration", "takeoff"],
          description: "Product key"
        },
        status: {
          type: "string",
          enum: ["active", "activating", "inactive", "activationFailed", "deactivationFailed", "deactivating"],
          description: "Product status"
        },
        created_at: { type: "string", format: "date-time", description: "Creation timestamp" }
      },
      required: ["bim360_project_id", "bim360_account_id", "product_key"],
      relationships: {
        bim360_project_id: { references: "projects.id", onDelete: "cascade" },
        bim360_account_id: { references: "accounts.bim360_account_id", onDelete: "restrict" }
      }
    },

    // ===== Project membership / joins =====
    project_companies: {
      version: "1.0",
      entity: "project_companies",
      description: "Companies assigned to projects",
      properties: {
        project_id: { type: "string", description: "Project ID" },
        company_id: { type: "string", description: "Company ID" },
        bim360_account_id: { type: "string", description: "Account ID" },
        company_oxygen_id: { type: "string", description: "Oxygen company ID" }
      },
      required: ["project_id", "company_id", "bim360_account_id"],
      relationships: {
        project_id: { references: "projects.id", onDelete: "cascade" },
        company_id: { references: "companies.id", onDelete: "cascade" },
        bim360_account_id: { references: "accounts.bim360_account_id", onDelete: "restrict" }
      }
    },

    project_users: {
      version: "1.0",
      entity: "project_users",
      description: "Users assigned to projects",
      properties: {
        bim360_project_id: { type: "string", description: "Project ID" },
        bim360_account_id: { type: "string", description: "Account ID" },
        user_id: { type: "string", description: "User ID" },
        status: { type: "string", enum: ["active", "activating", "deleted"], description: "User status" },
        company_id: { type: "string", description: "Company ID" },
        access_level: { type: "string", enum: ["project_user", "project_admin"], description: "Access level" },
        created_at: { type: "string", format: "date-time", description: "Creation timestamp" },
        updated_at: { type: "string", format: "date-time", description: "Last update" }
      },
      required: ["bim360_project_id", "bim360_account_id", "user_id"],
      relationships: {
        bim360_project_id: { references: "projects.id", onDelete: "cascade" },
        bim360_account_id: { references: "accounts.bim360_account_id", onDelete: "restrict" },
        user_id: { references: "users.id", onDelete: "cascade" },
        company_id: { references: "companies.id", onDelete: "setNull" }
      }
    },

    project_roles: {
      version: "1.0",
      entity: "project_roles",
      description: "Roles configured for projects",
      properties: {
        bim360_account_id: { type: "string", description: "Account ID" },
        bim360_project_id: { type: "string", description: "Project ID" },
        role_oxygen_id: { type: "string", description: "Oxygen role ID" },
        name: { type: "string", description: "Role name" },
        status: { type: "string", enum: ["active", "inactive"], description: "Role status" },
        role_id: { type: "string", description: "Role ID" }
      },
      required: ["bim360_project_id", "bim360_account_id", "role_id", "name"],
      relationships: {
        bim360_account_id: { references: "accounts.bim360_account_id", onDelete: "restrict" },
        bim360_project_id: { references: "projects.id", onDelete: "cascade" },
        role_id: { references: "roles.id", onDelete: "restrict" }
      }
    },

    project_user_roles: {
      version: "1.0",
      entity: "project_user_roles",
      description: "User role assignments in projects",
      properties: {
        project_id: { type: "string", description: "Project ID" },
        bim360_account_id: { type: "string", description: "Account ID" },
        user_id: { type: "string", description: "User ID" },
        role_id: { type: "string", description: "Role ID" },
        created_at: { type: "string", format: "date-time", description: "Creation timestamp" }
      },
      required: ["project_id", "bim360_account_id", "user_id", "role_id"],
      relationships: {
        project_id: { references: "projects.id", onDelete: "cascade" },
        bim360_account_id: { references: "accounts.bim360_account_id", onDelete: "restrict" },
        user_id: { references: "users.id", onDelete: "cascade" },
        role_id: { references: "roles.id", onDelete: "restrict" }
      }
    },

    project_user_companies: {
      version: "1.0",
      entity: "project_user_companies",
      description: "User-company associations in projects",
      properties: {
        bim360_account_id: { type: "string", description: "Account ID" },
        company_oxygen_id: { type: "string", description: "Oxygen company ID" },
        project_id: { type: "string", description: "Project ID" },
        user_id: { type: "string", description: "User ID" }
      },
      required: ["project_id", "bim360_account_id", "user_id"],
      relationships: {
        project_id: { references: "projects.id", onDelete: "cascade" },
        bim360_account_id: { references: "accounts.bim360_account_id", onDelete: "restrict" },
        user_id: { references: "users.id", onDelete: "cascade" }
      }
    },

    project_user_products: {
      version: "1.0",
      entity: "project_user_products",
      description: "User product access in projects",
      properties: {
        bim360_project_id: { type: "string", description: "Project ID" },
        bim360_account_id: { type: "string", description: "Account ID" },
        user_id: { type: "string", description: "User ID" },
        product_key: {
          type: "string",
          enum: ["autoSpecs", "build", "buildingConnected", "capitalPlanning", "cost", "designCollaboration", "docs", "financials", "insight", "modelCoordination", "projectAdministration", "takeoff"],
          description: "Product key"
        },
        access_level: { type: "string", enum: ["project_user", "project_admin"], description: "Access level" },
        created_at: { type: "string", format: "date-time", description: "Creation timestamp" }
      },
      required: ["bim360_project_id", "bim360_account_id", "user_id", "product_key"],
      relationships: {
        bim360_project_id: { references: "projects.id", onDelete: "cascade" },
        bim360_account_id: { references: "accounts.bim360_account_id", onDelete: "restrict" },
        user_id: { references: "users.id", onDelete: "cascade" }
      }
    },

    // ===== Legacy ACC entities (for backward compatibility) =====
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
      required: ["id", "name"],
      relationships: {}
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
      required: ["id", "title"],
      relationships: {}
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
      required: ["id", "title"],
      relationships: {}
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
      required: ["id", "title"],
      relationships: {}
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
      required: ["id", "name"],
      relationships: {}
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
      required: ["id", "name"],
      relationships: {
        parent_id: { references: "locations.id", onDelete: "setNull" }
      }
    }
  };

  return schemas[E] || null;
}

/**
 * Map ACC schema to DB schema format with relationships
 */
export function mapAccSchemaToDb(tableName, accSchema) {
  return {
    tableName,
    schema: {
      type: "object",
      properties: accSchema.properties || {},
      required: accSchema.required || []
    },
    relationships: accSchema.relationships || {},
    version: accSchema.version || null,
    description: accSchema.description || null
  };
}

/**
 * Get list of all available ACC/Admin entities
 */
export function getAvailableAccEntities() {
  return [
    // Admin core
    "accounts",
    "business_units",
    "roles",
    "users",
    "companies",
    "projects",
    // Services/products
    "account_services",
    "project_services",
    "project_products",
    // Join tables
    "project_companies",
    "project_users",
    "project_roles",
    "project_user_roles",
    "project_user_companies",
    "project_user_products",
    // Legacy ACC
    "assets",
    "issues",
    "forms",
    "rfis",
    "checklists",
    "locations"
  ];
}

/**
 * Get admin pack entities (for batch creation)
 */
export function getAdminPackEntities() {
  return [
    "accounts",
    "business_units",
    "roles",
    "users",
    "companies",
    "projects",
    "account_services",
    "project_services",
    "project_products",
    "project_companies",
    "project_users",
    "project_roles",
    "project_user_roles",
    "project_user_companies",
    "project_user_products"
  ];
}
