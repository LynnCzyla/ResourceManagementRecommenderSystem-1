import React from 'react';

/**
 * LocationSelector
 * Provides a clean checkbox-style selection between branch location(s)
 * and an "Other" option with a dark-theme consistent input box.
 */
export default function LocationSelector({
  value = '',
  onChange,
  options = [],
  placeholder = 'Enter the location...',
  required = true,
}) {
  const cleanOptions = (options || [])
    .map(opt => String(opt || '').trim())
    .filter(Boolean)
    .filter((opt, idx, arr) => arr.indexOf(opt) === idx);

  const isBranchSelected = cleanOptions.includes(value);
  const isOtherSelected = !isBranchSelected || cleanOptions.length === 0;

  const handleSelectBranch = (opt) => {
    if (onChange) onChange(opt);
  };

  const handleSelectOther = () => {
    if (isBranchSelected && onChange) {
      onChange('');
    }
  };

  const handleOtherInputChange = (e) => {
    if (onChange) {
      onChange(e.target.value);
    }
  };

  const renderCheckbox = (checked) => (
    <div
      style={{
        width: '18px',
        height: '18px',
        borderRadius: '4px',
        border: checked ? '1.5px solid var(--color-primary, #10b981)' : '1.5px solid var(--color-border, rgba(255, 255, 255, 0.2))',
        backgroundColor: checked ? 'var(--color-primary, #10b981)' : 'var(--color-bg-root, #0b132b)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        transition: 'all 0.15s ease',
      }}
    >
      {checked && (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#ffffff"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
      {cleanOptions.map((opt, idx) => {
        const isSelected = value === opt;
        return (
          <div
            key={idx}
            onClick={() => handleSelectBranch(opt)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 12px',
              borderRadius: '8px',
              border: isSelected ? '1.5px solid var(--color-primary, #10b981)' : '1px solid var(--color-border, rgba(255, 255, 255, 0.12))',
              backgroundColor: isSelected ? 'rgba(16, 185, 129, 0.1)' : 'var(--color-bg-root, #0b132b)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {renderCheckbox(isSelected)}
            <span
              style={{
                fontSize: '13px',
                fontWeight: isSelected ? 600 : 400,
                color: 'var(--color-text-primary, #f8fafc)',
                userSelect: 'none',
                lineHeight: '1.4',
              }}
            >
              {opt}
            </span>
          </div>
        );
      })}

      {/* Other Option */}
      <div
        onClick={handleSelectOther}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '8px 12px',
          borderRadius: '8px',
          border: isOtherSelected ? '1.5px solid var(--color-primary, #10b981)' : '1px solid var(--color-border, rgba(255, 255, 255, 0.12))',
          backgroundColor: isOtherSelected ? 'rgba(16, 185, 129, 0.1)' : 'var(--color-bg-root, #0b132b)',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
      >
        {renderCheckbox(isOtherSelected)}
        <span
          style={{
            fontSize: '13px',
            fontWeight: isOtherSelected ? 600 : 400,
            color: 'var(--color-text-primary, #f8fafc)',
            userSelect: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Other:
        </span>
        <input
          type="text"
          required={required && isOtherSelected}
          placeholder={placeholder}
          value={isOtherSelected ? value : ''}
          onFocus={handleSelectOther}
          onChange={handleOtherInputChange}
          onClick={(e) => e.stopPropagation()}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid var(--color-border, rgba(255, 255, 255, 0.15))',
            fontSize: '13px',
            backgroundColor: 'var(--color-bg-root, #0b132b)',
            color: 'var(--color-text-primary, #f8fafc)',
            outline: 'none',
            boxSizing: 'border-box',
            transition: 'border-color 0.15s ease',
          }}
        />
      </div>
    </div>
  );
}
