// Viewer ExternalId <-> DbId Mapping Utilities
// Maps AEC-DM externalIds to Forge Viewer dbIds for element isolation

/**
 * Get externalId -> dbId mapping from loaded viewer model
 * @param {Object} viewer - Autodesk Viewer instance
 * @returns {Promise<Map>} Map of externalId -> dbId
 */
export async function mapExternalIdsToDbIds(viewer) {
  if (!viewer || !viewer.model) {
    console.error('❌ Viewer or model not available for ID mapping');
    return new Map();
  }

  console.log('🔗 Fetching externalId -> dbId mapping from viewer...');

  return new Promise((resolve) => {
    viewer.model.getExternalIdMapping((mapping) => {
      // mapping: { externalId: dbId, ... }
      const map = new Map();
      let count = 0;

      for (const [externalId, dbId] of Object.entries(mapping)) {
        if (typeof dbId === 'number' && externalId) {
          map.set(externalId, dbId);
          count++;
        }
      }

      console.log(`✅ Mapped ${count} externalIds to dbIds`);
      resolve(map);
    });
  });
}

/**
 * Get dbIds for a list of externalIds
 * @param {Map} extIdToDbMap - Map from mapExternalIdsToDbIds()
 * @param {string[]} externalIds - List of external IDs to look up
 * @returns {number[]} Array of dbIds (only those found)
 */
export function getDbIdsForExternalIds(extIdToDbMap, externalIds) {
  const dbIds = [];
  const missing = [];

  externalIds.forEach(xid => {
    const dbId = extIdToDbMap.get(xid);
    if (typeof dbId === 'number') {
      dbIds.push(dbId);
    } else {
      missing.push(xid);
    }
  });

  if (missing.length > 0 && missing.length <= 10) {
    console.warn(`⚠️ Could not map ${missing.length} externalIds:`, missing);
  } else if (missing.length > 10) {
    console.warn(`⚠️ Could not map ${missing.length} externalIds (first 10):`, missing.slice(0, 10));
  }

  return dbIds;
}

/**
 * Get dbIds for elements by their CONTROL_NUMBERs
 * @param {Array} elements - Normalized elements with dbId attached
 * @param {string[]} controlNumbers - CONTROL_NUMBERs to filter by
 * @returns {number[]} Array of dbIds for matching elements
 */
export function getDbIdsByControlNumbers(elements, controlNumbers) {
  const cnSet = new Set(controlNumbers.map(cn => String(cn)));
  const dbIds = [];

  elements.forEach(el => {
    if (cnSet.has(String(el.controlNumber)) && typeof el.dbId === 'number') {
      dbIds.push(el.dbId);
    }
  });

  if (dbIds.length === 0) {
    console.warn(`⚠️ No dbIds found for control numbers:`, controlNumbers);
  } else {
    console.log(`✓ Found ${dbIds.length} dbIds for ${controlNumbers.length} control numbers`);
  }

  return dbIds;
}

/**
 * Isolate elements in viewer by their CONTROL_NUMBERs
 * @param {Object} viewer - Autodesk Viewer instance
 * @param {Array} elements - Normalized elements with dbIds
 * @param {string[]} controlNumbers - CONTROL_NUMBERs to isolate
 * @returns {number} Number of elements isolated
 */
export function isolateByControlNumbers(viewer, elements, controlNumbers) {
  if (!viewer) {
    console.error('❌ Viewer not available for isolation');
    return 0;
  }

  const dbIds = getDbIdsByControlNumbers(elements, controlNumbers);

  if (dbIds.length > 0) {
    viewer.isolate(dbIds);
    viewer.fitToView(dbIds);
    console.log(`🎯 Isolated ${dbIds.length} elements in viewer`);
  } else {
    viewer.showAll();
    console.warn('⚠️ No elements to isolate, showing all');
  }

  return dbIds.length;
}

/**
 * Show all elements that match a filter function
 * @param {Object} viewer - Autodesk Viewer instance
 * @param {Array} elements - Normalized elements with dbIds
 * @param {Function} filterFn - Function that returns true for elements to show
 * @returns {number} Number of elements shown
 */
export function isolateByFilter(viewer, elements, filterFn) {
  if (!viewer) {
    console.error('❌ Viewer not available for isolation');
    return 0;
  }

  const filtered = elements.filter(filterFn);
  const dbIds = filtered
    .map(e => e.dbId)
    .filter(id => typeof id === 'number');

  if (dbIds.length > 0) {
    viewer.isolate(dbIds);
    viewer.fitToView(dbIds);
    console.log(`🎯 Isolated ${dbIds.length} elements by filter`);
  } else {
    viewer.showAll();
    console.warn('⚠️ No elements match filter, showing all');
  }

  return dbIds.length;
}

/**
 * Get viewer model statistics
 * @param {Object} viewer - Autodesk Viewer instance
 * @returns {Object} Model stats
 */
export function getViewerStats(viewer) {
  if (!viewer || !viewer.model) {
    return null;
  }

  const stats = {
    name: viewer.model.getData().name,
    urn: viewer.model.getData().urn,
    rootId: viewer.model.getRootId(),
    visibleCount: 0,
    hiddenCount: 0
  };

  const tree = viewer.model.getData().instanceTree;
  if (tree) {
    tree.enumNodeChildren(tree.getRootId(), (dbId) => {
      if (viewer.isNodeVisible(dbId)) {
        stats.visibleCount++;
      } else {
        stats.hiddenCount++;
      }
    }, true);
  }

  return stats;
}

