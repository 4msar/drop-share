import { useThemeActions } from "../contexts/useTheme";

export const Footer = () => {
    const { toggleTheme } = useThemeActions();

    return (
        <footer className="mt-5 text-center text-[10px] text-body">
            <p className="flex items-center justify-center gap-1">
                <a
                    className="text-body no-underline"
                    title="Made with ❤️ by msar.dev"
                    href="https://msar.dev"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    <svg
                        className="size-3 inline-block"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5" />
                    </svg>
                </a>
                |
                <a
                    className="text-body no-underline"
                    title="View source on GitHub"
                    href="https://github.com/4msar/drop-share"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    <svg
                        role="img"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="size-3 inline-block"
                    >
                        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                    </svg>
                </a>
                |
                <button
                    className="text-body cursor-pointer"
                    onClick={toggleTheme}
                    title="Toggle theme"
                >
                    <svg
                        className="size-3 inline-block"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z" />
                        <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
                        <circle
                            cx="17.5"
                            cy="10.5"
                            r=".5"
                            fill="currentColor"
                        />
                        <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
                        <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
                    </svg>
                </button>
            </p>
        </footer>
    );
};
