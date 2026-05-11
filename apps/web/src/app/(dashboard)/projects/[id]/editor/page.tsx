import { Metadata } from "next";
import dynamic from "next/dynamic";

export const metadata: Metadata = { title: "Cabinet Editor — WoodCraft OS" };

// Three.js canvas must be loaded client-side only
const CabinetEditor = dynamic(() => import("@/components/editor/CabinetEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-surface text-gray-500 text-sm">
      Loading editor…
    </div>
  ),
});

export default function EditorPage({ params }: { params: { id: string } }) {
  return (
    <div className="h-screen flex flex-col bg-surface">
      {/* Top bar */}
      <header className="h-12 flex-shrink-0 bg-surface-50 border-b border-surface-200 flex items-center px-4 gap-4">
        <span className="text-sm text-gray-300 font-medium">Cabinet Editor</span>
        <span className="text-gray-600 text-xs">Project: {params.id}</span>
        <div className="flex-1" />
        <button className="text-sm bg-surface-200 hover:bg-surface-300 text-gray-200 px-3 py-1.5 rounded-md transition-colors">
          Validate with AI
        </button>
        <button className="text-sm bg-brand-500 hover:bg-brand-600 text-white px-3 py-1.5 rounded-md transition-colors">
          Export CNC
        </button>
      </header>

      {/* Editor canvas */}
      <div className="flex-1 overflow-hidden">
        <CabinetEditor projectId={params.id} />
      </div>
    </div>
  );
}
