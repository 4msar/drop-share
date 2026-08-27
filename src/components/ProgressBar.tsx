import { useEffect, useState } from "react";

interface ProgressBarProps {
    /** Completion as a 0..1 fraction. */
    value: number;
}

export function ProgressBar({ value }: ProgressBarProps) {
    const percent = Math.round(value * 100);
    return (
        <div role="status" aria-label={`Uploading, ${percent}% complete`}>
            <div className="mb-2 h-2 overflow-hidden rounded-full bg-edge">
                <div
                    className="h-full bg-brand transition-[width] duration-150 ease-out"
                    style={{ width: `${percent}%` }}
                />
            </div>
            <p>Uploading… {percent}%</p>
        </div>
    );
}

export function ProgressBarWithTimeout({
    timeout,
    direction,
}: {
    timeout: number;
    direction: "forward" | "backward";
}) {
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        const startTime = Date.now();

        if (timeout <= 0) {
            return;
        }

        const interval = setInterval(() => {
            setElapsed(Date.now() - startTime);
        }, 100);
        return () => clearInterval(interval);
    }, [timeout]);

    const progress = timeout <= 0 ? 1 : Math.min(elapsed / timeout, 1);
    const value = direction === "forward" ? progress : 1 - progress;

    return (
        <div className="h-2 overflow-hidden rounded-full bg-edge">
            <div
                className="h-full bg-brand-edge transition-[width] duration-150 ease-out"
                style={{ width: `${value * 100}%` }}
            />
        </div>
    );
}
