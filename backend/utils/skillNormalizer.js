// backend/utils/skillNormalizer.js
// =============================================================
// SINGLE SOURCE OF TRUTH — Skill Normalization & Comparison
// Imported by: documentController.js, feedbackController.js,
//              recommendationService.js
// =============================================================

/**
 * Normalize a raw skill value to a clean display string.
 * Handles string, object (with skill_name/skill_tag/skill), and other types.
 */
const normalizeSkill = (skill) => {
    if (typeof skill === 'string') return skill.trim();
    if (typeof skill === 'object' && skill !== null) {
        return (skill.skill_name || skill.skill_tag || skill.skill || String(skill)).trim();
    }
    return String(skill).trim();
};

// ─── Primary key (case-insensitive, whitespace-collapsed) ────────────────────
// Used for strict dedup comparisons. NEVER used for display.
const skillKey = (skill) =>
    normalizeSkill(skill).toLowerCase().replace(/\s+/g, ' ').trim();

// ─── Compact key (strips all non-alphanumeric) ───────────────────────────────
// Helps match variants like "Power Point" vs "PowerPoint".
const compactSkillKey = (skill) =>
    normalizeSkill(skill).toLowerCase().replace(/[^a-z0-9]+/g, '');

// ─── Singularization helper ──────────────────────────────────────────────────
const singularizeToken = (token) => {
    if (!token || token.length < 4) return token;
    if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
    if (token.endsWith('ses') || token.endsWith('xes') || token.endsWith('zes')) return token.slice(0, -2);
    if (token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
    return token;
};

const singularSkillKey = (skill) => {
    const tokens = skillKey(skill).split(' ').map(singularizeToken).filter(Boolean);
    return tokens.join(' ').trim();
};

const singularCompactSkillKey = (skill) => {
    const tokens = skillKey(skill).split(' ').map(singularizeToken).filter(Boolean);
    return tokens.join('').replace(/[^a-z0-9]+/g, '');
};

// ─── Build all four comparison key variants for a given skill ────────────────
// Returns [strict, compact, singular, singularCompact].
// Used to build a Set so that any variant of a skill can be quickly looked up.
const buildComparisonKeys = (skill) => {
    const strict = skillKey(skill);
    const compact = compactSkillKey(skill);
    const singular = singularSkillKey(skill);
    const singularCompact = singularCompactSkillKey(skill);

    return [...new Set([strict, compact, singular, singularCompact].filter(Boolean))];
};

// ─── Helpers that work with a Set of comparison keys ────────────────────────
const addComparisonKeys = (set, skill) => {
    for (const key of buildComparisonKeys(skill)) {
        set.add(key);
    }
};

const hasComparisonKey = (set, skill) =>
    buildComparisonKeys(skill).some(key => set.has(key));

// =============================================================
// TOKEN-SUBSET MATCHING — solves compound-skill matching
// e.g. "gas and oil planning" (employee) ⊇ "gas planning" (required)
// =============================================================

// Connector / filler words that don't carry meaning for skill matching.
// Deliberately conservative — never add real technical terms here
// (e.g. never add "c", "r", "go" — those are language names).
const STOPWORDS = new Set([
    'and', 'or', 'the', 'a', 'an', 'of', 'for', 'with', 'in', 'on', 'to', '&'
]);

/**
 * Break a skill string into a normalized, stopword-filtered, singularized
 * token array. Splits on whitespace, commas, slashes, ampersands, hyphens.
 */
const tokenizeSkill = (skill) => {
    const key = skillKey(skill);
    return key
        .split(/[\s,/&-]+/)
        .map(t => t.replace(/[^a-z0-9]/g, ''))
        .filter(t => t.length > 0 && !STOPWORDS.has(t))
        .map(singularizeToken);
};

const tokenSetOf = (skill) => new Set(tokenizeSkill(skill));

/**
 * True if EVERY meaningful token of `requiredSkill` is present in
 * `candidateSkill`'s token set. This lets a compound employee skill like
 * "gas and oil planning" satisfy a narrower requirement like "gas planning",
 * regardless of word order or connector words.
 *
 * minReqTokens guards against 1-word requirements matching too broadly
 * (e.g. requirement "management" matching any skill that merely contains
 * that word, like "risk management").
 */
const isSubsetMatch = (requiredSkill, candidateSkill, { minReqTokens = 2 } = {}) => {
    const reqTokens = tokenSetOf(requiredSkill);
    if (reqTokens.size < minReqTokens) return false;
    const candTokens = tokenSetOf(candidateSkill);
    for (const t of reqTokens) {
        if (!candTokens.has(t)) return false;
    }
    return true;
};

/**
 * Token-level Jaccard similarity between two skill strings (0..1).
 * Used only as a last-resort fallback tier, after exact/alias/subset.
 * Deliberately does NOT use edit-distance/fuzzy string matching — that
 * approach produces dangerous false positives on short technical terms
 * (e.g. "php" vs "sap", "react" vs "redact" are 1-2 edits apart).
 */
const jaccardSimilarity = (skillA, skillB) => {
    const a = tokenSetOf(skillA);
    const b = tokenSetOf(skillB);
    if (a.size === 0 || b.size === 0) return 0;
    let inter = 0;
    for (const t of a) if (b.has(t)) inter++;
    const union = new Set([...a, ...b]).size;
    return union === 0 ? 0 : inter / union;
};

// =============================================================
// Safe UUID validation (prevents SQL-injection via interpolated id lists)
// =============================================================
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value) => typeof value === 'string' && UUID_RE.test(value);

module.exports = {
    normalizeSkill,
    skillKey,
    compactSkillKey,
    singularizeToken,
    singularSkillKey,
    singularCompactSkillKey,
    buildComparisonKeys,
    addComparisonKeys,
    hasComparisonKey,
    tokenizeSkill,
    tokenSetOf,
    isSubsetMatch,
    jaccardSimilarity,
    isUuid
};
