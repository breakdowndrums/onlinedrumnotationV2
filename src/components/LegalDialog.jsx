import React from "react";

export default function LegalDialog({
  isOpen,
  legalTab,
  onClose,
  onSetLegalTab,
  onImpressumPress,
  showLegalEmail,
  onRevealEmail,
}) {
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 z-[92] bg-black/60 p-4 flex items-center justify-center"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900 p-4 md:p-5"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold">Legal</h3>
          <button
            type="button"
            onClick={onClose}
            className="px-2 py-1 rounded border border-neutral-700 text-xs text-neutral-300 hover:bg-neutral-800/60"
          >
            Close
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              onSetLegalTab("impressum");
              onImpressumPress?.();
            }}
            className={`px-2.5 py-1 rounded border text-sm ${
              legalTab === "impressum"
                ? "border-neutral-600 bg-neutral-800 text-white"
                : "border-neutral-800 bg-neutral-900 text-neutral-400 hover:bg-neutral-800/50"
            }`}
          >
            Impressum
          </button>
          <button
            type="button"
            onClick={() => onSetLegalTab("privacy")}
            className={`px-2.5 py-1 rounded border text-sm ${
              legalTab === "privacy"
                ? "border-neutral-600 bg-neutral-800 text-white"
                : "border-neutral-800 bg-neutral-900 text-neutral-400 hover:bg-neutral-800/50"
            }`}
          >
            Privacy
          </button>
        </div>
        {legalTab === "impressum" ? (
          <div className="mt-4 text-sm text-neutral-200 space-y-3 leading-relaxed">
            <p className="font-medium">Impressum</p>
            <p>
              Arne Hertstein
              <br />
              Rathenaustraße 3
              <br />
              55131 Mainz
              <br />
              E-Mail:{" "}
              {showLegalEmail ? (
                <span>breakdowndrums@gmail.com</span>
              ) : (
                <button
                  type="button"
                  onClick={onRevealEmail}
                  className="underline underline-offset-2 text-neutral-200 hover:text-white"
                >
                  Click to reveal email
                </button>
              )}
            </p>
          </div>
        ) : (
          <div className="mt-4 text-sm text-neutral-200 space-y-3 leading-relaxed">
            <p className="font-medium">Datenschutzerklärung / Privacy Policy (GDPR)</p>
            <p>
              Verantwortlich / Controller:
              <br />
              Arne Hertstein, Rathenaustraße 3, 55131 Mainz,
              <br />
              {showLegalEmail ? (
                <span>breakdowndrums@gmail.com</span>
              ) : (
                <button
                  type="button"
                  onClick={onRevealEmail}
                  className="underline underline-offset-2 text-neutral-200 hover:text-white"
                >
                  Click to reveal email
                </button>
              )}
            </p>
            <p>
              Hosting:
              <br />
              This site is hosted via Vercel. When visiting the site, technically required server/CDN logs
              (e.g. IP address, timestamp, requested resource, user agent) may be processed to provide, secure,
              and operate the service (Art. 6(1)(f) GDPR).
            </p>
            <p>
              Analytics / Vercel Web Analytics:
              <br />
              This site uses the official Vercel Web Analytics integration. In that context, Vercel may process
              usage and request data such as page views, referrer information, browser / device information,
              IP-derived technical metadata, and timestamps in order to measure traffic and improve service
              quality (Art. 6(1)(f) GDPR).
            </p>
            <p>
              User accounts and cloud library:
              <br />
              If you create an account or sign in, your email address, account identifier, saved beats,
              saved arrangements, and related metadata may be processed via Supabase to provide login,
              password reset, and cloud library sync (Art. 6(1)(b) GDPR).
            </p>
            <p>
              Auth emails:
              <br />
              Account emails such as signup confirmation, magic links, and password reset emails are sent using
              Supabase Auth and Resend (Art. 6(1)(b) and (f) GDPR).
            </p>
            <p>
              Cookies:
              <br />
              The app itself does not use non-essential marketing cookies. Technical browser storage may still
              be used where needed to operate the service, and privacy-focused analytics may process technical
              usage data even where no marketing cookies are used.
            </p>
            <p>
              LocalStorage:
              <br />
              The app stores settings and local working data in your browser, including presets, preferences, and
              local beat / arrangement data if cloud sync is not used (Art. 6(1)(b) GDPR). You can remove this data
              anytime by clearing site storage in your browser.
            </p>
            <p>
              Public submissions and share links:
              <br />
              If you publish beats or arrangements publicly, or create share links / QR links, the submitted content
              and related metadata may be stored so it can be loaded by other users or by anyone with the link
              (Art. 6(1)(b) GDPR).
            </p>
            <p>
              Recipients / processors:
              <br />
              Personal data may be processed by service providers used to run the app, in particular Vercel
              (hosting and analytics), Supabase (authentication, database, and cloud library functions), and
              Resend where used for account-related emails.
            </p>
            <p>
              International transfers:
              <br />
              Depending on the configured provider regions and technical infrastructure, personal data may be
              processed outside the EEA. Where this happens, processing is based on the GDPR mechanisms used
              by the relevant provider, such as adequacy decisions or standard contractual clauses.
            </p>
            <p>
              Storage period / retention:
              <br />
              Account data and cloud library content are generally stored for as long as your account exists or
              until you delete the relevant content. Public shares may remain available until deleted by you or
              removed from the service. Technical logs are kept only for as long as required for security,
              operation, and troubleshooting. Browser-local data remains on your device until you delete it
              through the app or your browser storage settings.
            </p>
            <p>
              Contact by email:
              <br />
              If you contact us by email, your message data is processed only to handle your request
              (Art. 6(1)(b) or (f) GDPR) and retained only as long as necessary.
            </p>
            <p>
              No automated decision-making:
              <br />
              No automated decision-making within the meaning of Art. 22 GDPR is carried out.
            </p>
            <p>
              You may have rights under GDPR (access, rectification, erasure, restriction, portability, objection,
              complaint to a supervisory authority). Competent supervisory authority: Der Landesbeauftragte für den
              Datenschutz und die Informationsfreiheit Rheinland-Pfalz, Hintere Bleiche 34, 55116 Mainz. Contact:{" "}
              {showLegalEmail ? (
                <span>breakdowndrums@gmail.com</span>
              ) : (
                <button
                  type="button"
                  onClick={onRevealEmail}
                  className="underline underline-offset-2 text-neutral-200 hover:text-white"
                >
                  Click to reveal email
                </button>
              )}
              .
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
