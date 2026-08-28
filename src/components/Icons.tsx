import type { PropsWithChildren, SVGProps } from "react";
import { cn } from "../lib/utils";

const CommonIconProps: Partial<SVGProps<SVGSVGElement>> = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
};

const Icon = ({
    children,
    className,
    ...props
}: PropsWithChildren<SVGProps<SVGSVGElement>>) => (
    <svg
        {...CommonIconProps}
        {...props}
        className={cn("size-4 inline-block", className)}
    >
        {children}
    </svg>
);

export const ImageIcon = (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
        <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </Icon>
);
export const FileIcon = (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
        <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
        <path d="M14 2v5a1 1 0 0 0 1 1h5" />
        <path d="M10 9H8" />
        <path d="M16 13H8" />
        <path d="M16 17H8" />
    </Icon>
);
export const PdfFileIcon = (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
        <path d="M2 6h4" />
        <path d="M2 10h4" />
        <path d="M2 14h4" />
        <path d="M2 18h4" />
        <rect width="16" height="20" x="4" y="2" rx="2" />
        <path d="M9.5 8h5" />
        <path d="M9.5 12H16" />
        <path d="M9.5 16H14" />
    </Icon>
);

export const ArchiveIcon = (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
        <path d="M13.659 22H18a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v11.5" />
        <path d="M14 2v5a1 1 0 0 0 1 1h5" />
        <path d="M8 12v-1" />
        <path d="M8 18v-2" />
        <path d="M8 7V6" />
        <circle cx="8" cy="20" r="2" />
    </Icon>
);

export const ShareIcon = (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <line x1="8.59" x2="15.42" y1="13.51" y2="17.49" />
        <line x1="15.41" x2="8.59" y1="6.51" y2="10.49" />
    </Icon>
);

export const LockIcon = (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
        <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </Icon>
);

export const TrashIcon = (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
        <path d="M10 11v6" />
        <path d="M14 11v6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
        <path d="M3 6h18" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </Icon>
);

export const ThemeIcon = (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
        <path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z" />
        <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
        <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
        <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
        <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
    </Icon>
);

export const ActionIcon = (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
        <circle cx="12" cy="12" r="1" />
        <circle cx="19" cy="12" r="1" />
        <circle cx="5" cy="12" r="1" />
    </Icon>
);

export const FolderIcon = (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
        <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
        <path d="M12 10v6" />
        <path d="m9 13 3-3 3 3" />
    </Icon>
);
export const ParentFolderIcon = (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
        <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </Icon>
);

export const ChevronIcon = ({
    type = "down",
    ...props
}: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
        {type === "down" && <path d="m6 9 6 6 6-6" />}

        {type === "left" && <path d="m9 18 6-6-6-6" />}
        {type === "right" && <path d="m15 18-6-6 6-6" />}

        {type === "up" && <path d="m6 15 6-6 6 6" />}
    </Icon>
);

export const UploadIcon = (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
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
    </Icon>
);

export const EyeIcon = (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
        <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
        <circle cx="12" cy="12" r="3" />
    </Icon>
);

export const CodeIcon = (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
        <path d="m18 16 4-4-4-4" />
        <path d="m6 8-4 4 4 4" />
        <path d="m14.5 4-5 16" />
    </Icon>
);

export const CheckIcon = (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
        <path d="M20 6 9 17l-5-5" />
    </Icon>
);

export const FullscreenEnterIcon = (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
        <path d="M8 3H3v5" />
        <path d="M3 3l6 6" />
        <path d="M16 3h5v5" />
        <path d="M21 3l-6 6" />
        <path d="M8 21H3v-5" />
        <path d="M3 21l6-6" />
        <path d="M16 21h5v-5" />
        <path d="M21 21l-6-6" />
    </Icon>
);

export const FullscreenExitIcon = (props: SVGProps<SVGSVGElement>) => (
    <Icon {...props}>
        <path d="M9 9H3V3" />
        <path d="M3 9l7-7" />
        <path d="M15 9h6V3" />
        <path d="M21 9l-7-7" />
        <path d="M9 15H3v6" />
        <path d="M3 15l7 7" />
        <path d="M15 15h6v6" />
        <path d="M21 15l-7 7" />
    </Icon>
);
