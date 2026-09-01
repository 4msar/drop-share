import { useState } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { fetchArtifactListing } from "../lib/artifact";
import { hashPassword } from "../lib/hash";
import { saveToken } from "../lib/tokens";
import { useArtifactActions, useArtifactState } from "../contexts/useArtifact";

interface UnlockDialogProps {
    onClose: () => void;
}

/**
 * Prompts for the artifact's password, re-derives the token from it, and
 * verifies it against the listing endpoint before granting modify access -
 * there's no dedicated unlock endpoint, so verification piggybacks on the
 * existing read path. Owns its own form state; only mounted while the
 * dialog is open.
 */
export function UnlockDialog({ onClose }: UnlockDialogProps) {
    const { id: artifactId, subPath } = useArtifactState();
    const { tokenObtained, reportError } = useArtifactActions();
    const [password, setPassword] = useState("");
    const [unlocking, setUnlocking] = useState(false);

    async function handleSubmit() {
        if (password === "") {
            reportError("A password is required to unlock this artifact.");
            return;
        }
        setUnlocking(true);
        reportError(null);
        try {
            const candidateToken = await hashPassword(artifactId, password);
            const listing = await fetchArtifactListing(
                artifactId,
                subPath,
                candidateToken,
            );
            if (!listing.canModify) {
                reportError("Incorrect password.");
                return;
            }
            saveToken(artifactId, candidateToken);
            tokenObtained(candidateToken);
            onClose();
        } catch (error) {
            reportError(
                error instanceof Error
                    ? error.message
                    : "Failed to unlock artifact.",
            );
        } finally {
            setUnlocking(false);
        }
    }

    return (
        <Modal
            onSubmit={(event) => {
                event.preventDefault();
                void handleSubmit();
            }}
        >
            <h2 className="mb-2 text-sm font-medium text-heading">
                Unlock this artifact
            </h2>
            <p className="mb-3 text-xs text-body">
                Enter the password this artifact was locked with to make
                changes.
            </p>
            <label
                htmlFor="unlock-password"
                className="mb-1 block text-xs text-body"
            >
                Password
            </label>
            <input
                id="unlock-password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter the password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
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
                    disabled={unlocking}
                >
                    {unlocking ? "Unlocking…" : "Unlock artifact"}
                </Button>
            </div>
        </Modal>
    );
}
