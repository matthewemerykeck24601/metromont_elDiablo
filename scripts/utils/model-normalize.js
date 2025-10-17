// Model Data Normalization Utilities
// Converts raw AEC-DM/Viewer data into consistent internal schema

import { propLookup } from '../config/property-map.js';

/**
 * Normalize raw AEC-DM elements to internal schema
 * @param {Array} rawElements - Raw elements from AEC Data Model GraphQL
 * @returns {Array} Normalized elements with canonical property names
 */
export function normalizeElements(rawElements) {
  console.log(`📊 Normalizing ${rawElements.length} raw elements...`);
  
  return rawElements.map(e => {
    // Collapse properties array -> object { name: value }
    const p = {};
    (e.properties?.results || []).forEach(({ name, value }) => {
      p[name] = value;
    });

    const category = e.category?.name ?? propLookup(p, "CATEGORY");
    
    const normalized = {
      // AEC DM identifiers
      aecdmId: e.id,
      name: e.name || 'Unnamed',
      externalId: e.externalId ?? propLookup(p, "EXTERNAL_ID"),
      
      // Category
      category,
      
      // Metromont identity fields (primary)
      constructionProduct: propLookup(p, "CONSTRUCTION_PRODUCT"),
      controlMark: propLookup(p, "CONTROL_MARK"),
      controlNumber: propLookup(p, "CONTROL_NUMBER"),
      identityDescription: propLookup(p, "IDENTITY_DESCRIPTION"),
      
      // Warped/Flat selector
      warpedProduct: !!propLookup(p, "WARPED_PRODUCT"), // coerce to boolean
      
      // Common Revit properties (for display/compatibility)
      family: propLookup(p, "FAMILY"),
      typeName: propLookup(p, "TYPE_NAME"),
      level: propLookup(p, "LEVEL"),
      elementId: propLookup(p, "ELEMENT_ID"),
      
      // Sequencing (if present)
      sequenceNumber: propLookup(p, "SEQUENCE_NUMBER"),
      sequenceDate: propLookup(p, "SEQUENCE_DATE"),
      
      // dbId will be resolved later from externalId -> viewer dbId
      dbId: null,
      
      // Store raw properties for debugging
      _raw: p
    };
    
    return normalized;
  });
}

/**
 * Filter elements to only Structural Framing category
 * @param {Array} elements - Normalized elements
 * @returns {Array} Filtered elements
 */
export function filterStructuralFraming(elements) {
  const filtered = elements.filter(e => 
    (e.category || "").toLowerCase().includes("structural framing")
  );
  
  console.log(`🔍 Filtered to ${filtered.length} Structural Framing elements (from ${elements.length} total)`);
  return filtered;
}

/**
 * Pick "winner" elements by CONTROL_NUMBER (Warped vs Flat)
 * When multiple instances share the same CONTROL_NUMBER, keep the warped one
 * @param {Array} elements - Normalized elements
 * @returns {Array} Winner elements (unique by CONTROL_NUMBER)
 */
export function pickWinnersByControlNumber(elements) {
  console.log(`🏆 Selecting winners from ${elements.length} elements...`);
  
  const byCn = new Map();
  let warpedPreferredCount = 0;
  
  for (const el of elements) {
    const key = String(el.controlNumber || "");
    if (!key || key === 'undefined' || key === 'null') {
      console.warn(`⚠️ Element "${el.name}" (${el.aecdmId}) has no CONTROL_NUMBER, skipping`);
      continue;
    }
    
    const current = byCn.get(key);
    
    if (!current) {
      byCn.set(key, el);
      continue;
    }
    
    // Prefer warped over flat
    if (!current.warpedProduct && el.warpedProduct) {
      byCn.set(key, el);
      warpedPreferredCount++;
      console.log(`  ✓ Warped preferred for CN=${key}: ${el.name}`);
    }
  }
  
  const winners = [...byCn.values()];
  console.log(`✅ Selected ${winners.length} winners (${warpedPreferredCount} warped products preferred)`);
  
  return winners;
}

/**
 * Validate element identity fields
 * @param {Array} elements - Normalized elements
 * @returns {Object} { valid: boolean, errors: Array, warnings: Array }
 */
export function validateIdentity(elements) {
  console.log(`🔬 Validating ${elements.length} element identities...`);
  
  const errors = [];
  const warnings = [];
  const seenCn = new Map();
  
  for (const el of elements) {
    // Critical fields
    if (!el.controlNumber) {
      errors.push({ 
        element: el, 
        issue: "Missing CONTROL_NUMBER",
        severity: "error"
      });
    }
    
    if (!el.constructionProduct) {
      warnings.push({ 
        element: el, 
        issue: "Missing CONSTRUCTION_PRODUCT",
        severity: "warning"
      });
    }
    
    // Check for duplicates (after winner selection, CN should be unique)
    if (el.controlNumber) {
      const existing = seenCn.get(el.controlNumber);
      if (existing) {
        errors.push({
          element: el,
          issue: `Duplicate CONTROL_NUMBER: ${el.controlNumber} (also in ${existing.name})`,
          severity: "error"
        });
      } else {
        seenCn.set(el.controlNumber, el);
      }
    }
  }
  
  if (errors.length > 0) {
    console.error(`❌ Found ${errors.length} validation errors:`);
    errors.slice(0, 5).forEach(e => console.error(`   - ${e.element.name}: ${e.issue}`));
    if (errors.length > 5) console.error(`   ... and ${errors.length - 5} more`);
  }
  
  if (warnings.length > 0) {
    console.warn(`⚠️ Found ${warnings.length} validation warnings:`);
    warnings.slice(0, 5).forEach(w => console.warn(`   - ${w.element.name}: ${w.issue}`));
    if (warnings.length > 5) console.warn(`   ... and ${warnings.length - 5} more`);
  }
  
  if (errors.length === 0 && warnings.length === 0) {
    console.log(`✅ All elements validated successfully`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Attach viewer dbIds to normalized elements
 * @param {Array} elements - Normalized elements
 * @param {Map} extIdToDbMap - Map of externalId -> dbId
 * @returns {Array} Elements with dbId attached
 */
export function attachDbIds(elements, extIdToDbMap) {
  let matchedCount = 0;
  let missingCount = 0;
  const missing = [];
  
  elements.forEach(e => {
    if (e.externalId && extIdToDbMap.has(e.externalId)) {
      e.dbId = extIdToDbMap.get(e.externalId);
      matchedCount++;
    } else {
      missingCount++;
      if (missing.length < 10) {
        missing.push({ cn: e.controlNumber, name: e.name, externalId: e.externalId });
      }
    }
  });
  
  const hitRate = ((matchedCount / elements.length) * 100).toFixed(1);
  console.log(`🔗 Mapped ${matchedCount}/${elements.length} elements to viewer dbIds (${hitRate}% hit rate)`);
  
  if (missingCount > 0) {
    console.warn(`⚠️ ${missingCount} elements could not be mapped to viewer dbIds:`);
    missing.forEach(m => console.warn(`   - CN=${m.cn} (${m.name}): externalId=${m.externalId || 'missing'}`));
    if (missingCount > 10) console.warn(`   ... and ${missingCount - 10} more`);
  }
  
  return elements;
}

/**
 * Complete normalization pipeline
 * @param {Array} rawElements - Raw elements from AEC-DM
 * @param {Map} extIdToDbMap - Optional: externalId -> dbId mapping from viewer
 * @returns {Object} { elements, validation, stats }
 */
export function normalizeElementsPipeline(rawElements, extIdToDbMap = null) {
  console.log('\n🔄 === ELEMENT NORMALIZATION PIPELINE ===');
  
  const stats = {
    raw: rawElements.length,
    normalized: 0,
    filtered: 0,
    winners: 0,
    mapped: 0
  };
  
  // Step 1: Normalize
  const normalized = normalizeElements(rawElements);
  stats.normalized = normalized.length;
  
  // Step 2: Filter to Structural Framing
  const filtered = filterStructuralFraming(normalized);
  stats.filtered = filtered.length;
  
  // Step 3: Pick winners by CONTROL_NUMBER
  const winners = pickWinnersByControlNumber(filtered);
  stats.winners = winners.length;
  
  // Step 4: Validate
  const validation = validateIdentity(winners);
  
  // Step 5: Attach dbIds if mapping provided
  if (extIdToDbMap) {
    attachDbIds(winners, extIdToDbMap);
    stats.mapped = winners.filter(e => e.dbId).length;
  }
  
  console.log('\n📈 Pipeline Summary:');
  console.log(`   Raw elements:        ${stats.raw}`);
  console.log(`   Normalized:          ${stats.normalized}`);
  console.log(`   Structural Framing:  ${stats.filtered}`);
  console.log(`   Winners (unique CN): ${stats.winners}`);
  if (extIdToDbMap) {
    console.log(`   Mapped to viewer:    ${stats.mapped}`);
  }
  console.log(`   Validation:          ${validation.valid ? '✅ PASS' : '❌ FAIL'}`);
  console.log('=== END PIPELINE ===\n');
  
  return {
    elements: winners,
    validation,
    stats
  };
}

