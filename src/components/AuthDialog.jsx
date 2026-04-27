import React from "react";

export default function AuthDialog({
  isOpen,
  mode,
  onModeChange,
  signedInEmail,
  roleLabel = "",
  emailInputRef,
  email,
  onEmailChange,
  password,
  onPasswordChange,
  onCancel,
  onSubmit,
  onSignOut,
  pending,
  error,
  message,
  beatsCount = 0,
  arrangementsCount = 0,
  foldersCount = 0,
  shareQrCount = 0,
  temporaryShareCount = 0,
  cleanedShareCount = 0,
  shareLinks = [],
  onOpenShareLink = null,
  onDeleteShareLink = null,
  lastSyncAt = "",
  statsPending = false,
  shortLinksMonthUsed = 0,
  shortLinksMonthLimit = 60,
  cloudBeatLimit = 1000,
  cloudArrangementLimit = 100,
}) {
  if (!isOpen) return null;
  const isSignedIn = Boolean(String(signedInEmail || "").trim());
  const [isShareLinksModalOpen, setIsShareLinksModalOpen] = React.useState(false);
  const [shareLinksSort, setShareLinksSort] = React.useState("date");
  const isPasswordMode = mode === "sign-in" || mode === "sign-up" || mode === "new-password";
  const showEmailField = mode !== "new-password";
  const submitLabel =
    mode === "sign-up"
      ? "Sign up"
      : mode === "new-password"
        ? "Update password"
      : mode === "reset"
        ? "Send reset link"
        : mode === "magic-link"
          ? "Send link"
          : "Sign in";
  const title = isSignedIn ? "Profile" : mode === "new-password" ? "Set New Password" : "Sign In";
  const formatDateTime = React.useCallback((value) => {
    const text = String(value || "").trim();
    if (!text) return "";
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return "";
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
    } catch (_) {
      return date.toLocaleString();
    }
  }, []);
  const sortedShareLinks = React.useMemo(() => {
    const items = Array.isArray(shareLinks) ? [...shareLinks] : [];
    if (shareLinksSort === "usage") {
      return items.sort((a, b) => {
        const usageDelta = (Number(b?.accessCount) || 0) - (Number(a?.accessCount) || 0);
        if (usageDelta !== 0) return usageDelta;
        return String(b?.createdAt || "").localeCompare(String(a?.createdAt || ""));
      });
    }
    return items.sort((a, b) => String(b?.createdAt || "").localeCompare(String(a?.createdAt || "")));
  }, [shareLinks, shareLinksSort]);
  return (
    <div
      className="fixed inset-0 z-[150] bg-black/60 p-4 flex items-center justify-center"
      onMouseDown={onCancel}
    >
      <div
        className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-4 md:p-5"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold">{title}</h3>
        {isSignedIn ? (
          <>
            <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950/40 px-3.5 py-3">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex rounded border px-2 py-1 text-[11px] ${
                    roleLabel === "Admin"
                      ? "border-amber-700/60 bg-amber-950/30 text-amber-200"
                      : "border-sky-700/50 bg-sky-950/20 text-sky-200"
                  }`}
                >
                  {roleLabel || "Signed in"}
                </span>
              </div>
              <div className="mt-3 text-[11px] uppercase tracking-[0.16em] text-neutral-500">Email</div>
              <div className="mt-1 break-all text-sm text-neutral-300">{signedInEmail}</div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {[
                ["Beats", beatsCount],
                ["Arrangements", arrangementsCount],
                ["Folders", foldersCount],
                ["Share / QR", shareQrCount],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-neutral-800 bg-neutral-950/40 px-3 py-2.5">
                  <div className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">{label}</div>
                  <div className="mt-1 text-lg font-semibold text-neutral-200">{value}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950/40 px-3.5 py-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">Last sync</div>
              <div className="mt-1 text-sm text-neutral-300">
                {statsPending ? "Loading…" : lastSyncAt || "Not synced yet"}
              </div>
            </div>
            <div className="mt-3 text-xs text-neutral-500">
              {statsPending
                ? "Temporary share links: loading…"
                : `Temporary share links: ${temporaryShareCount} · Cleaned old unused links: ${cleanedShareCount}`}
            </div>
            <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950/40 px-3.5 py-3">
              <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">Cloud quotas</div>
              <div className="mt-2 grid grid-cols-1 gap-1.5 text-sm text-neutral-300">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-neutral-500">Short links this month</span>
                  <span className="tabular-nums">{`${shortLinksMonthUsed} / ${shortLinksMonthLimit}`}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-neutral-500">Beats</span>
                  <span className="tabular-nums">{`${beatsCount} / ${cloudBeatLimit}`}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-neutral-500">Arrangements</span>
                  <span className="tabular-nums">{`${arrangementsCount} / ${cloudArrangementLimit}`}</span>
                </div>
              </div>
            </div>
            <div className="mt-3 flex justify-start">
              <button
                type="button"
                onClick={() => setIsShareLinksModalOpen(true)}
                className="px-3 py-1.5 rounded border border-neutral-700 text-sm text-neutral-300 hover:bg-neutral-800/60"
              >
                Manage share links
              </button>
            </div>
            {error ? <div className="mt-3 text-sm text-red-400">{error}</div> : null}
            {message ? <div className="mt-3 text-sm text-neutral-400">{message}</div> : null}
            <div className="mt-4 flex items-center justify-end gap-2">
              {onSignOut ? (
                <button
                  type="button"
                  onClick={onSignOut}
                  disabled={pending}
                  className={`mr-auto px-3 py-1.5 rounded border text-sm ${
                    pending
                      ? "border-neutral-800 text-neutral-500 bg-neutral-900/60 cursor-not-allowed"
                      : "border-neutral-700 text-neutral-300 hover:bg-neutral-800/60"
                  }`}
                >
                  Sign out
                </button>
              ) : null}
              <button
                type="button"
                onClick={onCancel}
                className="px-3 py-1.5 rounded border border-neutral-700 text-sm text-neutral-300 hover:bg-neutral-800/60"
              >
                Close
              </button>
            </div>
          </>
        ) : (
          <>
        {mode !== "new-password" ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {[
              ["sign-in", "Sign in"],
              ["sign-up", "Sign up"],
              ["reset", "Reset"],
              ["magic-link", "Magic link"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => onModeChange(id)}
                className={`px-2.5 py-1 rounded border text-xs ${
                  mode === id
                    ? "border-neutral-700 text-white bg-neutral-800"
                    : "border-neutral-800 text-neutral-400 bg-neutral-900/60 hover:bg-neutral-800/40"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
        {showEmailField ? (
          <label className="mt-4 flex flex-col gap-1 text-sm text-neutral-300">
            <span>Email</span>
            <input
              ref={emailInputRef}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isPasswordMode) {
                  e.preventDefault();
                  onSubmit();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  onCancel();
                }
              }}
              className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white"
              placeholder="you@example.com"
            />
          </label>
        ) : null}
        {isPasswordMode ? (
          <label className="mt-3 flex flex-col gap-1 text-sm text-neutral-300">
            <span>{mode === "new-password" ? "New password" : "Password"}</span>
            <input
              type="password"
              autoComplete={mode === "sign-up" || mode === "new-password" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onSubmit();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  onCancel();
                }
              }}
              className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white"
              placeholder={mode === "sign-up" || mode === "new-password" ? "Create password" : "Password"}
            />
          </label>
        ) : null}
        {error ? <div className="mt-3 text-sm text-red-400">{error}</div> : null}
        {message ? <div className="mt-3 text-sm text-neutral-400">{message}</div> : null}
        <div className="mt-4 flex items-center justify-end gap-2">
          {isSignedIn && onSignOut ? (
            <button
              type="button"
              onClick={onSignOut}
              disabled={pending}
              className={`mr-auto px-3 py-1.5 rounded border text-sm ${
                pending
                  ? "border-neutral-800 text-neutral-500 bg-neutral-900/60 cursor-not-allowed"
                  : "border-neutral-700 text-neutral-300 hover:bg-neutral-800/60"
              }`}
            >
              Sign out
            </button>
          ) : null}
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded border border-neutral-700 text-sm text-neutral-300 hover:bg-neutral-800/60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={pending}
            className={`px-3 py-1.5 rounded border text-sm ${
              pending
                ? "border-neutral-800 text-neutral-500 bg-neutral-900/60 cursor-not-allowed"
                : "border-neutral-700 text-white bg-neutral-800 hover:bg-neutral-700/60"
            }`}
          >
            {pending ? "Sending…" : submitLabel}
          </button>
        </div>
          </>
        )}
      </div>
      {isSignedIn && isShareLinksModalOpen ? (
        <div
          className="fixed inset-0 z-[151] bg-black/60 p-4 flex items-center justify-center"
          onMouseDown={() => setIsShareLinksModalOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded-xl border border-neutral-700 bg-neutral-900 p-4 md:p-5"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-base font-semibold text-neutral-100">Share links</h4>
                <div className="mt-1 text-sm text-neutral-500">
                  Open in a new tab or remove old links from your account.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsShareLinksModalOpen(false)}
                className="px-3 py-1.5 rounded border border-neutral-700 text-sm text-neutral-300 hover:bg-neutral-800/60"
              >
                Close
              </button>
            </div>
            <div className="mt-4 flex items-center gap-2">
              {[
                ["date", "Date"],
                ["usage", "Usage"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setShareLinksSort(id)}
                  className={`px-2.5 py-1 rounded border text-xs ${
                    shareLinksSort === id
                      ? "border-neutral-700 text-white bg-neutral-800"
                      : "border-neutral-800 text-neutral-400 bg-neutral-900/60 hover:bg-neutral-800/40"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-4 max-h-[60vh] overflow-y-auto space-y-2 pr-1">
              {statsPending ? (
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 px-3 py-3 text-sm text-neutral-500">
                  Loading share links…
                </div>
              ) : sortedShareLinks.length ? (
                sortedShareLinks.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-neutral-800 bg-neutral-950/40 px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-neutral-200 truncate">{item.label}</div>
                        <div className="mt-1 text-xs text-neutral-500">
                          {item.typeLabel}
                          {item.createdAt ? ` · Created ${formatDateTime(item.createdAt)}` : ""}
                          {shareLinksSort === "usage"
                            ? ` · Uses ${Number(item.accessCount) || 0}`
                            : item.lastAccessedAt
                              ? ` · Last used ${formatDateTime(item.lastAccessedAt)}`
                              : " · Never used"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => onOpenShareLink?.(item.id)}
                          className="px-2.5 py-1 rounded border border-neutral-700 text-xs text-neutral-300 hover:bg-neutral-800/60"
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteShareLink?.(item.id)}
                          className="px-2.5 py-1 rounded border border-neutral-700 text-xs text-neutral-300 hover:bg-neutral-800/60"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 px-3 py-3 text-sm text-neutral-500">
                  No share links yet.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
