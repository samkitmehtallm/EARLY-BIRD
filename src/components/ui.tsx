import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export const cn = (...v: ClassValue[]) => twMerge(clsx(v));

type Variant = "primary" | "secondary" | "ghost" | "danger" | "eb";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-bg hover:opacity-90",
  secondary: "bg-surface-2 text-ink hover:bg-line/70",
  ghost: "text-ink-2 hover:bg-surface-2",
  danger: "text-urgent hover:bg-urgent-soft",
  eb: "bg-eb text-white hover:opacity-90 dark:text-black",
};
const SIZES = { sm: "h-8 px-3 text-[13px] gap-1.5", md: "h-10 px-4 text-sm gap-2", icon: "h-8 w-8 justify-center" };

export function buttonClass(variant: Variant = "secondary", size: keyof typeof SIZES = "md", className?: string) {
  return cn(
    "inline-flex shrink-0 items-center rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export function Button({ variant, size, className, ...rest }: ComponentProps<"button"> & { variant?: Variant; size?: keyof typeof SIZES }) {
  return <button className={buttonClass(variant, size, className)} {...rest} />;
}

export function LinkButton({ variant, size, className, ...rest }: ComponentProps<typeof Link> & { variant?: Variant; size?: keyof typeof SIZES }) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}

type Tone = "neutral" | "accent" | "eb" | "urgent" | "ok";
const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2",
  accent: "bg-accent-soft text-accent",
  eb: "bg-eb-soft text-eb",
  urgent: "bg-urgent-soft text-urgent",
  ok: "bg-ok-soft text-ok",
};

export function Badge({ tone = "neutral", className, children, title }: { tone?: Tone; className?: string; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide whitespace-nowrap", TONES[tone], className)}>
      {children}
    </span>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-2xl border border-line bg-surface shadow-card", className)}>{children}</div>;
}

export function Avatar({ name, src, size = 40, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} loading="lazy" className={cn("shrink-0 rounded-full object-cover bg-surface-2", className)} style={{ width: size, height: size }} />
  ) : (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-display font-bold text-accent", className)}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials}
    </span>
  );
}

export function SectionTitle({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <div className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">{eyebrow}</div>}
        <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">{title}</h2>
      </div>
      {right}
    </div>
  );
}

export function Empty({ icon, title, body, action }: { icon?: ReactNode; title: string; body: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center">
      {icon && <div className="text-muted">{icon}</div>}
      <div className="font-display text-lg font-bold">{title}</div>
      <div className="max-w-md text-sm text-muted">{body}</div>
      {action}
    </div>
  );
}

export function PageHeader({ title, lede, right }: { title: string; lede?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
        {lede && <p className="mt-1.5 max-w-2xl text-[15px] text-muted">{lede}</p>}
      </div>
      {right}
    </div>
  );
}
