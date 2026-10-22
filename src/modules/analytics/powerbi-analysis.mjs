/** Governed Power BI query compiler. No prompt, raw DAX or raw column input is executable. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[a-z][a-z0-9_-]{0,63}$/;
const IDENTIFIER = /^[\p{L}_][\p{L}\p{N}_ .-]{0,119}$/u;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

export function ensure(condition, code) {
  if (!condition) throw new Error(code);
}
export function guid(value) {
  ensure(typeof value === 'string' && UUID.test(value), 'BI_INVALID_ID');
  return value.toLowerCase();
}
function identifier(value) {
  ensure(typeof value === 'string' && IDENTIFIER.test(value), 'BI_INVALID_IDENTIFIER');
  return value;
}
function uniqueKeys(items) {
  ensure(Array.isArray(items) && new Set(items.map(item => item?.key)).size === items.length, 'BI_DUPLICATE_KEY');
  for (const item of items) ensure(item && typeof item.key === 'string' && KEY.test(item.key), 'BI_INVALID_KEY');
}
export function validateModel(model) {
  ensure(model && typeof model.key === 'string' && KEY.test(model.key) && typeof model.label === 'string' && model.label.length <= 160, 'BI_INVALID_MODEL');
  guid(model.workspaceId); guid(model.datasetId);
  identifier(model.date?.table); identifier(model.date?.column);
  ensure(Array.isArray(model.measures) && model.measures.length > 0 && model.measures.length <= 20, 'BI_INVALID_MEASURES');
  ensure(Array.isArray(model.dimensions) && model.dimensions.length <= 20, 'BI_INVALID_DIMENSIONS');
  uniqueKeys(model.measures); uniqueKeys(model.dimensions);
  for (const metric of model.measures) {
    identifier(metric.table); identifier(metric.name);
    ensure(['additive', 'nonadditive'].includes(metric.kind), 'BI_INVALID_MEASURE_KIND');
    ensure(['number', 'currency', 'ratio'].includes(metric.unit), 'BI_INVALID_UNIT');
    ensure(typeof metric.blankAsZero === 'boolean', 'BI_BLANK_POLICY_REQUIRED');
    ensure(typeof metric.label === 'string' && metric.label.length <= 160, 'BI_INVALID_LABEL');
  }
  for (const dimension of model.dimensions) {
    identifier(dimension.table); identifier(dimension.column);
    ensure(typeof dimension.label === 'string' && dimension.label.length <= 160, 'BI_INVALID_LABEL');
  }
  return model;
}
function day(value) {
  ensure(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value), 'BI_INVALID_DATE');
  const epoch = Date.parse(`${value}T00:00:00Z`);
  ensure(Number.isFinite(epoch) && new Date(epoch).toISOString().slice(0, 10) === value, 'BI_INVALID_DATE');
  ensure(Number(value.slice(0, 4)) >= 1900 && Number(value.slice(0, 4)) <= 2200, 'BI_INVALID_DATE');
  return epoch / 86400000;
}
export function validateRequest(model, request) {
  validateModel(model);
  ensure(request && request.modelKey === model.key, 'BI_MODEL_NOT_APPROVED');
  const metric = model.measures.find(item => item.key === request.metricKey);
  ensure(metric, 'BI_METRIC_NOT_APPROVED');
  const dimension = request.dimensionKey == null ? null : model.dimensions.find(item => item.key === request.dimensionKey);
  ensure(request.dimensionKey == null || dimension, 'BI_DIMENSION_NOT_APPROVED');
  const cs = day(request.currentStart), ce = day(request.currentEnd);
  const ps = day(request.previousStart), pe = day(request.previousEnd);
  ensure(cs <= ce && ps <= pe && pe < cs && ce - cs <= 365 && ce - cs === pe - ps, 'BI_INVALID_PERIODS');
  const maxSegments = request.maxSegments ?? 100;
  ensure(Number.isInteger(maxSegments) && maxSegments >= 1 && maxSegments <= 200, 'BI_INVALID_SEGMENT_LIMIT');
  return {metric, dimension, maxSegments, periodDays: ce - cs + 1};
}
const column = (table, name) => `'${identifier(table)}'[${identifier(name)}]`;
const dateLiteral = value => `DATE(${value.split('-').map(Number).join(',')})`;
export function buildKpiQuery(model, request) {
  const {metric, dimension, maxSegments} = validateRequest(model, request);
  const measure = column(metric.table, metric.name), date = column(model.date.table, model.date.column);
  const calculate = (start, end) => `CALCULATE(${measure},DATESBETWEEN(${date},${dateLiteral(start)},${dateLiteral(end)}))`;
  const current = calculate(request.currentStart, request.currentEnd);
  const previous = calculate(request.previousStart, request.previousEnd);
  const total = `ROW("__kind","total","__segment",BLANK(),"__current",${current},"__previous",${previous})`;
  if (!dimension) return `EVALUATE ${total}`;
  const dim = column(dimension.table, dimension.column);
  const segments = `SELECTCOLUMNS(SUMMARIZECOLUMNS(${dim},"__current",${current},"__previous",${previous}),"__kind","segment","__segment",${dim},"__current",[__current],"__previous",[__previous])`;
  // One extra row detects truncation. Never present a top-N subset as a full reconciliation.
  return `EVALUATE UNION(${total},TOPN(${maxSegments + 1},${segments},[__segment],ASC))`;
}
function numeric(value, blankAsZero) {
  if (value === null && blankAsZero) return 0;
  ensure(typeof value === 'number' && Number.isFinite(value), 'BI_MISSING_OR_NONNUMERIC_VALUE');
  return value;
}
function delta(current, previous) {
  const change = current - previous;
  ensure(Number.isFinite(change), 'BI_NUMERIC_OVERFLOW');
  const relative = previous > 0 ? change / previous * 100 : null;
  return {current, previous, change, percentChange: Number.isFinite(relative) ? relative : null};
}
function sum(values) {
  // Compensated summation reduces avoidable floating-point reconciliation errors.
  let total = 0, correction = 0;
  for (const value of values) { const y = value - correction, next = total + y; correction = (next - total) - y; total = next; }
  return total;
}
export function analyseKpi(model, request, rows) {
  const {metric, dimension, maxSegments, periodDays} = validateRequest(model, request);
  ensure(Array.isArray(rows) && rows.length > 0 && rows.length <= maxSegments + 1, 'BI_INCOMPLETE_RESULT');
  ensure(rows.every(row => row !== null && typeof row === 'object' && !Array.isArray(row)), 'BI_INVALID_RESULT_SHAPE');
  const totals = rows.filter(row => row['[__kind]'] === 'total');
  const segments = rows.filter(row => row['[__kind]'] === 'segment');
  ensure(totals.length === 1 && totals.length + segments.length === rows.length, 'BI_INVALID_RESULT_SHAPE');
  ensure(dimension || segments.length === 0, 'BI_INVALID_RESULT_SHAPE');
  ensure(new Set(segments.map(row => JSON.stringify(row['[__segment]']))).size === segments.length, 'BI_DUPLICATE_SEGMENT');
  for (const row of rows) {
    ensure(own(row, '[__current]') && own(row, '[__previous]') && own(row, '[__segment]'), 'BI_INVALID_RESULT_SHAPE');
  }
  const values = row => delta(numeric(row['[__current]'], metric.blankAsZero), numeric(row['[__previous]'], metric.blankAsZero));
  const total = values(totals[0]);
  const changes = segments.map(row => {
    const label = row['[__segment]'];
    ensure(label === null || typeof label === 'string' || typeof label === 'number' || typeof label === 'boolean', 'BI_INVALID_RESULT_SHAPE');
    ensure(String(label ?? '').length <= 500, 'BI_INVALID_RESULT_SHAPE');
    return {segment: label === null ? '(blank)' : String(label), ...values(row)};
  }).sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
  let reconciliation = {status: 'not_applicable', currentDifference: null, previousDifference: null, tolerance: null};
  if (dimension && metric.kind === 'additive') {
    const currentSum = sum(changes.map(row => row.current)), previousSum = sum(changes.map(row => row.previous));
    const tolerance = Math.max(0.000001, Number.EPSILON * Math.max(1, Math.abs(total.current), Math.abs(total.previous)) * 1024);
    const currentDifference = currentSum - total.current, previousDifference = previousSum - total.previous;
    const matches = Number.isFinite(currentDifference) && Number.isFinite(previousDifference) && Math.abs(currentDifference) <= tolerance && Math.abs(previousDifference) <= tolerance;
    reconciliation = {status: matches ? 'matched' : 'mismatch', currentDifference, previousDifference, tolerance};
  }
  const warnings = ['Observed changes and associations are not proof of causation.', 'The result reflects the connected Microsoft user’s permissions, not every row in the organisation.'];
  if (metric.kind === 'nonadditive' && dimension) warnings.push('This metric is non-additive. Segment values must not be summed into a contribution waterfall.');
  if (reconciliation.status === 'mismatch') warnings.push('Segment totals do not reconcile. Contribution attribution is disabled. Check the model, relationships and metric definition.');
  if (total.previous <= 0) warnings.push('Percentage change is withheld because the baseline is zero or negative.');
  return {metric: metric.label, unit: metric.unit, periodDays, total, segments: changes, reconciliation,
    contributionEligible: reconciliation.status === 'matched',
    percentagePointChange: metric.unit === 'ratio' && Number.isFinite(total.change * 100) ? total.change * 100 : null, warnings,
    narrative: `${metric.label} ${total.change > 0 ? 'increased' : total.change < 0 ? 'decreased' : 'was unchanged'} across the selected equal-length periods. ${dimension ? 'Segment changes are ranked by absolute movement; this is a descriptive investigation, not a causal finding.' : 'Choose an approved dimension to investigate segment changes.'}`};
}
