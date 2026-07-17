import { Metadata } from "next";
import dynamic from "next/dynamic";
import { EditorHeader } from "@/components/editor/EditorHeader";

export const metadata: Metadata = { title: "Cabinet Editor — CabinetFlow AI" };

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
      <EditorHeader projectId={params.id} />
      <div className="flex-1 overflow-hidden">
        <CabinetEditor projectId={params.id} />
      </div>
    </div>
  );
}
