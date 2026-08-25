import type { SVGProps } from "react";
import { cn } from "../lib/utils";

export const ImageIcon = ({ className, ...rest }: SVGProps<SVGSVGElement>) => (
    <svg
        className={cn("size-4 inline-block", className)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        {...rest}
    >
        <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
);

export const ThemeIcon = ({ className, ...rest }: SVGProps<SVGSVGElement>) => (
    <svg
        className={cn("size-4 inline-block", className)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        {...rest}
    >
        <path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z" />
        <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
        <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
        <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
        <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
    </svg>
);

export const ActionIcon = ({ className, ...rest }: SVGProps<SVGSVGElement>) => (
    <svg
        className={cn("size-4 inline-block", className)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        {...rest}
    >
        <path d="M4 5h16" />
        <path d="M4 12h16" />
        <path d="M4 19h16" />
    </svg>
);

export const FolderIcon = ({ className, ...rest }: SVGProps<SVGSVGElement>) => (
    <svg
        className={cn("size-4 inline-block", className)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        {...rest}
    >
        <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
        <path d="M12 10v6" />
        <path d="m9 13 3-3 3 3" />
    </svg>
);
export const ParentFolderIcon = ({
    className,
    ...rest
}: SVGProps<SVGSVGElement>) => (
    <svg
        className={cn("size-4 inline-block", className)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        {...rest}
    >
        <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
);

export const ChevronIcon = ({
    type = "down",
    className,
    ...rest
}: SVGProps<SVGSVGElement>) => (
    <svg
        className={cn("size-4 inline-block", className)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        {...rest}
    >
        {type === "down" && <path d="m6 9 6 6 6-6" />}

        {type === "left" && <path d="m9 18 6-6-6-6" />}
        {type === "right" && <path d="m15 18-6-6 6-6" />}

        {type === "up" && <path d="m6 15 6-6 6 6" />}
    </svg>
);

export const UploadIcon = ({ className, ...rest }: SVGProps<SVGSVGElement>) => (
    <svg
        className={cn("size-4 inline-block", className)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        {...rest}
    >
        <path
            d="M7 18a4.5 4.5 0 0 1-.4-8.98A5.5 5.5 0 0 1 17.5 8a4 4 0 0 1 .5 7.98"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
        <path
            d="M12 20v-7.5m0 0-3 3m3-3 3 3"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);
