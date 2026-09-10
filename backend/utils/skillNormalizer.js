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
/**
 * Add all four comparison-key variants for `skill` into `set`.
 */
const addComparisonKeys = (set, skill) => {
    for (const key of buildComparisonKeys(skill)) {
        set.add(key);
    }
};

/**
 * Return true if ANY comparison-key variant of `skill` is present in `set`.
 */
const hasComparisonKey = (set, skill) =>
    buildComparisonKeys(skill).some(key => set.has(key));

module.exports = {
    normalizeSkill,
    skillKey,
    compactSkillKey,
    singularizeToken,
    singularSkillKey,
    singularCompactSkillKey,
    buildComparisonKeys,
    addComparisonKeys,
    hasComparisonKey
};
