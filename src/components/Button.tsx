import type { ButtonHTMLAttributes } from "react";
import { cn } from "../lib/utils";

export type ButtonVariant = "primary" | "secondary" | "link" | "danger";
export type ButtonSize = "xs" | "sm" | "lg";

const BASE =
    "inline-flex items-center justify-center font-sans whitespace-nowrap cursor-pointer " +
    "transition-colors focus-visible:outline-none focus-visible:ring-2 " +
    "focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface " +
    "disabled:cursor-not-allowed disabled:opacity-60";

const VARIANTS: Record<ButtonVariant, string> = {
    primary:
        "rounded-lg border border-transparent bg-brand text-white hover:bg-brand/90",
    secondary:
        "rounded-lg border border-edge bg-surface text-heading hover:border-brand-edge",
    danger: "rounded-lg border border-red-500 bg-transparent text-red-500 hover:bg-red-500/10",
    link: "rounded-sm border-none bg-transparent text-body underline hover:text-heading",
};

const SIZES: Record<ButtonSize, string> = {
    xs: "px-2 py-1 text-[11px]",
    sm: "px-4 py-2 text-[13px]",
    lg: "px-7 py-3.5 text-base",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
}

export function Button({
    variant = "secondary",
    size = "sm",
    className = "",
    type = "button",
    ...props
}: ButtonProps) {
    const sizing = variant === "link" ? "px-1.5 py-1.5 text-sm" : SIZES[size];
    return (
        <button
            type={type}
            className={cn(BASE, VARIANTS[variant], sizing, className)}
            {...props}
        />
    );
}
