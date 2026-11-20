import type { AnchorHTMLAttributes, ButtonHTMLAttributes, HTMLAttributes } from 'react';
import { clearStoredSession } from '../lib/tab-session';
import { withSignedFlag } from '../lib/signing-request';

// The building blocks the screens share. Each takes className for its place on the
// screen (width, margins, transitions).

type Variant = 'primary' | 'secondary';

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'bg-warm-black text-white hover:bg-warm-black/90 active:scale-[0.99]',
  secondary: 'border border-cream-dark text-warm-black hover:bg-cream',
};

// A primary button that is turned off (links can't be)
const DISABLED_CLASS = 'disabled:opacity-[0.35] disabled:cursor-not-allowed disabled:hover:bg-warm-black';

function buttonClass(variant: Variant, className: string): string {
  return `flex items-center justify-center gap-2 py-3.5 rounded-[14px] font-semibold text-sm ${VARIANT_CLASS[variant]} ${className}`;
}

export function Card({ className = '', ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`bg-white rounded-[20px] border border-cream-dark shadow-sm ${className}`} {...rest} />;
}

/** A screen's title. SigningFlow moves focus here when the screen appears, so screen readers say where the owner is. */
export function StageHeading({ className = '', ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return <h1 tabIndex={-1} data-stage-heading className={`${className} outline-none`} {...rest} />;
}

export function Button({ variant = 'primary', className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
}) {
  const disabledClass = variant === 'primary' ? `${DISABLED_CLASS} ` : '';
  return <button className={buttonClass(variant, disabledClass + className)} {...rest} />;
}

/**
 * A way back to the dashboard. `endSession` drops this tab's saved signing session first,
 * so going back in the browser doesn't open the link again; `signed` adds signed=1 so the
 * dashboard confirms the result. With a variant it looks like a button.
 */
export function DashboardLink({ href, endSession = false, signed = false, variant, className = '', ...rest }:
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick'> & {
    href: string;
    endSession?: boolean;
    signed?: boolean;
    variant?: Variant;
  }) {
  return (
    <a
      href={signed ? withSignedFlag(href) : href}
      onClick={endSession ? clearStoredSession : undefined}
      className={variant ? buttonClass(variant, className) : className}
      {...rest}
    />
  );
}

/** Leaves without signing, ending the session. */
export function CancelLink({ href }: { href: string }) {
  return (
    <DashboardLink href={href} endSession variant="secondary" className="w-full mt-3 transition-colors">
      Cancel
    </DashboardLink>
  );
}
