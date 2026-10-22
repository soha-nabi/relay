'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// ─── GlassFilter SVG (singleton — rendered once at app root via GlassFilterPortal) ──
// Each LiquidButton references the filter by id without re-declaring it.
export function GlassFilterPortal() {
  return (
    <svg className="pointer-events-none absolute h-0 w-0 overflow-hidden" aria-hidden focusable="false">
      <defs>
        <filter
          id="relay-glass-filter"
          x="0%" y="0%" width="100%" height="100%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence type="fractalNoise" baseFrequency="0.05 0.05" numOctaves="1" seed="1" result="turbulence" />
          <feGaussianBlur in="turbulence" stdDeviation="2" result="blurredNoise" />
          <feDisplacementMap in="SourceGraphic" in2="blurredNoise" scale="60" xChannelSelector="R" yChannelSelector="B" result="displaced" />
          <feGaussianBlur in="displaced" stdDeviation="3.5" result="finalBlur" />
          <feComposite in="finalBlur" in2="finalBlur" operator="over" />
        </filter>
      </defs>
    </svg>
  );
}

// ─── Detect backdrop-filter url() support ─────────────────────────────────────
function useBackdropFilterUrlSupport(): boolean {
  const [supported, setSupported] = React.useState(false);
  React.useEffect(() => {
    // Heuristic: Chromium supports url() in backdrop-filter; Firefox/Safari do not as of 2025
    const el = document.createElement('div');
    el.style.backdropFilter = 'url("#test")';
    setSupported(el.style.backdropFilter !== '');
  }, []);
  return supported;
}

// ─── LiquidButton variants ────────────────────────────────────────────────────
const liquidButtonVariants = cva(
  [
    'relative inline-flex items-center justify-center cursor-pointer gap-2',
    'whitespace-nowrap font-medium transition-[color,transform,box-shadow]',
    'duration-300 select-none',
    // Focus ring — always visible on keyboard navigation
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg:not([class*="size-"])]:size-4 [&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        default: 'text-white hover:scale-[1.03] active:scale-[0.98]',
        outline: 'border border-white/30 text-white hover:bg-white/10 hover:scale-[1.03] active:scale-[0.98]',
        ghost: 'text-white/80 hover:text-white hover:bg-white/10',
      },
      size: {
        sm: 'h-8 px-4 text-xs rounded-full',
        default: 'h-10 px-5 text-sm rounded-full',
        lg: 'h-11 px-7 text-sm rounded-full',
        xl: 'h-12 px-8 text-base rounded-full',
        xxl: 'h-14 px-10 text-lg rounded-full',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'xl',
    },
  }
);

export interface LiquidButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof liquidButtonVariants> {
  asChild?: boolean;
}

export const LiquidButton = React.forwardRef<HTMLButtonElement, LiquidButtonProps>(
  ({ className, variant, size, asChild = false, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    const glassSupported = useBackdropFilterUrlSupport();

    return (
      <Comp
        ref={ref}
        data-slot="liquid-button"
        className={cn(liquidButtonVariants({ variant, size }), className)}
        {...props}
      >
        {/* Glass distortion overlay — only if browser supports backdrop-filter url() */}
        {glassSupported ? (
          <span
            className="absolute inset-0 z-0 rounded-[inherit] overflow-hidden"
            style={{ backdropFilter: 'url("#relay-glass-filter")' }}
            aria-hidden
          />
        ) : (
          /* Solid-colour fallback — frosted glass look via bg + border */
          <span
            className="absolute inset-0 z-0 rounded-[inherit] bg-white/10 border border-white/25 backdrop-blur-sm"
            aria-hidden
          />
        )}

        {/* Glass bubble shadow ring */}
        <span
          className="absolute inset-0 z-0 rounded-[inherit] shadow-[0_0_6px_rgba(0,0,0,0.05),0_2px_8px_rgba(0,0,0,0.1),inset_2px_2px_0.5px_-3px_rgba(255,255,255,0.15),inset_-2px_-2px_0.5px_-3px_rgba(255,255,255,0.08),inset_0_0_8px_6px_rgba(255,255,255,0.07),0_0_16px_rgba(255,255,255,0.08)]"
          aria-hidden
        />

        {/* Content sits above effects */}
        <span className="relative z-10 flex items-center gap-2">
          {children}
        </span>
      </Comp>
    );
  }
);
LiquidButton.displayName = 'LiquidButton';

// ─── Re-export standard button variants for shadcn compat ────────────────────
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-blue-600 text-white hover:bg-blue-700',
        destructive: 'bg-red-500 text-white hover:bg-red-600',
        outline: 'border border-slate-200 bg-white hover:bg-slate-50 hover:text-slate-900',
        secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200',
        ghost: 'hover:bg-slate-100 hover:text-slate-900',
        link: 'text-blue-600 underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-10 px-6',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
    );
  }
);
Button.displayName = 'Button';
