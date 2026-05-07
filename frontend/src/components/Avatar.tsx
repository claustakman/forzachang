// Fælles Avatar-komponent — bruges i Board, Afstemning, Fines, Admin og Matches

export default function Avatar({
  name,
  url,
  size = 36,
}: {
  name?: string;
  url?: string;
  size?: number;
}) {
  const displayName = name || '?';

  if (url) {
    return (
      <img
        src={url}
        alt={displayName}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
        }}
        onError={e => {
          (e.currentTarget as HTMLImageElement).style.display = 'none';
        }}
      />
    );
  }

  // Farvepalette baseret på første bogstav
  const palettes = [
    { bg: '#e8f8f2', color: '#1D9E75' },
    { bg: '#e8f0fb', color: '#3a7fd4' },
    { bg: '#fef3e2', color: '#e07b00' },
    { bg: '#fce8e8', color: '#d32f2f' },
    { bg: '#f3e5f5', color: '#7b1fa2' },
  ];
  const idx = (displayName.charCodeAt(0) + (displayName.charCodeAt(1) || 0)) % palettes.length;
  const { bg, color } = palettes[idx];

  const initials = displayName
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: size * 0.38,
        flexShrink: 0,
        border: `1.5px solid ${color}44`,
      }}
    >
      {initials}
    </div>
  );
}
