import { useState } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { lockArtifact } from "../lib/artifact";
import { hashPassword } from "../lib/hash";
import { saveToken } from "../lib/tokens";
import { useArtifactActions, useArtifactState } from "../contexts/useArtifact";

interface LockDialogProps {
    onClose: () => void;
}

/**
 * Prompts for a password, derives a lock token from it, and locks the
 * artifact - then shows a one-time confirmation before closing. Owns its
 * own form state; only mounted while the dialog is open, so closing and
 * reopening it starts from a blank form for free.
 */
export function LockDialog({ onClose }: LockDialogProps) {
    const { id: artifactId } = useArtifactState();
    const { tokenObtained, reportError } = useArtifactActions();
    const [password, setPassword] = useState("");
    const [passwordConfirm, setPasswordConfirm] = useState("");
    const [locking, setLocking] = useState(false);
    const [locked, setLocked] = useState(false);

    async function handleSubmit() {
        if (password === "") {
            reportError("A password is required to lock this artifact.");
            return;
        }
        if (password !== passwordConfirm) {
            reportError("Passwords do not match.");
            return;
        }
        setLocking(true);
        reportError(null);
        try {
            const token = await hashPassword(artifactId, password);
            await lockArtifact(artifactId, token);
            saveToken(artifactId, token);
            setLocked(true);
            tokenObtained(token);
        } catch (error) {
            reportError(
                error instanceof Error
                    ? error.message
                    : "Failed to lock artifact.",
            );
        } finally {
            setLocking(false);
        }
    }

    if (locked) {
        return (
            <Modal>
                <h2 className="mb-2 text-sm font-medium text-heading">
                    Artifact locked
                </h2>
                <p className="mb-4 text-xs text-body">
                    Your password is now required to make further changes.
                    Keep it safe - it can&apos;t be recovered if forgotten.
                </p>
                <Button
                    variant="primary"
                    size="sm"
                    className="w-full"
                    onClick={onClose}
                >
                    Done
                </Button>
            </Modal>
        );
    }

    return (
        <Modal
            onSubmit={(event) => {
                event.preventDefault();
                void handleSubmit();
            }}
        >
            <h2 className="mb-2 text-sm font-medium text-heading">
                Lock this artifact
            </h2>
            <p className="mb-3 text-xs text-body">
                Choose a password needed to make future changes - it
                can&apos;t be recovered if lost.
            </p>
            <label
                htmlFor="lock-password"
                className="mb-1 block text-xs text-body"
            >
                Password
            </label>
            <input
                id="lock-password"
                type="password"
                autoComplete="new-password"
                placeholder="Enter a password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mb-3 w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-xs"
            />
            <label
                htmlFor="lock-password-confirm"
                className="mb-1 block text-xs text-body"
            >
                Confirm password
            </label>
            <input
                id="lock-password-confirm"
                type="password"
                autoComplete="new-password"
                placeholder="Confirm password"
                value={passwordConfirm}
                onChange={(event) => setPasswordConfirm(event.target.value)}
                className="mb-4 w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-xs"
            />
            <div className="flex gap-2">
                <Button
                    type="button"
                    size="sm"
                    className="flex-1"
                    onClick={onClose}
                >
                    Cancel
                </Button>
                <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    className="flex-1"
                    disabled={locking}
                >
                    {locking ? "Locking…" : "Lock artifact"}
                </Button>
            </div>
        </Modal>
    );
}
