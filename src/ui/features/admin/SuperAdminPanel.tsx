import { useCallback, useEffect, useMemo, useState } from "react";

type Overview = { users: number; organizations: number; activeMemberships: number; channels: number };
type AdminUser = any;
type AdminOrganization = any;
type AdminMembership = any;
type AdminChannel = any;
type AdminChannelShare = any;

type TabKey = "users" | "organizations" | "memberships" | "channels" | "shares";

const PROVIDERS = ["whatsapp", "telegram", "discord", "slack", "wechat", "email", "gmail", "custom"];
const USER_ROLES = ["super_admin", "organization_admin", "user"];
const MEMBERSHIP_ROLES = ["owner", "admin", "member"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputClass = "h-9 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-ink-900 focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]";
const smallButtonClass = "rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-[var(--color-sidebar-hover)] disabled:cursor-not-allowed disabled:opacity-50";
const primaryButtonClass = "rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40";

const getError = (result: { success: boolean; error?: string }, fallback: string) => result.success ? null : (result.error || fallback);

export function SuperAdminPanel({ onClose }: { onClose: () => void }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [organizations, setOrganizations] = useState<AdminOrganization[]>([]);
  const [memberships, setMemberships] = useState<AdminMembership[]>([]);
  const [channels, setChannels] = useState<AdminChannel[]>([]);
  const [channelShares, setChannelShares] = useState<AdminChannelShare[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("users");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [newOrganizationName, setNewOrganizationName] = useState("");
  const [membershipForm, setMembershipForm] = useState({ userId: "", organizationId: "", role: "member", isActive: true });
  const [channelForm, setChannelForm] = useState({
    organizationId: "",
    createdByUserId: "",
    provider: "custom",
    name: "",
    externalId: "",
    config: "{}",
    credentials: "{}",
    isActive: true,
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [overviewResult, usersResult, orgsResult, membershipsResult, channelsResult, sharesResult] = await Promise.all([
        window.electron.apiAdminOverview(),
        window.electron.apiAdminListUsers(),
        window.electron.apiAdminListOrganizations(),
        window.electron.apiAdminListMemberships(),
        window.electron.apiAdminListChannels(),
        window.electron.apiAdminListChannelShares(),
      ]);

      const error = getError(overviewResult, "Failed to load overview")
        || getError(usersResult, "Failed to load users")
        || getError(orgsResult, "Failed to load organizations")
        || getError(membershipsResult, "Failed to load memberships")
        || getError(channelsResult, "Failed to load channels")
        || getError(sharesResult, "Failed to load channel shares");
      if (error) {
        setMessage(error);
        return;
      }

      setOverview(overviewResult.overview ?? null);
      setUsers(usersResult.users ?? []);
      setOrganizations(orgsResult.organizations ?? []);
      setMemberships(membershipsResult.memberships ?? []);
      setChannels(channelsResult.channels ?? []);
      setChannelShares(sharesResult.channelShares ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const organizationById = useMemo(() => new Map(organizations.map((org) => [org.id, org])), [organizations]);
  const userById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);

  const run = async (action: () => Promise<{ success: boolean; error?: string }>, successMessage: string) => {
    setSaving(true);
    setMessage(null);
    try {
      const result = await action();
      if (!result.success) {
        setMessage(result.error || "Admin action failed");
        return;
      }
      setMessage(successMessage);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Admin action failed");
    } finally {
      setSaving(false);
    }
  };

  const parseJson = (value: string, label: string) => {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    try {
      return JSON.parse(trimmed);
    } catch {
      throw new Error(`${label} must be valid JSON`);
    }
  };

  const createOrganization = async () => {
    const name = newOrganizationName.trim();
    if (!name) {
      setMessage("Organization name is required");
      return;
    }
    await run(async () => window.electron.apiAdminCreateOrganization({ name, isActive: true }), "Organization created");
    setNewOrganizationName("");
  };

  const upsertMembership = async () => {
    if (!membershipForm.userId || !membershipForm.organizationId) {
      setMessage("Select a user and organization");
      return;
    }
    await run(async () => window.electron.apiAdminUpsertMembership(membershipForm), "Membership saved");
  };

  const createChannel = async () => {
    if (!channelForm.organizationId || !channelForm.createdByUserId || !channelForm.name.trim()) {
      setMessage("Organization, owner user, and channel name are required");
      return;
    }
    try {
      const config = parseJson(channelForm.config, "Config");
      const credentials = parseJson(channelForm.credentials, "Credentials");
      await run(
        async () => window.electron.apiAdminCreateChannel({
          organizationId: channelForm.organizationId,
          createdByUserId: channelForm.createdByUserId,
          provider: channelForm.provider,
          name: channelForm.name.trim(),
          externalId: channelForm.externalId.trim() || undefined,
          config,
          credentials,
          isActive: channelForm.isActive,
        }),
        "Channel created",
      );
      setChannelForm((prev) => ({ ...prev, name: "", externalId: "", config: "{}", credentials: "{}" }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invalid channel form");
    }
  };

  return (
    <InnerPageLayout
      title="Super-admin management"
      description="Global users, organizations, memberships, channels, and channel shares."
      onClose={onClose}
      actions={<button onClick={refresh} disabled={loading || saving} className={smallButtonClass}>{loading ? "Refreshing..." : "Refresh"}</button>}
      contentWidthClassName="max-w-7xl"
    >
        {overview ? (
          <div className="mb-4 grid gap-3 md:grid-cols-4">
            {[
              ["Users", overview.users],
              ["Organizations", overview.organizations],
              ["Active memberships", overview.activeMemberships],
              ["Channels", overview.channels],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
                <p className="mt-1 text-2xl font-semibold text-ink-900">{value}</p>
              </div>
            ))}
          </div>
        ) : null}

        {message ? (
          <div className={`mb-4 rounded-lg border px-3 py-2 text-sm ${message.includes("failed") || message.includes("required") || message.includes("Invalid") || message.includes("must") ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-700"}`}>
            {message}
          </div>
        ) : null}

        <div className="mb-4 flex flex-wrap gap-2">
          {([
            ["users", "Users"],
            ["organizations", "Organizations"],
            ["memberships", "Memberships"],
            ["channels", "Channels"],
            ["shares", "Channel shares"],
          ] as Array<[TabKey, string]>).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${activeTab === key ? "bg-[var(--color-accent)] text-white" : "border border-[var(--color-border)] bg-[var(--color-surface)] text-ink-700 hover:bg-[var(--color-surface-secondary)]"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === "users" ? (
          <div className="space-y-3">
            {users.map((user) => (
              <div key={user.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
                <div className="grid gap-3 md:grid-cols-[1.5fr_1fr_1fr_auto] md:items-end">
                  <div>
                    <p className="font-medium text-ink-900">{user.email}</p>
                    <p className="mt-1 text-xs text-muted">{user.id}</p>
                    <p className="mt-1 text-xs text-muted">{[user.firstName, user.lastName].filter(Boolean).join(" ") || "No name"}</p>
                  </div>
                  <Field label="Global role">
                    <select defaultValue={user.role} className={inputClass} onChange={(event) => run(() => window.electron.apiAdminUpdateUser(user.id, { role: event.target.value }), "User role updated")}>
                      {USER_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                    </select>
                  </Field>
                  <Field label="Active">
                    <select defaultValue={String(user.isActive)} className={inputClass} onChange={(event) => run(() => window.electron.apiAdminUpdateUser(user.id, { isActive: event.target.value === "true" }), "User status updated")}>
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                  </Field>
                  <span className="text-xs text-muted">{user.memberships?.length ?? 0} memberships</span>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {activeTab === "organizations" ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
              <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                <Field label="New organization name"><input value={newOrganizationName} onChange={(event) => setNewOrganizationName(event.target.value)} className={inputClass} /></Field>
                <button onClick={createOrganization} disabled={saving} className={primaryButtonClass}>Create organization</button>
              </div>
            </div>
            {organizations.map((org) => (
              <div key={org.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
                <div className="grid gap-3 md:grid-cols-[1fr_160px_auto] md:items-end">
                  <Field label="Name"><input defaultValue={org.name} className={inputClass} onBlur={(event) => event.target.value.trim() !== org.name ? run(() => window.electron.apiAdminUpdateOrganization(org.id, { name: event.target.value.trim() }), "Organization updated") : undefined} /></Field>
                  <Field label="Active">
                    <select defaultValue={String(org.isActive)} className={inputClass} onChange={(event) => run(() => window.electron.apiAdminUpdateOrganization(org.id, { isActive: event.target.value === "true" }), "Organization status updated")}>
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                  </Field>
                  <span className="text-xs text-muted">{org.members?.length ?? 0} members · {org.id}</span>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {activeTab === "memberships" ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
              <div className="grid gap-3 md:grid-cols-5 md:items-end">
                <Field label="User"><select value={membershipForm.userId} onChange={(event) => setMembershipForm((prev) => ({ ...prev, userId: event.target.value }))} className={inputClass}><option value="">Select user</option>{users.map((user) => <option key={user.id} value={user.id}>{user.email}</option>)}</select></Field>
                <Field label="Organization"><select value={membershipForm.organizationId} onChange={(event) => setMembershipForm((prev) => ({ ...prev, organizationId: event.target.value }))} className={inputClass}><option value="">Select org</option>{organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select></Field>
                <Field label="Role"><select value={membershipForm.role} onChange={(event) => setMembershipForm((prev) => ({ ...prev, role: event.target.value }))} className={inputClass}>{MEMBERSHIP_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}</select></Field>
                <Field label="Active"><select value={String(membershipForm.isActive)} onChange={(event) => setMembershipForm((prev) => ({ ...prev, isActive: event.target.value === "true" }))} className={inputClass}><option value="true">Active</option><option value="false">Inactive</option></select></Field>
                <button onClick={upsertMembership} disabled={saving} className={primaryButtonClass}>Save assignment</button>
              </div>
            </div>
            {memberships.map((membership) => (
              <div key={membership.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
                <div className="grid gap-3 md:grid-cols-[1fr_1fr_140px_140px] md:items-end">
                  <div><p className="font-medium text-ink-900">{membership.user?.email ?? userById.get(membership.userId)?.email ?? membership.userId}</p><p className="text-xs text-muted">{membership.id}</p></div>
                  <div><p className="font-medium text-ink-900">{membership.organization?.name ?? organizationById.get(membership.organizationId)?.name ?? membership.organizationId}</p><p className="text-xs text-muted">{membership.organizationId}</p></div>
                  <Field label="Role"><select defaultValue={membership.role} className={inputClass} onChange={(event) => run(() => window.electron.apiAdminUpdateMembership(membership.id, { role: event.target.value }), "Membership role updated")}>{MEMBERSHIP_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}</select></Field>
                  <Field label="Active"><select defaultValue={String(membership.isActive)} className={inputClass} onChange={(event) => run(() => window.electron.apiAdminUpdateMembership(membership.id, { isActive: event.target.value === "true" }), "Membership status updated")}><option value="true">Active</option><option value="false">Inactive</option></select></Field>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {activeTab === "channels" ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Organization"><select value={channelForm.organizationId} onChange={(event) => setChannelForm((prev) => ({ ...prev, organizationId: event.target.value }))} className={inputClass}><option value="">Select org</option>{organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select></Field>
                <Field label="Owner user"><select value={channelForm.createdByUserId} onChange={(event) => setChannelForm((prev) => ({ ...prev, createdByUserId: event.target.value }))} className={inputClass}><option value="">Select user</option>{users.map((user) => <option key={user.id} value={user.id}>{user.email}</option>)}</select></Field>
                <Field label="Provider"><select value={channelForm.provider} onChange={(event) => setChannelForm((prev) => ({ ...prev, provider: event.target.value }))} className={inputClass}>{PROVIDERS.map((provider) => <option key={provider} value={provider}>{provider}</option>)}</select></Field>
                <Field label="Name"><input value={channelForm.name} onChange={(event) => setChannelForm((prev) => ({ ...prev, name: event.target.value }))} className={inputClass} /></Field>
                <Field label="External ID"><input value={channelForm.externalId} onChange={(event) => setChannelForm((prev) => ({ ...prev, externalId: event.target.value }))} className={inputClass} /></Field>
                <Field label="Active"><select value={String(channelForm.isActive)} onChange={(event) => setChannelForm((prev) => ({ ...prev, isActive: event.target.value === "true" }))} className={inputClass}><option value="true">Active</option><option value="false">Inactive</option></select></Field>
                <Field label="Config JSON"><textarea value={channelForm.config} onChange={(event) => setChannelForm((prev) => ({ ...prev, config: event.target.value }))} rows={3} className={`${inputClass} h-auto font-mono text-xs`} /></Field>
                <Field label="Credentials JSON"><textarea value={channelForm.credentials} onChange={(event) => setChannelForm((prev) => ({ ...prev, credentials: event.target.value }))} rows={3} className={`${inputClass} h-auto font-mono text-xs`} /></Field>
                <div className="flex items-end"><button onClick={createChannel} disabled={saving} className={primaryButtonClass}>Create channel</button></div>
              </div>
            </div>
            {channels.map((channel) => (
              <div key={channel.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
                <div className="grid gap-3 md:grid-cols-[1fr_120px_120px_120px_auto] md:items-end">
                  <div><p className="font-medium text-ink-900">{channel.name}</p><p className="text-xs text-muted">{channel.provider} · {channel.organizationName ?? organizationById.get(channel.organizationId)?.name ?? channel.organizationId}</p><p className="text-xs text-muted">Owner: {channel.createdByUserEmail ?? userById.get(channel.createdByUserId)?.email ?? channel.createdByUserId}</p></div>
                  <Field label="Provider"><select defaultValue={channel.provider} className={inputClass} onChange={(event) => run(() => window.electron.apiAdminUpdateChannel(channel.id, { provider: event.target.value }), "Channel provider updated")}>{PROVIDERS.map((provider) => <option key={provider} value={provider}>{provider}</option>)}</select></Field>
                  <Field label="Active"><select defaultValue={String(channel.isActive)} className={inputClass} onChange={(event) => run(() => window.electron.apiAdminUpdateChannel(channel.id, { isActive: event.target.value === "true" }), "Channel status updated")}><option value="true">Active</option><option value="false">Inactive</option></select></Field>
                  <span className="text-xs text-muted">{channel.hasCredentials ? "Has credentials" : "No credentials"}</span>
                  <button onClick={() => window.confirm(`Delete channel ${channel.name}?`) ? run(() => window.electron.apiAdminDeleteChannel(channel.id), "Channel deleted") : undefined} disabled={saving} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50">Delete</button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {activeTab === "shares" ? (
          <div className="space-y-3">
            {channelShares.map((share) => (
              <div key={share.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
                <p className="font-medium text-ink-900">{share.sharedWithUserEmail ?? share.sharedWithUserId}</p>
                <p className="mt-1 text-xs text-muted">Channel: {share.channelId} · Permission: {share.permission} · {share.isActive ? "Active" : "Inactive"}</p>
                <p className="mt-1 text-xs text-muted">Shared by: {share.sharedByUserEmail ?? share.sharedByUserId}</p>
              </div>
            ))}
            {!channelShares.length ? <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-muted">No channel shares found.</p> : null}
          </div>
        ) : null}
    </InnerPageLayout>
  );
}

export default SuperAdminPanel;
import { InnerPageLayout } from "../layout/components/InnerPageLayout";
