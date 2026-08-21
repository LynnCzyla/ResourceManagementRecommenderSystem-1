import React, { useEffect, useState } from 'react';

function getInitials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function RMAvatar({ name, src, size = 36, style = {} }) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  if (src && !hasError) {
    return (
      <img
        src={src}
        alt={name}
        onError={() => setHasError(true)}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
          ...style,
        }}
      />
    );
  }

  return (
    <div
      aria-label={name}
      title={name}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, var(--color-primary), #2563eb)',
        color: '#ffffff',
        fontSize: Math.max(11, Math.round(size * 0.32)),
        fontWeight: '800',
        letterSpacing: '0.5px',
        flexShrink: 0,
        ...style,
      }}
    >
      {getInitials(name)}
    </div>
  );
}