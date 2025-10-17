// Property Map Configuration
// Single source of truth for normalizing Revit/ACC/Viewer/AEC-DM property names
// Used across all modules for consistent data access

export const PROPERTY_MAP = {
  // Canonical keys we will use internally:
  CATEGORY: { 
    candidates: ["Category", "__category__", "__categoryId__"],
    description: "Element category (e.g., 'Structural Framing')"
  },

  // Metromont product identity (as modeled in your families)
  CONSTRUCTION_PRODUCT: { 
    candidates: ["CONSTRUCTION_PRODUCT"],
    description: "Product type identifier"
  },
  
  CONTROL_MARK: { 
    candidates: ["CONTROL_MARK"],
    description: "Metromont control mark for grouping"
  },
  
  CONTROL_NUMBER: { 
    candidates: ["CONTROL_NUMBER"],
    description: "Unique instance identifier (primary key)"
  },
  
  IDENTITY_DESCRIPTION: { 
    candidates: ["IDENTITY_DESCRIPTION"],
    description: "Human-readable element description"
  },

  // Warped-vs-Flat selector (boolean)
  WARPED_PRODUCT: { 
    candidates: ["WARPED_PRODUCT"],
    description: "True if warped geometry, false if flat (winner selection)"
  },

  // Element identifiers (AEC DM + Viewer)
  ELEMENT_ID: { 
    candidates: ["Element Id", "ElementID", "Id", "elementId"],
    description: "Revit Element ID"
  },
  
  EXTERNAL_ID: { 
    candidates: ["External ID", "externalId", "external-id"],
    description: "External ID for viewer dbId mapping"
  },

  // Common Revit properties (for compatibility/display)
  FAMILY: {
    candidates: ["Family", "family"],
    description: "Revit family name"
  },

  TYPE_NAME: {
    candidates: ["Type Name", "typeName", "type"],
    description: "Revit type name"
  },

  LEVEL: {
    candidates: ["Level", "level"],
    description: "Level/story assignment"
  },

  // Sequencing properties (written back)
  SEQUENCE_NUMBER: {
    candidates: ["SEQUENCE_NUMBER", "Sequence Number", "SequenceNumber"],
    description: "Erection sequence number"
  },

  SEQUENCE_DATE: {
    candidates: ["SEQUENCE_DATE", "Sequence Date", "SequenceDate"],
    description: "Scheduled erection date"
  }
};

/**
 * Get all unique property names to request from data sources
 * @returns {string[]} De-duplicated list of all candidate property names
 */
export function getAllPropertyCandidates() {
  const set = new Set();
  Object.values(PROPERTY_MAP).forEach(({ candidates }) => {
    candidates.forEach(name => set.add(name));
  });
  return [...set];
}

/**
 * Look up a canonical property value from a properties object
 * Case-insensitive matching against all candidates
 * @param {Object} propsObj - Object with property name:value pairs
 * @param {string} canonicalKey - Key from PROPERTY_MAP (e.g., 'CONTROL_NUMBER')
 * @returns {any} Value if found, undefined otherwise
 */
export function propLookup(propsObj, canonicalKey) {
  const config = PROPERTY_MAP[canonicalKey];
  if (!config) {
    console.warn(`Unknown canonical key: ${canonicalKey}`);
    return undefined;
  }

  const candidates = config.candidates.map(s => s.toLowerCase());
  
  for (const [name, value] of Object.entries(propsObj)) {
    if (candidates.includes(name.toLowerCase())) {
      return value;
    }
  }
  
  return undefined;
}

/**
 * Get the first (preferred) candidate name for a canonical key
 * @param {string} canonicalKey - Key from PROPERTY_MAP
 * @returns {string} First candidate name
 */
export function getPreferredName(canonicalKey) {
  const config = PROPERTY_MAP[canonicalKey];
  return config?.candidates[0] || canonicalKey;
}

