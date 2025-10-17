# Property System Implementation Progress

## Completed Steps ✅

### Step 1: Property Map Configuration ✅
**File:** `scripts/config/property-map.js`

Created a centralized property mapping system that:
- Defines canonical keys (CONTROL_NUMBER, CONSTRUCTION_PRODUCT, etc.)
- Maps multiple candidate names to each canonical key
- Provides case-insensitive lookup with `propLookup()`
- Includes all Metromont-specific identity fields
- Supports WARPED_PRODUCT for winner selection
- Includes sequencing properties (SEQUENCE_NUMBER, SEQUENCE_DATE)

**Commit:** `f06d20b`

### Step 2-3: Data Normalization Utilities ✅
**Files:** 
- `scripts/utils/model-normalize.js`
- `scripts/utils/viewer-mapping.js`
- `scripts/utils/csv-schedule.js`

#### model-normalize.js:
- `normalizeElements()` - Converts raw AEC-DM to internal schema
- `filterStructuralFraming()` - Filters to Structural Framing category
- `pickWinnersByControlNumber()` - Selects warped over flat duplicates
- `validateIdentity()` - Validates required fields and uniqueness
- `attachDbIds()` - Maps externalIds to viewer dbIds
- `normalizeElementsPipeline()` - Complete pipeline with logging

#### viewer-mapping.js:
- `mapExternalIdsToDbIds()` - Gets mapping from viewer
- `getDbIdsByControlNumbers()` - Resolves CNs to dbIds
- `isolateByControlNumbers()` - Isolates elements by CN in viewer
- `isolateByFilter()` - Generic filter-based isolation

#### csv-schedule.js:
- `parseScheduleCSV()` - Parses CSV with CONTROL_NUMBER column
- `joinScheduleToElements()` - Matches schedule to elements by CN
- `groupBySequenceDate()` - Groups for timeline playback
- `buildTimeline()` - Creates sorted timeline
- `exportScheduleWithMappings()` - Exports joined data

**Commit:** `f06d20b`

---

## Next Steps 📋

### Step 4: Update AEC-DM GraphQL Queries
**File to modify:** `scripts/aecdm-graphql.js`

Tasks:
- Import `getAllPropertyCandidates()` from property-map
- Update GraphQL query to request all mapped properties
- Add `fetchElementsByElementGroup()` function
- Integrate with normalization pipeline
- Return normalized elements ready for use

### Step 5: Integrate into erection-sequencing.js
**File to modify:** `scripts/erection-sequencing.js`

Tasks:
- Import normalization utilities
- Replace current property extraction with normalized pipeline
- Use `pickWinnersByControlNumber()` for duplicate handling
- Update `loadPropGrid()` to use normalized elements
- Update `isolateElementsForCurrentDay()` to use CONTROL_NUMBER
- Replace Mark-based matching with CONTROL_NUMBER matching

### Step 6: Update UI to Use New Fields
**Files to modify:** 
- `scripts/erection-sequencing.js`
- `erection-sequencing.html`

Tasks:
- Update default grouping to use CONSTRUCTION_PRODUCT, CONTROL_MARK, CONTROL_NUMBER
- Update table headers to show new fields
- Remove Family/Type Name dependencies
- Add WARPED_PRODUCT indicator
- Update filter UI to show CONSTRUCTION_PRODUCT options

### Step 7: CSV Schedule Mapping
**File to modify:** `scripts/erection-sequencing.js`

Tasks:
- Use `parseScheduleCSV()` for CSV loading
- Use `joinScheduleToElements()` for matching
- Use `buildTimeline()` for playback
- Display hit rates and warnings for unmapped elements

### Step 8: AEC-DM Write-Back (Future Enhancement)
**New file:** `scripts/utils/aecdm-extensibility.js`

Tasks:
- Implement package creation for ErectionSequence
- Add property definition creation
- Implement batch write for SEQUENCE_NUMBER and SEQUENCE_DATE
- Add UI button to "Write Schedule to Model"

### Step 9: Enhanced Logging
**File to modify:** `scripts/erection-sequencing.js`

Tasks:
- Add pipeline stats display in UI
- Show validation warnings/errors in notifications
- Display hit rates for CSV joins
- Add debug panel for data quality metrics

### Step 10: Testing & Validation
Tasks:
- Test with actual Metromont model
- Validate CONTROL_NUMBER uniqueness
- Test warped vs flat winner selection
- Verify CSV schedule mapping
- Test pop-out window with new fields
- Validate export functionality

---

## Integration Points

### Current Data Flow:
```
AEC-DM GraphQL Query → Raw Elements → Viewer Properties → UI Display
```

### New Data Flow:
```
AEC-DM GraphQL Query (all mapped properties)
  ↓
normalizeElements() → Internal Schema
  ↓
filterStructuralFraming() → Only Structural Framing
  ↓
pickWinnersByControlNumber() → Warped preferred
  ↓
validateIdentity() → Check completeness
  ↓
mapExternalIdsToDbIds() → Get viewer mapping
  ↓
attachDbIds() → Link to viewer
  ↓
UI Display / CSV Join / Sequencing
```

### CSV Schedule Flow:
```
CSV Upload
  ↓
parseScheduleCSV() → Validate columns
  ↓
joinScheduleToElements() → Match by CONTROL_NUMBER
  ↓
groupBySequenceDate() → Timeline
  ↓
buildTimeline() → Sorted steps
  ↓
Playback in Viewer (isolateByControlNumbers)
```

---

## Key Benefits

1. **Single Source of Truth**: All property names defined once in property-map.js
2. **Type Safety**: Canonical keys prevent typos and inconsistencies
3. **Extensibility**: Easy to add new properties or modules
4. **Winner Selection**: Automatic warped vs flat duplicate handling
5. **Validation**: Comprehensive identity checking with detailed logging
6. **Debugging**: Full pipeline logging at each stage
7. **CSV Mapping**: Robust join with hit rate reporting
8. **Viewer Integration**: Clean externalId → dbId mapping

---

## Configuration

### Adding New Properties:
1. Add to `PROPERTY_MAP` in `property-map.js`
2. Add candidates array with all possible names
3. Use `propLookup(props, 'YOUR_KEY')` in normalization
4. Property automatically included in GraphQL queries

### Adding New Modules:
1. Import property-map utilities
2. Use `propLookup()` for property access
3. Use normalized element schema
4. Follow established logging patterns

---

## Testing Checklist

- [ ] Property map lookup (case-insensitive)
- [ ] Element normalization from AEC-DM
- [ ] Structural Framing filter
- [ ] Winner selection (warped over flat)
- [ ] Identity validation
- [ ] ExternalId → dbId mapping
- [ ] CSV parsing with CONTROL_NUMBER
- [ ] Schedule join with elements
- [ ] Timeline building and sorting
- [ ] Viewer isolation by CONTROL_NUMBER
- [ ] Export with mappings
- [ ] Pop-out window with new fields
- [ ] Grouping modal with new properties

---

## Known Limitations

1. **AEC-DM Write-Back**: Not yet implemented (Step 8)
2. **Multi-Region Support**: Currently US only
3. **Large Model Performance**: May need pagination for 10k+ elements
4. **CSV Format**: Expects specific column names (configurable)
5. **Error Recovery**: Some validation errors are warnings only

---

## Documentation References

- [AEC Data Model GraphQL Docs](https://aps.autodesk.com/en/docs/aec-data-model/v1/reference/overview/)
- [Forge Viewer API](https://aps.autodesk.com/en/docs/viewer/v7/reference/Viewing/)
- [AEC Extensibility (Future)](https://aps.autodesk.com/en/docs/aec-data-model/v1/developers_guide/extensions/)

---

**Status:** Steps 1-3 Complete ✅  
**Next:** Update AEC-DM GraphQL queries (Step 4)  
**Commit:** f06d20b

