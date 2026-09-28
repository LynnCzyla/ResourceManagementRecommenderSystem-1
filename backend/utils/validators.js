// backend/utils/validators.js
// Shared numeric validators. Each returns { value } on success or { error } on failure.
// Blank values (undefined / null / '') are treated as "not provided" and return
// the given defaultValue (null unless told otherwise).

const isBlank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

// Positive number (> 0). Decimals allowed.
function parsePositiveNumber(raw, label = 'Value', { defaultValue = null } = {}) {
  if (isBlank(raw)) return { value: defaultValue };
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    return { error: `${label} must be a number greater than 0.` };
  }
  return { value: n };
}

// Positive whole number (>= 1), optional max.
function parsePositiveInt(raw, label = 'Value', { defaultValue = null, max = null } = {}) {
  if (isBlank(raw)) return { value: defaultValue };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    return { error: `${label} must be a whole number of at least 1.` };
  }
  if (max !== null && n > max) {
    return { error: `${label} cannot be greater than ${max}.` };
  }
  return { value: n };
}

// Salary range: both optional, both > 0, min <= max.
function parseSalaryRange(rawMin, rawMax) {
  const min = parsePositiveNumber(rawMin, 'Minimum salary');
  if (min.error) return min;
  const max = parsePositiveNumber(rawMax, 'Maximum salary');
  if (max.error) return max;
  if (min.value !== null && max.value !== null && min.value > max.value) {
    return { error: 'Minimum salary cannot be greater than maximum salary.' };
  }
  return { min: min.value, max: max.value };
}

// Integer that must be present and inside [min, max] (used for system settings).
function requireIntInRange(raw, label, min, max) {
  const n = Number(raw);
  if (isBlank(raw) || !Number.isInteger(n) || n < min || n > max) {
    return { error: `${label} must be a whole number between ${min} and ${max}.` };
  }
  return { value: n };
}

module.exports = { parsePositiveNumber, parsePositiveInt, parseSalaryRange, requireIntInRange };
