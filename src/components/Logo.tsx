interface LogoProps {
  size?: number;
  className?: string;
  eyeColor?: string;
}

export function BotWalletLogo({ size = 24, className = '', eyeColor = '#fff' }: LogoProps) {
  return (
    <svg
      width={size + 4}
      height={size + 3}
      viewBox="0 0 36 35"
      fill="none"
      className={className}
    >
      <path d="M0 0 H36 V29 H4 V3 H0 Z" fill="currentColor" opacity="0.35" />
      <rect x="0" y="3" width="32" height="32" fill="currentColor" />
      <rect x="8" y="14" width="4" height="2" fill={eyeColor} />
      <rect x="18" y="14" width="4" height="2" fill={eyeColor} />
    </svg>
  );
}

export function BotWalletWordmark({ size = 24, className = '' }: LogoProps) {
  return (
    <div className={`flex items-center ${className}`} style={{ gap: `${size * 0.3}px` }}>
      <BotWalletLogo size={size} />
      <span
        className="font-black tracking-[0.12em] uppercase"
        style={{ fontSize: `${size * 0.5}px`, lineHeight: 1 }}
      >
        BotWallet
      </span>
    </div>
  );
}
