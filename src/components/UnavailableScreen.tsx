import { useNavigate } from "react-router";
import { Button } from "./Button";
import { ArchiveIcon } from "./Icons";

interface UnavailableScreenProps {
    title: string;
    message: string;
}

/** Full-page "nothing here" state, shared by the viewer's load error and the catch-all route. */
export function UnavailableScreen({ title, message }: UnavailableScreenProps) {
    const navigate = useNavigate();
    return (
        <main className="grid min-h-dvh place-items-center p-6">
            <section
                role="alert"
                className="max-w-md text-center flex flex-col gap-y-4"
            >
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-500">
                    <ArchiveIcon />
                </div>

                <h1 className="text-2xl font-medium text-heading">{title}</h1>
                <p className="text-body">{message}</p>
                <Button
                    variant="primary"
                    size="sm"
                    onClick={() => void navigate("/")}
                >
                    Go home
                </Button>
            </section>
        </main>
    );
}
