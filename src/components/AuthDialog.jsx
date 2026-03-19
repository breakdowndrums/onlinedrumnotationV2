import React from "react";

export default function AuthDialog({
  isOpen,
  emailInputRef,
  email,
  onEmailChange,
  onCancel,
  onSubmit,
  pending,
  error,
  message,
}) {
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 z-[150] bg-black/60 p-4 flex items-center justify-center"
      onMouseDown={onCancel}
    >
      <div
        className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-4 md:p-5"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold">Sign In</h3>
        <p className="mt-2 text-sm text-neutral-300">
          Send a magic link to your email. Cloud library sync will use this account later.
        </p>
        <label className="mt-4 flex flex-col gap-1 text-sm text-neutral-300">
          <span>Email</span>
          <input
            ref={emailInputRef}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
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
            placeholder="you@example.com"
          />
        </label>
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
            {pending ? "Sending…" : "Send magic link"}
          </button>
        </div>
      </div>
    </div>
  );
}
