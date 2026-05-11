"use client";

import { useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api";
import { useEditorStore } from "@/store/editor";
import { CncExportModal } from "./CncExportModal";

interface Props {
  projectId: string;
}

export function EditorHeader({ projectId }: Props) {
  const isDirty = useEditorStore((s) => s.isDirty);
  const [showCncModal, setShowCncModal] = useState(false);
  const [savingRevision, setSavingRevision] = useState(false);
  const [revisionMsg, setRevisionMsg] = useState("");
  const [showRevisionInput, setShowRevisionInput] = useState(false);
  const [revisionSaved, setRevisionSaved] = useState(false);

  async function saveRevision() {
    setSavingRevision(true);
    try {
      await apiClient.post(`/projects/${projectId}/revisions`, {
        message: revisionMsg.trim() || undefined,
      });
      setRevisionSaved(true);
      setShowRevisionInput(false);
      setRevisionMsg("");
      setTimeout(() => setRevisionSaved(false), 2500);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingRevision(false);
    }
  }

  return (
    <>
      <header className="h-12 flex-shrink-0 bg-surface-50 border-b border-surface-200 flex items-center px-4 gap-3">
        <Link href={`/projects/${projectId}`} className="text-gray-500 hover:text-gray-300 text-xs transition-colors">
          ← Project
        </Link>

        <span className="text-gray-700">|</span>
        <span className="text-sm text-gray-300 font-medium">Cabinet Editor</span>

        {isDirty && (
          <span className="text-xs text-gray-600 italic">unsaved changes</span>
        )}

        <div className="flex-1" />

        {/* Revision save */}
        {showRevisionInput ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={revisionMsg}
              onChange={(e) => setRevisionMsg(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void saveRevision(); if (e.key === "Escape") setShowRevisionInput(false); }}
              placeholder="Revision note (optional)"
              className="text-xs bg-surface-100 border border-surface-300 rounded px-2 py-1 text-white focus:outline-none focus:ring-1 focus:ring-brand-500 w-52"
            />
            <button
              onClick={() => void saveRevision()}
              disabled={savingRevision}
              className="text-xs bg-surface-200 hover:bg-surface-300 text-gray-200 px-2.5 py-1 rounded transition-colors"
            >
              {savingRevision ? "Saving…" : "Save"}
            </button>
            <button onClick={() => setShowRevisionInput(false)} className="text-gray-500 hover:text-gray-300 text-xs">✕</button>
          </div>
        ) : (
          <button
            onClick={() => setShowRevisionInput(true)}
            className={`text-xs transition-colors px-3 py-1.5 rounded-md ${
              revisionSaved
                ? "text-green-400"
                : "text-gray-400 hover:text-white hover:bg-surface-100"
            }`}
          >
            {revisionSaved ? "✓ Saved" : "Save Revision"}
          </button>
        )}

        <Link
          href={`/projects/${projectId}/cutlist`}
          className="text-sm text-gray-400 hover:text-white hover:bg-surface-100 px-3 py-1.5 rounded-md transition-colors"
        >
          Cut List
        </Link>

        <button
          onClick={() => setShowCncModal(true)}
          className="text-sm bg-surface-200 hover:bg-surface-300 text-gray-200 px-3 py-1.5 rounded-md transition-colors"
        >
          Export CNC
        </button>

        <Link
          href={`/projects/${projectId}/quotes/new`}
          className="text-sm bg-brand-500 hover:bg-brand-600 text-white px-3 py-1.5 rounded-md transition-colors"
        >
          Quote →
        </Link>
      </header>

      {showCncModal && (
        <CncExportModal
          projectId={projectId}
          onClose={() => setShowCncModal(false)}
        />
      )}
    </>
  );
}
