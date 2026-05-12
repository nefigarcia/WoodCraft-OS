"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

interface Member {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  lastLoginAt: string | null;
  createdAt: string;
}

const ROLES = ["admin", "designer", "viewer"] as const;
const ROLE_BADGE: Record<string, string> = {
  owner: "text-brand-400 bg-brand-900/20",
  admin: "text-purple-400 bg-purple-900/20",
  designer: "text-blue-400 bg-blue-900/20",
  viewer: "text-gray-400 bg-gray-900/20",
};

export default function TeamPage() {
  const currentUser = useAuthStore((s) => s.user);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [form, setForm] = useState({ email: "", firstName: "", lastName: "", role: "designer" as typeof ROLES[number], temporaryPassword: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const canManage = currentUser?.role === "owner" || currentUser?.role === "admin";

  useEffect(() => {
    apiClient.get<Member[]>("/team")
      .then(setMembers)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const member = await apiClient.post<Member>("/team", form);
      setMembers((p) => [...p, member]);
      setShowInvite(false);
      setForm({ email: "", firstName: "", lastName: "", role: "designer", temporaryPassword: "" });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setSaving(false);
    }
  }

  async function changeRole(userId: string, role: string) {
    try {
      const updated = await apiClient.patch<Member>(`/team/${userId}`, { role });
      setMembers((p) => p.map((m) => m.id === userId ? { ...m, role: updated.role } : m));
    } catch (err) { console.error(err); }
  }

  async function removeMember(userId: string, name: string) {
    if (!confirm(`Remove ${name} from the team?`)) return;
    try {
      await apiClient.delete(`/team/${userId}`);
      setMembers((p) => p.filter((m) => m.id !== userId));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to remove member");
    }
  }

  function f(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [field]: e.target.value }));
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/settings" className="text-gray-500 hover:text-gray-300 text-sm">← Settings</Link>
          <h1 className="text-2xl font-bold text-white mt-1">Team</h1>
          <p className="text-gray-400 text-sm mt-0.5">{members.length} member{members.length !== 1 ? "s" : ""}</p>
        </div>
        {canManage && (
          <button onClick={() => setShowInvite(!showInvite)} className="bg-brand-500 hover:bg-brand-600 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            + Add Member
          </button>
        )}
      </div>

      {showInvite && (
        <form onSubmit={handleInvite} className="bg-surface-50 border border-surface-200 rounded-xl p-5 mb-6 space-y-3">
          <h3 className="text-white font-medium text-sm">Add Team Member</h3>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1">First name *</label>
              <input required value={form.firstName} onChange={f("firstName")} className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1">Last name *</label>
              <input required value={form.lastName} onChange={f("lastName")} className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-400 mb-1">Email *</label>
              <input type="email" required value={form.email} onChange={f("email")} className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
            </div>
            <div className="w-36">
              <label className="block text-xs text-gray-400 mb-1">Role</label>
              <select value={form.role} onChange={f("role")} className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500">
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Temporary password * <span className="text-gray-600">(min 8 chars — member should change on first login)</span></label>
            <input type="password" required minLength={8} value={form.temporaryPassword} onChange={f("temporaryPassword")} className="w-full bg-surface-100 border border-surface-300 rounded-md px-2 py-1.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowInvite(false)} className="text-sm text-gray-400 px-3 py-1.5">Cancel</button>
            <button type="submit" disabled={saving} className="text-sm bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white px-4 py-1.5 rounded-md transition-colors">
              {saving ? "Adding…" : "Add Member"}
            </button>
          </div>
        </form>
      )}

      {loading ? <p className="text-gray-400 text-sm">Loading…</p> : (
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.id} className="bg-surface-50 border border-surface-200 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-surface-200 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                  {m.firstName[0]}{m.lastName[0]}
                </div>
                <div>
                  <p className="text-white font-medium text-sm">{m.firstName} {m.lastName}</p>
                  <p className="text-gray-500 text-xs">{m.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${ROLE_BADGE[m.role] ?? "text-gray-400"}`}>{m.role}</span>
                {canManage && m.id !== currentUser?.id && m.role !== "owner" && (
                  <div className="flex items-center gap-2">
                    <select
                      value={m.role}
                      onChange={(e) => void changeRole(m.id, e.target.value)}
                      className="bg-surface-100 border border-surface-300 rounded px-1.5 py-1 text-white text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <button
                      onClick={() => void removeMember(m.id, `${m.firstName} ${m.lastName}`)}
                      className="text-gray-600 hover:text-red-400 text-xs transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
