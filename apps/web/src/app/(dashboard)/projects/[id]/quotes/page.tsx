"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiClient } from "@/lib/api";

interface Quote {
  id: string;
  status: string;
  subtotal: number;
  taxAmount: number;
  total: number;
  taxRate: number;
  notes: string | null;
  validUntil: string | null;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string };
}

const STATUS_COLORS: Record<string, string> = {
  draft: "text-gray-400",
  sent: "text-yellow-400",
  accepted: "text-green-400",
  rejected: "text-red-400",
  expired: "text-gray-500",
};

export default function QuotesPage() {
  const { id } = useParams<{ id: string }>();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get<{ data: Quote[] }>(`/projects/${id}/quotes`)
      .then((r) => setQuotes(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  async function updateStatus(quoteId: string, status: string) {
    try {
      const updated = await apiClient.patch<Quote>(`/projects/${id}/quotes/${quoteId}`, { status });
      setQuotes((prev) => prev.map((q) => (q.id === quoteId ? updated : q)));
    } catch (err) { console.error(err); }
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link href={`/projects/${id}`} className="text-gray-500 hover:text-gray-300 text-sm">← Project</Link>
          <h1 className="text-2xl font-bold text-white mt-1">Quotes</h1>
        </div>
        <Link
          href={`/projects/${id}/quotes/new`}
          className="text-sm bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg transition-colors"
        >
          + New Quote
        </Link>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : quotes.length === 0 ? (
        <div className="bg-surface-50 border border-surface-200 rounded-xl p-10 text-center">
          <p className="text-gray-500 text-sm">No quotes yet.</p>
          <p className="text-gray-600 text-xs mt-1">
            Generate one from the{" "}
            <Link href={`/projects/${id}/cutlist`} className="text-brand-400 hover:underline">cut list</Link>.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {quotes.map((q) => (
            <div key={q.id} className="bg-surface-50 border border-surface-200 rounded-xl p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-white font-semibold tabular-nums text-lg">
                      ${Number(q.total).toFixed(2)}
                    </span>
                    <span className={`text-xs capitalize ${STATUS_COLORS[q.status] ?? "text-gray-400"}`}>
                      {q.status}
                    </span>
                  </div>
                  <p className="text-gray-400 text-xs">
                    Subtotal ${Number(q.subtotal).toFixed(2)} + Tax ${Number(q.taxAmount).toFixed(2)}
                    {q.validUntil && ` · Valid until ${new Date(q.validUntil).toLocaleDateString()}`}
                  </p>
                  <p className="text-gray-500 text-xs mt-0.5">
                    Created {new Date(q.createdAt).toLocaleDateString()} by {q.user.firstName} {q.user.lastName}
                  </p>
                  {q.notes && <p className="text-gray-500 text-xs mt-1 italic">"{q.notes}"</p>}
                </div>
                <div className="flex gap-2 ml-4">
                  {q.status === "draft" && (
                    <button
                      onClick={() => void updateStatus(q.id, "sent")}
                      className="text-xs bg-surface-100 hover:bg-surface-200 text-gray-200 px-3 py-1.5 rounded-md transition-colors"
                    >
                      Mark Sent
                    </button>
                  )}
                  {q.status === "sent" && (
                    <>
                      <button
                        onClick={() => void updateStatus(q.id, "accepted")}
                        className="text-xs bg-green-900/40 hover:bg-green-900/60 text-green-400 px-3 py-1.5 rounded-md transition-colors"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => void updateStatus(q.id, "rejected")}
                        className="text-xs bg-red-900/30 hover:bg-red-900/50 text-red-400 px-3 py-1.5 rounded-md transition-colors"
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
