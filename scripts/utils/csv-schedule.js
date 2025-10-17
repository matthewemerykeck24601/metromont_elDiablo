// CSV Schedule Mapping Utilities
// Maps CSV schedule rows to normalized elements by CONTROL_NUMBER

/**
 * Parse CSV schedule data
 * Expected columns: CONTROL_NUMBER, SEQUENCE_NUMBER, SEQUENCE_DATE, Activity, ...
 * @param {string} csvText - CSV file contents
 * @returns {Array} Parsed schedule rows
 */
export function parseScheduleCSV(csvText) {
  console.log('📋 Parsing CSV schedule...');
  
  try {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) {
      throw new Error('CSV file is empty or has no data rows');
    }

    // Parse header
    const header = lines[0].split(',').map(h => h.trim());
    console.log('CSV columns:', header);

    // Check for required columns
    const requiredCols = ['CONTROL_NUMBER'];
    const missingCols = requiredCols.filter(col => !header.includes(col));
    
    if (missingCols.length > 0) {
      throw new Error(`Missing required columns: ${missingCols.join(', ')}`);
    }

    // Parse data rows
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      if (values.length < header.length) continue; // Skip incomplete rows

      const row = {};
      header.forEach((col, idx) => {
        row[col] = values[idx];
      });

      // Validate CONTROL_NUMBER
      if (!row.CONTROL_NUMBER) {
        console.warn(`⚠️ Row ${i + 1} has no CONTROL_NUMBER, skipping`);
        continue;
      }

      rows.push(row);
    }

    console.log(`✅ Parsed ${rows.length} schedule rows from CSV`);
    return rows;
    
  } catch (error) {
    console.error('❌ Error parsing CSV:', error);
    throw error;
  }
}

/**
 * Join schedule rows with normalized elements by CONTROL_NUMBER
 * @param {Array} elements - Normalized elements
 * @param {Array} scheduleRows - Parsed CSV schedule rows
 * @returns {Object} { matched, unmatched, orphaned }
 */
export function joinScheduleToElements(elements, scheduleRows) {
  console.log(`🔗 Joining ${scheduleRows.length} schedule rows with ${elements.length} elements...`);
  
  // Build lookup map: CONTROL_NUMBER -> element
  const elementMap = new Map();
  elements.forEach(el => {
    if (el.controlNumber) {
      elementMap.set(String(el.controlNumber), el);
    }
  });

  const matched = [];
  const unmatched = []; // schedule rows with no matching element
  const elementsCovered = new Set();

  // Match schedule rows to elements
  scheduleRows.forEach(row => {
    const cn = String(row.CONTROL_NUMBER);
    const element = elementMap.get(cn);

    if (element) {
      matched.push({
        element,
        schedule: row,
        controlNumber: cn
      });
      elementsCovered.add(cn);
    } else {
      unmatched.push({
        controlNumber: cn,
        schedule: row
      });
    }
  });

  // Find elements not in schedule (orphaned)
  const orphaned = elements.filter(el => !elementsCovered.has(String(el.controlNumber)));

  // Calculate hit rate
  const hitRate = ((matched.length / scheduleRows.length) * 100).toFixed(1);
  
  console.log(`✅ Joined ${matched.length}/${scheduleRows.length} schedule rows (${hitRate}% hit rate)`);
  
  if (unmatched.length > 0) {
    console.warn(`⚠️ ${unmatched.length} schedule rows could not match elements:`);
    unmatched.slice(0, 5).forEach(u => 
      console.warn(`   - CN=${u.controlNumber} (${u.schedule.Activity || 'no activity'})`)
    );
    if (unmatched.length > 5) {
      console.warn(`   ... and ${unmatched.length - 5} more`);
    }
  }

  if (orphaned.length > 0) {
    console.warn(`⚠️ ${orphaned.length} elements not in schedule:`);
    orphaned.slice(0, 5).forEach(el => 
      console.warn(`   - CN=${el.controlNumber} (${el.name})`)
    );
    if (orphaned.length > 5) {
      console.warn(`   ... and ${orphaned.length - 5} more`);
    }
  }

  return {
    matched,
    unmatched,
    orphaned,
    stats: {
      scheduleRows: scheduleRows.length,
      elements: elements.length,
      matched: matched.length,
      unmatched: unmatched.length,
      orphaned: orphaned.length,
      hitRate: parseFloat(hitRate)
    }
  };
}

/**
 * Group matched elements by date for sequencing
 * @param {Array} matched - Matched array from joinScheduleToElements
 * @returns {Map} Map of date -> elements
 */
export function groupBySequenceDate(matched) {
  const dateMap = new Map();

  matched.forEach(m => {
    const date = m.schedule.SEQUENCE_DATE || m.schedule.StartDate || 'Unscheduled';
    
    if (!dateMap.has(date)) {
      dateMap.set(date, []);
    }
    
    dateMap.get(date).push(m);
  });

  const dates = [...dateMap.keys()].sort();
  console.log(`📅 Grouped into ${dates.length} sequence dates`);

  return dateMap;
}

/**
 * Get elements for a specific sequence date
 * @param {Map} dateMap - Map from groupBySequenceDate
 * @param {string} date - Date to query (ISO format: YYYY-MM-DD)
 * @returns {Array} Matched elements for that date
 */
export function getElementsForDate(dateMap, date) {
  return dateMap.get(date) || [];
}

/**
 * Build timeline for playback
 * @param {Map} dateMap - Map from groupBySequenceDate
 * @returns {Array} Sorted array of { date, elements, count }
 */
export function buildTimeline(dateMap) {
  const dates = [...dateMap.keys()].sort();
  
  const timeline = dates.map(date => ({
    date,
    elements: dateMap.get(date),
    count: dateMap.get(date).length
  }));

  console.log(`📊 Built timeline with ${timeline.length} steps`);
  timeline.forEach((step, idx) => {
    console.log(`   ${idx + 1}. ${step.date}: ${step.count} elements`);
  });

  return timeline;
}

/**
 * Export schedule with element mappings to CSV
 * @param {Array} matched - Matched array from joinScheduleToElements
 * @returns {string} CSV text
 */
export function exportScheduleWithMappings(matched) {
  const cols = [
    'CONTROL_NUMBER',
    'Element Name',
    'Construction Product',
    'Control Mark',
    'Sequence Number',
    'Sequence Date',
    'Activity',
    'dbId'
  ];

  const lines = [cols.join(',')];

  matched.forEach(m => {
    const el = m.element;
    const sch = m.schedule;
    
    const row = [
      el.controlNumber || '',
      csvEscape(el.name),
      csvEscape(el.constructionProduct || ''),
      csvEscape(el.controlMark || ''),
      sch.SEQUENCE_NUMBER || '',
      sch.SEQUENCE_DATE || '',
      csvEscape(sch.Activity || ''),
      el.dbId || ''
    ];
    
    lines.push(row.join(','));
  });

  return lines.join('\n');
}

/**
 * Escape CSV field value
 * @param {string} value - Value to escape
 * @returns {string} Escaped value
 */
function csvEscape(value) {
  const str = String(value ?? '');
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

