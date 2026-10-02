import { useEffect } from "react";
import { UnavailableScreen } from "../components/UnavailableScreen";

/** Catch-all for any path the router doesn't know (anything outside `/`, `/a/`, `/s/`). */
export default function NotFoundPage() {
    useEffect(() => {
        document.title = "Page not found · Drop Share";
    }, []);

    return (
        <UnavailableScreen
            title="Page not found"
            message="There's nothing at this address. Check the link, or start a new upload."
        />
    );
}
