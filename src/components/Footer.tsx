export const Footer = () => {
    return (
        <footer className="mt-5 text-center text-[10px] text-body">
            <p className="flex items-center justify-center gap-1">
                <a
                    className="text-brand no-underline"
                    title="Made with ❤️ by msar.dev"
                    href="https://msar.dev"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    msar
                </a>
                |
                <a
                    className="text-brand no-underline"
                    title="View source on GitHub"
                    href="https://github.com/4msar/drop-share"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    github
                </a>
                |
                <button
                    className="text-brand"
                    onClick={() =>
                        document.documentElement.classList.toggle("dark")
                    }
                >
                    theme
                </button>
            </p>
        </footer>
    );
};
