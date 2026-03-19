export default function BeatLibraryWindow({
  beatLibraryPanelRef,
  beatLibraryDragRef,
  beginFloatingPanelDrag,
  beginFloatingPanelTouchHold,
  beatLibraryPos,
  beatLibraryTab,
  setBeatLibraryTab,
  libraryFiltersOpen,
  setLibraryFiltersOpen,
  setIsBeatLibraryOpen,
  beatNameInputRef,
  beatNameDraft,
  setBeatNameDraft,
  beatCategoryDraft,
  setBeatCategoryDraft,
  beatStyleDraft,
  setBeatStyleDraft,
  openPublicSubmitDialog,
  canUpdateLoadedLocalBeat,
  updateCurrentLoadedBeatLocal,
  saveCurrentBeatLocal,
  isAdminUser,
  beatCategoryOptions,
  beatStyleOptions,
  cycleLibrarySort,
  getLibrarySortLabel,
  librarySort,
  libraryTimeSigFilter,
  setLibraryTimeSigFilter,
  allTimeSigCategories,
  startLibraryBpmRepeat,
  stopLibraryBpmRepeat,
  cycleLibraryBpmFilterMode,
  getBpmFilterLabel,
  refreshPublicLibrary,
  publicLibraryError,
  setPublicLibraryError,
  filteredLocalBeats,
  filteredPublicBeats,
  getBeatBpm,
  loadedLocalBeatId,
  isLoadedLocalBeatNameChanged,
  selectedArrangementSourceBeatKey,
  loadBeatIntoEditor,
  handleDeleteLocalBeatClick,
  handleDeletePublicBeatClick,
  publicLibraryLoading,
}) {
  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <div
        ref={beatLibraryPanelRef}
        className="w-full max-w-[44rem] max-h-[90vh] overflow-auto rounded-xl border border-neutral-700 bg-neutral-900 p-4 md:p-5 pointer-events-auto shadow-2xl"
        style={{
          position: "absolute",
          left: beatLibraryPos.x,
          top: beatLibraryPos.y,
        }}
        onMouseDown={(e) => beginFloatingPanelDrag(e, beatLibraryPanelRef, beatLibraryDragRef)}
      >
        <div className="flex items-center justify-between gap-3">
          <div
            className="flex items-center gap-3 cursor-move select-none"
            onMouseDown={(e) => beginFloatingPanelDrag(e, beatLibraryPanelRef, beatLibraryDragRef)}
            onPointerDown={(e) => beginFloatingPanelTouchHold(e, beatLibraryPanelRef, beatLibraryDragRef)}
            title="Drag window"
          >
            <div className="grid grid-cols-2 gap-0.5 text-neutral-500" aria-hidden="true">
              <span className="h-0.5 w-0.5 rounded-full bg-current" />
              <span className="h-0.5 w-0.5 rounded-full bg-current" />
              <span className="h-0.5 w-0.5 rounded-full bg-current" />
              <span className="h-0.5 w-0.5 rounded-full bg-current" />
              <span className="h-0.5 w-0.5 rounded-full bg-current" />
              <span className="h-0.5 w-0.5 rounded-full bg-current" />
            </div>
            <h2 className="text-base font-semibold">Beat Library</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setBeatLibraryTab("local")}
                className={`px-2.5 py-1 rounded border text-sm ${
                  beatLibraryTab === "local"
                    ? "border-neutral-700 text-white bg-neutral-800"
                    : "border-neutral-800 text-neutral-400 bg-neutral-900/60"
                }`}
              >
                Local
              </button>
              <button
                type="button"
                onClick={() => setBeatLibraryTab("public")}
                className={`px-2.5 py-1 rounded border text-sm ${
                  beatLibraryTab === "public"
                    ? "border-neutral-700 text-white bg-neutral-800"
                    : "border-neutral-800 text-neutral-400 bg-neutral-900/60"
                }`}
              >
                Public
              </button>
              <button
                type="button"
                onClick={() => setLibraryFiltersOpen((v) => !v)}
                className={`px-2 py-1 rounded border text-xs leading-none ${
                  libraryFiltersOpen
                    ? "border-neutral-700 text-white bg-neutral-800"
                    : "border-neutral-800 text-neutral-400 bg-neutral-900/60"
                }`}
                title={libraryFiltersOpen ? "Hide beat filters" : "Show beat filters"}
              >
                ...
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsBeatLibraryOpen(false)}
            className="px-3 py-1.5 rounded border border-neutral-700 text-sm text-neutral-300 hover:bg-neutral-800/60"
          >
            Close
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-2">
          <input
            ref={beatNameInputRef}
            type="text"
            value={beatNameDraft}
            onChange={(e) => setBeatNameDraft(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (beatLibraryTab === "public") {
                openPublicSubmitDialog();
                return;
              }
              if (canUpdateLoadedLocalBeat) updateCurrentLoadedBeatLocal();
              else saveCurrentBeatLocal();
              try { e.currentTarget.blur(); } catch (_) {}
              setIsBeatLibraryOpen(false);
            }}
            placeholder="Beat name"
            className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm min-w-[180px]"
          />
          <select
            value={beatCategoryDraft}
            onChange={(e) => setBeatCategoryDraft(e.target.value)}
            className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm"
          >
            <option value="all">All categories</option>
            {beatCategoryOptions.map((c) => (
              <option key={`cat-${c}`} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={beatStyleDraft}
            onChange={(e) => setBeatStyleDraft(e.target.value)}
            className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm"
          >
            <option value="all">All styles</option>
            {beatStyleOptions.map((c) => (
              <option key={`style-${c}`} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={saveCurrentBeatLocal}
            className="px-2.5 py-1 rounded border text-sm border-neutral-700 text-white bg-neutral-800 hover:bg-neutral-700/60"
            title="Save to local beat library"
          >
            Save
          </button>
          <button
            type="button"
            onClick={updateCurrentLoadedBeatLocal}
            disabled={!canUpdateLoadedLocalBeat}
            className={`px-2.5 py-1 rounded border text-sm ${
              canUpdateLoadedLocalBeat
                ? "border-cyan-700 text-cyan-100 bg-cyan-900/20 hover:bg-cyan-800/30"
                : "border-neutral-800 text-neutral-500 bg-neutral-900/60 cursor-not-allowed"
            }`}
            title={
              canUpdateLoadedLocalBeat
                ? "Update loaded local beat"
                : isLoadedLocalBeatNameChanged
                  ? "Rename detected: use Save to create a new beat"
                  : "Load a local beat and change it to enable update"
            }
          >
            Update
          </button>
          <button
            type="button"
            onClick={openPublicSubmitDialog}
            disabled={!isAdminUser}
            className={`px-2.5 py-1 rounded border text-sm ${
              isAdminUser
                ? "border-neutral-700 text-white bg-neutral-800 hover:bg-neutral-700/60"
                : "border-neutral-800 text-neutral-500 bg-neutral-900/60 cursor-not-allowed"
            }`}
            title={isAdminUser ? "Publish to public beat library" : "Admin login required"}
          >
            Publish public
          </button>
        </div>

        {libraryFiltersOpen && (
          <div className="mt-3 rounded border border-neutral-800 bg-neutral-900/40 p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-neutral-400">Sort</span>
              <button
                type="button"
                onClick={cycleLibrarySort}
                className="px-2 py-0.5 rounded border border-neutral-700 text-xs text-neutral-300 hover:bg-neutral-800/50"
              >
                {getLibrarySortLabel(librarySort)}
              </button>
              <span className="text-xs text-neutral-400">Time sig</span>
              <select
                value={libraryTimeSigFilter}
                onChange={(e) => setLibraryTimeSigFilter(e.target.value)}
                className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs"
              >
                <option value="all">All</option>
                {allTimeSigCategories.map((ts) => (
                  <option key={`ts-${ts}`} value={ts}>
                    {ts}
                  </option>
                ))}
              </select>
              <span className="text-xs text-neutral-400">BPM</span>
              <div className="flex items-stretch overflow-hidden rounded border border-neutral-700 bg-neutral-800">
                <button
                  type="button"
                  onPointerDown={() => startLibraryBpmRepeat(-1)}
                  onPointerUp={stopLibraryBpmRepeat}
                  onPointerCancel={stopLibraryBpmRepeat}
                  onPointerLeave={stopLibraryBpmRepeat}
                  className="px-2 text-xs text-neutral-300 hover:bg-neutral-700/60 active:bg-neutral-700"
                  aria-label="Decrease BPM filter value"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={cycleLibraryBpmFilterMode}
                  className="min-w-[64px] border-l border-r border-neutral-700 px-2 py-1 text-xs text-white hover:bg-neutral-700/60"
                  title="Cycle BPM filter mode"
                >
                  {getBpmFilterLabel()}
                </button>
                <button
                  type="button"
                  onPointerDown={() => startLibraryBpmRepeat(1)}
                  onPointerUp={stopLibraryBpmRepeat}
                  onPointerCancel={stopLibraryBpmRepeat}
                  onPointerLeave={stopLibraryBpmRepeat}
                  className="px-2 text-xs text-neutral-300 hover:bg-neutral-700/60 active:bg-neutral-700"
                  aria-label="Increase BPM filter value"
                >
                  +
                </button>
              </div>
              {beatLibraryTab === "public" && (
                <button
                  type="button"
                  onClick={refreshPublicLibrary}
                  className="px-2 py-0.5 rounded border border-neutral-700 text-xs text-neutral-300 hover:bg-neutral-800/50"
                >
                  Refresh
                </button>
              )}
            </div>
          </div>
        )}

        {publicLibraryError && (
          <div className="mt-3 rounded border border-amber-700/70 bg-amber-950/30 px-2 py-1 text-xs text-amber-100 flex items-center justify-between gap-2">
            <span>{publicLibraryError}</span>
            <button
              type="button"
              onClick={() => setPublicLibraryError("")}
              className="px-1 rounded border border-amber-700/60 text-amber-100 hover:bg-amber-800/40"
              aria-label="Close beat library error"
              title="Close"
            >
              x
            </button>
          </div>
        )}

        <div className="mt-4 space-y-2 dg-scroll-follow-list">
          {(beatLibraryTab === "local" ? filteredLocalBeats : filteredPublicBeats).map((beat) => {
            const beatBpm = getBeatBpm(beat);
            const beatRowKey = `${beatLibraryTab === "public" ? "public" : "local"}:${String(beat.id)}`;
            const isLoadedTrackedBeat =
              beatLibraryTab === "local" &&
              String(loadedLocalBeatId || "") === String(beat.id) &&
              !isLoadedLocalBeatNameChanged;
            const isSelectedArrangementSourceBeat = selectedArrangementSourceBeatKey === beatRowKey;
            return (
              <div
                key={`beat-${beat.id}`}
                data-beat-row-id={beatRowKey}
                role="button"
                tabIndex={0}
                onClick={() => loadBeatIntoEditor(beatLibraryTab, beat)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    loadBeatIntoEditor(beatLibraryTab, beat);
                  }
                }}
                className={`rounded border px-3 py-2 cursor-pointer outline-none focus:outline-none focus-visible:outline-none ${
                  isLoadedTrackedBeat || isSelectedArrangementSourceBeat
                    ? "border-sky-500/70 bg-sky-900/30 shadow-[0_0_0_1px_rgba(14,165,233,0.35)]"
                    : "border-neutral-800 bg-neutral-950/40 hover:bg-neutral-900/60"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm text-white">
                      {beat.name || "Untitled Beat"}
                      {beat.composer ? (
                        <span className="ml-2 text-xs text-neutral-400">{`by ${beat.composer}`}</span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-neutral-400">
                      {beat.createdAt ? (
                        <span className="inline-block w-[78px] text-neutral-600 tabular-nums">
                          {new Date(beat.createdAt).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="inline-block w-[78px] text-neutral-600">—</span>
                      )}
                      <span className="inline-block w-[40px] tabular-nums">{beat.timeSigCategory || "4/4"}</span>
                      <span className="inline-block w-[72px] tabular-nums">
                        {Number.isFinite(beatBpm) ? `${beatBpm} BPM` : "—"}
                      </span>
                      <span className="inline-block w-[72px] truncate">{beat.category || "Groove"}</span>
                      <span className="inline-block w-[108px] truncate">{beat.style || "—"}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {beatLibraryTab === "local" && (
                      <button
                        type="button"
                        onClick={(e) => handleDeleteLocalBeatClick(e, beat.id)}
                        className="px-2.5 py-1 rounded border border-red-900 text-sm text-red-200 hover:bg-red-900/30"
                        aria-label="Delete beat"
                        title="Delete beat (Cmd/Ctrl+click: clear all)"
                      >
                        ×
                      </button>
                    )}
                    {beatLibraryTab === "public" && isAdminUser && (
                      <button
                        type="button"
                        onClick={(e) => handleDeletePublicBeatClick(e, beat.publishedShareId || beat.id)}
                        className="px-2.5 py-1 rounded border border-red-900 text-sm text-red-200 hover:bg-red-900/30"
                        aria-label="Delete public beat"
                        title="Delete public beat"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {beatLibraryTab === "public" && publicLibraryLoading && (
            <div className="text-xs text-neutral-400">Loading public library…</div>
          )}
          {beatLibraryTab === "local" && filteredLocalBeats.length === 0 && (
            <div className="text-xs text-neutral-500">No local beats saved yet.</div>
          )}
          {beatLibraryTab === "public" && !publicLibraryLoading && filteredPublicBeats.length === 0 && (
            <div className="text-xs text-neutral-500">No public beats yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
