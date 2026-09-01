import { useEffect } from "react";

export const ErrorToast = ({
    message,
    timeout = 5000,
    onClose,
}: {
    message: string;
    timeout?: number;
    onClose?: () => void;
}) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose?.();
        }, timeout);

        return () => clearTimeout(timer);
    }, [timeout, onClose]);

    return (
        <div
            role="alert"
            className="fixed bottom-4 right-4 z-50 bg-red-500 text-white px-4 py-2 rounded shadow-lg"
        >
            <p>{message}</p>
        </div>
    );
};
