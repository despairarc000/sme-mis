"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ManagedRole = "Owner" | "Manager" | "Staff";
type ManagedStaff = {
  staff_account_id: number;
  sme_id: number;
  role: ManagedRole;
  full_name: string;
  status: "Active" | "Inactive";
  auth_user_id: string;
  email: string;
};

type Draft = {
  full_name: string;
  role: "Manager" | "Staff";
};

export default function StaffManagement() {
  const [rows, setRows] = useState<ManagedStaff[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"Manager" | "Staff">("Staff");
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setError("");
    const supabase = createClient();
    const { data, error: functionError } = await supabase.functions.invoke("staff-management", {
      body: { action: "list" },
    });
    if (functionError) {
      setError(functionError.message);
      return;
    }

    const nextRows = (data?.staff ?? []) as ManagedStaff[];
    setRows(nextRows);
    setDrafts(
      Object.fromEntries(
        nextRows
          .filter((row) => row.role !== "Owner")
          .map((row) => [
            row.staff_account_id,
            { full_name: row.full_name, role: row.role as "Manager" | "Staff" },
          ]),
      ),
    );
  }

  useEffect(() => {
    void load();
  }, []);

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    const supabase = createClient();
    const { data, error: functionError } = await supabase.functions.invoke("staff-management", {
      body: {
        action: "invite",
        email: email.trim(),
        full_name: fullName.trim(),
        role,
      },
    });

    if (functionError) {
      setError(functionError.message);
    } else {
      setMessage(data?.message || "Invitation sent.");
      setEmail("");
      setFullName("");
      setRole("Staff");
      await load();
    }

    setBusy(false);
  }

  async function updateStaff(staffId: number, updates: Record<string, string>) {
    setBusyId(staffId);
    setError("");
    setMessage("");

    const supabase = createClient();
    const { data, error: functionError } = await supabase.functions.invoke("staff-management", {
      body: { action: "update", staff_account_id: staffId, ...updates },
    });

    if (functionError) {
      setError(functionError.message);
    } else {
      setMessage(data?.message || "Staff account updated.");
      await load();
    }

    setBusyId(null);
  }

  return (
    <>
      <div className="hero-row">
        <div>
          <p className="eyebrow">ACCOUNT ADMINISTRATION</p>
          <h1>Staff Management</h1>
          <p className="muted">Owner-only management of Manager and Staff accounts for this SME.</p>
        </div>
      </div>

      <section className="panel form-panel">
        <div className="panel-head">
          <div>
            <h2>Invite staff</h2>
            <p>The user receives a Supabase invitation email and finishes account setup there.</p>
          </div>
        </div>

        <form className="form-stack" onSubmit={invite}>
          <div className="form-grid">
            <label>
              <span>Email</span>
              <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="staff@example.com" />
            </label>
            <label>
              <span>Full name</span>
              <input required value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Staff member name" />
            </label>
            <label>
              <span>Role</span>
              <select value={role} onChange={(event) => setRole(event.target.value as "Manager" | "Staff")}>
                <option>Staff</option>
                <option>Manager</option>
              </select>
            </label>
          </div>
          {error && <div className="error-banner">{error}</div>}
          {message && <div className="success-banner">{message}</div>}
          <button className="primary" disabled={busy}>{busy ? "Sending invitation…" : "Invite staff member"}</button>
        </form>
      </section>

      <section className="panel table-panel">
        <div className="panel-head">
          <div>
            <h2>Accounts</h2>
            <p>Owner is protected. Manager and Staff can be edited or deactivated.</p>
          </div>
        </div>

        {rows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const owner = row.role === "Owner";
                  const draft = drafts[row.staff_account_id];

                  return (
                    <tr key={row.staff_account_id}>
                      <td>
                        <input
                          className="staff-inline-input"
                          disabled={owner}
                          value={owner ? row.full_name : draft?.full_name ?? ""}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [row.staff_account_id]: {
                                ...(current[row.staff_account_id] ?? { role: "Staff" }),
                                full_name: event.target.value,
                              },
                            }))
                          }
                        />
                      </td>
                      <td>{row.email || "—"}</td>
                      <td>
                        {owner ? (
                          <span className="role-badge">Owner</span>
                        ) : (
                          <select
                            className="staff-inline-select"
                            value={draft?.role ?? row.role}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [row.staff_account_id]: {
                                  ...(current[row.staff_account_id] ?? { full_name: row.full_name }),
                                  role: event.target.value as "Manager" | "Staff",
                                },
                              }))
                            }
                          >
                            <option>Staff</option>
                            <option>Manager</option>
                          </select>
                        )}
                      </td>
                      <td>
                        <span className={row.status === "Active" ? "status in-stock" : "status out-of-stock"}>{row.status}</span>
                      </td>
                      <td>
                        {owner ? (
                          <small>Protected</small>
                        ) : (
                          <div className="table-actions">
                            <button className="text-button" onClick={() => void updateStaff(row.staff_account_id, {
                              full_name: (draft?.full_name ?? row.full_name).trim(),
                              role: draft?.role ?? row.role,
                            })} disabled={busyId === row.staff_account_id}>
                              {busyId === row.staff_account_id ? "Saving…" : "Save"}
                            </button>
                            <button className="danger-text" onClick={() => void updateStaff(row.staff_account_id, {
                              status: row.status === "Active" ? "Inactive" : "Active",
                            })} disabled={busyId === row.staff_account_id}>
                              {row.status === "Active" ? "Deactivate" : "Reactivate"}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState />
        )}
      </section>
    </>
  );
}

function EmptyState() {
  return <div className="empty-state">No staff accounts have been added yet.</div>;
}
