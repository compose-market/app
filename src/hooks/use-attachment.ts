/**
 * Shared file attachment hook
 * 
 * Handles file selection, preview generation, and Pinata upload.
 */
import { useState, useRef, useCallback } from "react";
import { uploadConversationFile, fileToDataUrl, cleanupConversationFiles } from "@/lib/pinata";

export interface AttachedFile {
    file: File;
    cid?: string;
    url?: string;
    preview?: string;
    uploading: boolean;
    type: "image" | "audio";
}

export interface UseFileAttachmentOptions {
    /** Conversation ID for Pinata grouping */
    conversationId?: string;
    /** Called when upload fails */
    onError?: (error: string) => void;
    /** Max files allowed (default: 1) */
    maxFiles?: number;
}

export interface UseFileAttachmentReturn {
    attachedFiles: AttachedFile[];
    fileInputRef: React.RefObject<HTMLInputElement | null>;
    /** Handle file input change event */
    handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
    /** Remove a specific file */
    handleRemoveFile: (file: File) => void;
    /** Clear all files */
    clearFiles: () => void;
    /** Cleanup uploaded files from Pinata */
    cleanupFiles: () => Promise<void>;
    /** Whether any file is currently uploading */
    isUploading: boolean;
    /** List of uploaded CIDs for cleanup */
    uploadedCids: string[];
}

export function useFileAttachment(options: UseFileAttachmentOptions = {}): UseFileAttachmentReturn {
    const {
        conversationId: providedId,
        onError,
        maxFiles = 1,
    } = options;

    const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
    const [uploadedCids, setUploadedCids] = useState<string[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Stable conversationId - capture on first render only
    // This prevents hook reset when caller passes `Date.now()` inline
    const conversationIdRef = useRef(providedId ?? `conv-${Date.now()}`);

    const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;

        const file = e.target.files[0];
        const type: "image" | "audio" = file.type.startsWith("image/") ? "image" : "audio";

        try {
            // Generate preview
            const preview = await fileToDataUrl(file);

            const newFile: AttachedFile = {
                file,
                preview,
                uploading: true,
                type,
            };

            // Replace existing files if at max, otherwise add
            if (maxFiles === 1) {
                setAttachedFiles([newFile]);
            } else {
                setAttachedFiles(prev =>
                    prev.length >= maxFiles
                        ? [...prev.slice(1), newFile]
                        : [...prev, newFile]
                );
            }

            // Upload to Pinata
            const { cid, url } = await uploadConversationFile(file, conversationIdRef.current);

            setAttachedFiles(prev =>
                prev.map(f => f.file === file ? { ...f, cid, url, uploading: false } : f)
            );
            setUploadedCids(prev => [...prev, cid]);

        } catch (err) {
            console.error("File upload failed:", err);
            setAttachedFiles(prev => prev.filter(f => f.file !== file));
            onError?.("Failed to upload file");
        }

        // Reset input so same file can be selected again
        e.target.value = "";
    }, [maxFiles, onError]);

    const handleRemoveFile = useCallback((file: File) => {
        setAttachedFiles(prev => prev.filter(f => f.file !== file));
    }, []);

    const clearFiles = useCallback(() => {
        setAttachedFiles([]);
        // Reset file input so the same file can be selected again
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    }, []);

    const cleanupFiles = useCallback(async () => {
        if (uploadedCids.length > 0) {
            await cleanupConversationFiles(uploadedCids);
            setUploadedCids([]);
        }
    }, [uploadedCids]);

    const isUploading = attachedFiles.some(f => f.uploading);

    return {
        attachedFiles,
        fileInputRef,
        handleFileSelect,
        handleRemoveFile,
        clearFiles,
        cleanupFiles,
        isUploading,
        uploadedCids,
    };
}
