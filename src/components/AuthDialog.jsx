import React from "react";

export default function AuthDialog({
  isOpen,
  mode,
  onModeChange,
  emailInputRef,
  email,
  onEmailChange,
  password,
  onPasswordChange,
  onCancel,
  onSubmit,
  pending,
  error,
  message,
}) {
  if (!isOpen) return null;
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
  const title = mode === "new-password" ? "Set New Password" : "Sign In";
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
      </div>
    </div>
  );
}
