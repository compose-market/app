/**
 * Shared audio recording hook
 * 
 * Handles MediaRecorder API for voice input with Pinata upload.
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { uploadConversationFile, fileToDataUrl } from "@/lib/pinata";

export interface AttachedFile {
    file: File;
    cid?: string;
    url?: string;
    preview?: string;
    uploading: boolean;
    type: "image" | "audio";
}

export interface UseAudioRecordingOptions {
    /** Conversation ID for Pinata grouping */
    conversationId?: string;
    /** Called when recording completes with the attached file */
    onRecordingComplete?: (file: AttachedFile) => void;
    /** Called when an error occurs */
    onError?: (error: string) => void;
}

export interface UseAudioRecordingReturn {
    isRecording: boolean;
    recordingSupported: boolean;
    startRecording: () => Promise<void>;
    stopRecording: () => void;
}

export function useAudioRecording(options: UseAudioRecordingOptions = {}): UseAudioRecordingReturn {
    const {
        conversationId = `conv-${Date.now()}`,
        onRecordingComplete,
        onError,
    } = options;

    const [isRecording, setIsRecording] = useState(false);
    const [recordingSupported, setRecordingSupported] = useState(true);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const conversationIdRef = useRef(conversationId);

    // Check if recording is supported on mount
    useEffect(() => {
        if (!navigator.mediaDevices?.getUserMedia) {
            setRecordingSupported(false);
        }
    }, []);

    const startRecording = useCallback(async () => {
        if (!recordingSupported) {
            onError?.("Audio recording not supported in this browser");
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;

            const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
            mediaRecorderRef.current = recorder;
            audioChunksRef.current = [];

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    audioChunksRef.current.push(e.data);
                }
            };

            recorder.onstop = async () => {
                // Stop all tracks
                mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
                mediaStreamRef.current = null;

                const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
                const audioFile = new File([audioBlob], `recording-${Date.now()}.webm`, { type: "audio/webm" });

                try {
                    const preview = await fileToDataUrl(audioFile);

                    const attachedFile: AttachedFile = {
                        file: audioFile,
                        preview,
                        uploading: true,
                        type: "audio",
                    };

                    // Notify with uploading state
                    onRecordingComplete?.({ ...attachedFile });

                    // Upload to Pinata
                    const { cid, url } = await uploadConversationFile(audioFile, conversationIdRef.current);

                    // Notify with completed upload
                    onRecordingComplete?.({
                        ...attachedFile,
                        cid,
                        url,
                        uploading: false,
                    });

                } catch (err) {
                    console.error("Recording upload failed:", err);
                    onError?.("Failed to upload recording");
                }
            };

            recorder.start();
            setIsRecording(true);

        } catch (err) {
            console.error("Failed to start recording:", err);
            onError?.("Failed to access microphone. Please check permissions.");
        }
    }, [recordingSupported, onRecordingComplete, onError]);

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    }, [isRecording]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (mediaStreamRef.current) {
                mediaStreamRef.current.getTracks().forEach((track) => track.stop());
            }
        };
    }, []);

    return {
        isRecording,
        recordingSupported,
        startRecording,
        stopRecording,
    };
}
