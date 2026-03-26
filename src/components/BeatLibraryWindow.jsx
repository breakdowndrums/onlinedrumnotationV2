import React from "react";
import { DndContext, PointerSensor, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
  beatSaveButtonRef,
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
  beatLibraryContainers,
  beatLibraryVisibleContainers,
  selectedBeatLibraryContainer,
  selectedBeatLibraryContainerId,
  beatLibraryRootCollapsed,
  toggleBeatLibraryRootCollapsedManual,
  toggleBeatLibraryExpandAll,
  setSelectedBeatLibraryContainerId,
  editingBeatLibraryContainerId,
  editingBeatLibraryContainerName,
  editingBeatLibraryBeatId,
  editingBeatLibraryBeatName,
  beatLibraryDropTargetId,
  setBeatLibraryDropTargetId,
  setEditingBeatLibraryContainerName,
  setEditingBeatLibraryBeatName,
  startEditingBeatLibraryContainer,
  commitEditingBeatLibraryContainer,
  cancelEditingBeatLibraryContainer,
  startEditingBeatLibraryBeat,
  commitEditingBeatLibraryBeat,
  cancelEditingBeatLibraryBeat,
  beginBeatLibraryTreeDrag,
  clearBeatLibraryTreeDrag,
  handleBeatLibraryTreeDrop,
  handleBeatLibraryTrashDrop,
  handleBeatLibrarySortDragStart,
  handleBeatLibrarySortDragOver,
  handleBeatLibrarySortDragEnd,
  handleBeatLibrarySortDragCancel,
  toggleBeatLibraryContainerCollapsed,
  deleteBeatLibraryContainer,
  createBeatLibraryContainer,
  allLocalBeats,
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
  const beatLibraryListRef = React.useRef(null);
  const beatLibraryOrderSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    })
  );
  const restrictBeatLibraryDragToList = React.useCallback(({ transform, activeNodeRect }) => {
    const listEl = beatLibraryListRef.current;
    if (!listEl || !transform || !activeNodeRect) {
      return transform ? { ...transform, x: 0 } : transform;
    }
    const listRect = listEl.getBoundingClientRect();
    const minY = listRect.top - activeNodeRect.top;
    const maxY = listRect.bottom - activeNodeRect.bottom;
    return {
      ...transform,
      x: 0,
      y: Math.max(minY, Math.min(maxY, transform.y)),
    };
  }, []);
  const renderTreeTriangle = (expanded) => (
    <svg
      viewBox="0 0 10 10"
      className={`h-3.5 w-3.5 fill-current transition-transform ${expanded ? "rotate-90" : ""}`}
      aria-hidden="true"
    >
      <path d="M2 1.5 L8 5 L2 8.5 Z" />
    </svg>
  );
  const renderPencilIcon = () => (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current" aria-hidden="true">
      <path d="M3 11.5 11.8 2.7a1.5 1.5 0 0 1 2.1 2.1L5.1 13.6 2.5 14l.5-2.5Z" strokeWidth="1.4" />
      <path d="m10.7 3.8 1.5 1.5" strokeWidth="1.4" />
    </svg>
  );
  const suppressFolderSelectionHighlight =
    Boolean(loadedLocalBeatId) && !isLoadedLocalBeatNameChanged ||
    String(selectedArrangementSourceBeatKey || "").startsWith("local:");
  const suppressRootSelectionHighlight = suppressFolderSelectionHighlight;

  const getBeatLibraryMeta = (beat) => {
    const direct = beat?.libraryMeta && typeof beat.libraryMeta === "object" ? beat.libraryMeta : null;
    const payloadMeta =
      beat?.payload?.libraryMeta && typeof beat.payload.libraryMeta === "object"
        ? beat.payload.libraryMeta
        : null;
    const meta = direct || payloadMeta || null;
    return {
      parentId: meta?.parentId ? String(meta.parentId) : null,
    };
  };

  const renderBeatRow = (beat, sourceTab) => {
    const beatBpm = getBeatBpm(beat);
    const beatRowKey = `${sourceTab === "public" ? "public" : "local"}:${String(beat.id)}`;
    const isLoadedTrackedBeat =
      sourceTab === "local" &&
      String(loadedLocalBeatId || "") === String(beat.id) &&
      !isLoadedLocalBeatNameChanged;
    const isSelectedArrangementSourceBeat = selectedArrangementSourceBeatKey === beatRowKey;
    return (
      <div
        key={`beat-${beat.id}`}
        data-beat-row-id={beatRowKey}
        role="button"
        tabIndex={0}
        draggable={sourceTab === "local"}
        onDragStart={(e) => {
          if (sourceTab !== "local") return;
          beginBeatLibraryTreeDrag({ kind: "beat", beatId: beat.id });
          try {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", `beat:${String(beat.id)}`);
          } catch (_) {}
        }}
        onDragEnd={clearBeatLibraryTreeDrag}
        onClick={() => loadBeatIntoEditor(sourceTab, beat)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            loadBeatIntoEditor(sourceTab, beat);
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
            {sourceTab === "local" && (
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
            {sourceTab === "public" && isAdminUser && (
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
  };

  const renderLocalTreeBeatRow = (beat, depth) => {
    const beatBpm = getBeatBpm(beat);
    const beatRowKey = `local:${String(beat.id)}`;
    const isLoadedTrackedBeat =
      String(loadedLocalBeatId || "") === String(beat.id) && !isLoadedLocalBeatNameChanged;
    const isSelectedArrangementSourceBeat = selectedArrangementSourceBeatKey === beatRowKey;
    return (
      <SortableBeatLibraryTreeBeatRow
        key={`tree-beat-${beat.id}`}
        beat={beat}
        depth={depth}
        beatRowKey={beatRowKey}
        beatBpm={beatBpm}
        beatLibraryDropTargetId={beatLibraryDropTargetId}
        isLoadedTrackedBeat={isLoadedTrackedBeat}
        isSelectedArrangementSourceBeat={isSelectedArrangementSourceBeat}
        editingBeatLibraryBeatId={editingBeatLibraryBeatId}
        editingBeatLibraryBeatName={editingBeatLibraryBeatName}
        setEditingBeatLibraryBeatName={setEditingBeatLibraryBeatName}
        commitEditingBeatLibraryBeat={commitEditingBeatLibraryBeat}
        cancelEditingBeatLibraryBeat={cancelEditingBeatLibraryBeat}
        startEditingBeatLibraryBeat={startEditingBeatLibraryBeat}
        loadBeatIntoEditor={loadBeatIntoEditor}
        handleDeleteLocalBeatClick={handleDeleteLocalBeatClick}
        renderPencilIcon={renderPencilIcon}
      />
    );
  };

  const renderLocalFolderBranch = (parentId, depth) => {
    const childFolders = beatLibraryContainers.filter(
      (entry) => String(entry.parentId || "") === String(parentId || "")
    );
    const childBeats = filteredLocalBeats
      .filter((beat) => String(getBeatLibraryMeta(beat).parentId || "") === String(parentId || ""))
      .sort((a, b) => {
        const metaA = getBeatLibraryMeta(a);
        const metaB = getBeatLibraryMeta(b);
        const orderDiff = (Number(metaA.manualOrder) || 0) - (Number(metaB.manualOrder) || 0);
        if (orderDiff) return orderDiff;
        return new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime();
      });
    const nodes = [];

    childFolders.forEach((entry) => {
      const hasChildren =
        beatLibraryContainers.some((candidate) => String(candidate.parentId || "") === String(entry.id)) ||
        allLocalBeats.some((beat) => String(getBeatLibraryMeta(beat).parentId || "") === String(entry.id));
      const isSelected = String(selectedBeatLibraryContainerId) === String(entry.id);
      nodes.push(
        <BeatLibraryDropTarget
          key={entry.id}
          id={String(entry.id)}
          className="relative"
          style={{ marginLeft: `${Math.max(0, depth) * 0.5}rem` }}
          draggable
          onDragStart={(e) => {
            beginBeatLibraryTreeDrag({ kind: "container", containerId: entry.id });
            try {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", `container:${String(entry.id)}`);
            } catch (_) {}
          }}
          onDragEnd={clearBeatLibraryTreeDrag}
          onDragEnter={(e) => {
            e.preventDefault();
            setBeatLibraryDropTargetId(String(entry.id));
            if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setBeatLibraryDropTargetId(String(entry.id));
            if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleBeatLibraryTreeDrop(entry.id);
          }}
        >
          <button
            type="button"
            onClick={() => setSelectedBeatLibraryContainerId(entry.id)}
            className={`flex w-full items-center gap-2 rounded border px-2 py-1 text-left text-sm ${
              beatLibraryDropTargetId === String(entry.id)
                ? "border-cyan-400/80 bg-cyan-900/25 text-cyan-50 shadow-[0_0_0_1px_rgba(34,211,238,0.35)]"
                : isSelected && !suppressFolderSelectionHighlight
                  ? "border-sky-500/70 bg-sky-900/30 text-sky-100"
                  : "border-neutral-800 bg-neutral-900/40 text-neutral-300 hover:bg-neutral-800/60"
            }`}
            title="Folder"
          >
            <span
              className={`inline-flex h-5 min-w-5 items-center justify-center rounded text-xs ${
                hasChildren ? "text-neutral-400 hover:bg-neutral-800/60" : "text-neutral-700"
              }`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (hasChildren) toggleBeatLibraryContainerCollapsed(entry.id);
              }}
              aria-hidden="true"
            >
              {hasChildren ? renderTreeTriangle(!entry.collapsed) : ""}
            </span>
            {String(editingBeatLibraryContainerId || "") === String(entry.id) ? (
              <input
                type="text"
                value={editingBeatLibraryContainerName}
                onChange={(e) => setEditingBeatLibraryContainerName(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onFocus={(e) => e.currentTarget.select()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    commitEditingBeatLibraryContainer();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    cancelEditingBeatLibraryContainer();
                  }
                }}
                onBlur={() => commitEditingBeatLibraryContainer()}
                autoFocus
                className="min-w-0 flex-1 rounded bg-neutral-950/70 px-1 py-0.5 text-sm text-white outline-none"
              />
            ) : (
              <span className="min-w-0 flex-1 truncate">{entry.name}</span>
            )}
            <button
              type="button"
              onPointerDown={(e) => {
                if (String(editingBeatLibraryContainerId || "") !== String(entry.id)) return;
                e.preventDefault();
                e.stopPropagation();
                commitEditingBeatLibraryContainer();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (String(editingBeatLibraryContainerId || "") === String(entry.id)) {
                  return;
                } else {
                  startEditingBeatLibraryContainer(entry.id);
                }
              }}
              className="inline-flex h-6 min-w-6 items-center justify-center rounded text-neutral-400 hover:bg-neutral-800/60 hover:text-white"
              title="Rename folder"
            >
              {renderPencilIcon()}
            </button>
          </button>
        </BeatLibraryDropTarget>
      );
      if (!entry.collapsed) nodes.push(...renderLocalFolderBranch(entry.id, depth + 1));
    });

    if (childBeats.length > 0) {
      nodes.push(
        <SortableContext
          key={`beat-sortable-${String(parentId || "root")}`}
          items={childBeats.map((beat) => `beat:${String(beat.id)}`)}
          strategy={verticalListSortingStrategy}
        >
          {childBeats.map((beat) => renderLocalTreeBeatRow(beat, depth))}
        </SortableContext>
      );
    }

    return nodes;
  };

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <div
        ref={beatLibraryPanelRef}
        className="relative w-full max-w-[44rem] max-h-[90vh] overflow-auto rounded-xl border border-neutral-700 bg-neutral-900 p-4 md:p-5 pointer-events-auto shadow-2xl"
        style={{
          position: "absolute",
          left: beatLibraryPos.x,
          top: beatLibraryPos.y,
        }}
        onMouseDown={(e) => beginFloatingPanelDrag(e, beatLibraryPanelRef, beatLibraryDragRef)}
      >
        <button
          type="button"
          onClick={() => setIsBeatLibraryOpen(false)}
          className="absolute right-4 top-4 z-10 rounded border border-neutral-700 bg-neutral-900/80 px-2.5 py-1 text-sm text-neutral-300 hover:bg-neutral-800/60"
          title="Close beat library"
          aria-label="Close beat library"
        >
          ×
        </button>
        {libraryFiltersOpen && (
          <div className="rounded border border-neutral-800 bg-neutral-900/40 p-2.5 pr-12">
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

        <div className={libraryFiltersOpen || publicLibraryError ? "mt-4" : ""}>
          {beatLibraryTab === "local" ? (
            <div className="flex max-h-[58vh] flex-col rounded border border-neutral-800 bg-neutral-950/30 p-2">
              <div ref={beatLibraryListRef} className="min-h-0 overflow-auto pr-1">
                <DndContext
                  sensors={beatLibraryOrderSensors}
                  onDragStart={handleBeatLibrarySortDragStart}
                  onDragOver={handleBeatLibrarySortDragOver}
                  onDragEnd={handleBeatLibrarySortDragEnd}
                  onDragCancel={handleBeatLibrarySortDragCancel}
                  modifiers={[restrictBeatLibraryDragToList]}
                >
                <div className="space-y-1">
                  <BeatLibraryDropTarget id="all">
                  <button
                  type="button"
                    onClick={() => toggleBeatLibraryExpandAll()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setBeatLibraryDropTargetId("all");
                      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
                    }}
                    onDragLeave={() => setBeatLibraryDropTargetId((prev) => (prev === "all" ? null : prev))}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleBeatLibraryTreeDrop(null);
                    }}
                    className={`flex w-full items-center gap-2 rounded border px-2 py-1 text-left text-sm ${
                    beatLibraryDropTargetId === "all"
                      ? "border-cyan-400/80 bg-cyan-900/25 text-cyan-50 shadow-[0_0_0_1px_rgba(34,211,238,0.35)]"
                      : "border-neutral-800 bg-neutral-900/40 text-neutral-300 hover:bg-neutral-800/60"
                  }`}
                >
                  <span
                    className="inline-flex h-5 min-w-5 items-center justify-center rounded text-xs text-neutral-600 hover:bg-neutral-800/60"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (beatLibraryVisibleContainers.length > 0) {
                        toggleBeatLibraryRootCollapsedManual();
                      }
                    }}
                    aria-hidden="true"
                  >
                    {beatLibraryVisibleContainers.length > 0 ? renderTreeTriangle(!beatLibraryRootCollapsed) : ""}
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleBeatLibraryExpandAll();
                    }}
                  >
                    All beats
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setBeatLibraryTab("local");
                      }}
                      className={`px-2.5 py-1 rounded border text-xs ${
                        beatLibraryTab === "local"
                          ? "border-neutral-700 text-white bg-neutral-800"
                          : "border-neutral-800 text-neutral-400 bg-neutral-900/60"
                      }`}
                    >
                      Local
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setBeatLibraryTab("public");
                      }}
                      className={`px-2.5 py-1 rounded border text-xs ${
                        beatLibraryTab === "public"
                          ? "border-neutral-700 text-white bg-neutral-800"
                          : "border-neutral-800 text-neutral-400 bg-neutral-900/60"
                      }`}
                    >
                      Public
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setLibraryFiltersOpen((v) => !v);
                      }}
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
                  <span className="rounded border border-neutral-800 px-1.5 py-0.5 text-[11px] text-neutral-500">
                    {filteredLocalBeats.length}
                  </span>
                  </button>
                  </BeatLibraryDropTarget>
                  {!beatLibraryRootCollapsed && renderLocalFolderBranch(null, 1)}
                  {!beatLibraryRootCollapsed &&
                    beatLibraryContainers.length === 0 &&
                    filteredLocalBeats.length === 0 && (
                    <div className="px-2 py-1 text-xs text-neutral-500">
                      No local beats saved yet. Create a folder or save a beat.
                    </div>
                  )}
                </div>
                </DndContext>
              </div>
              <div className="mt-2 space-y-2 border-t border-neutral-800 pt-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => createBeatLibraryContainer("folder")}
                    className="flex-1 rounded border border-neutral-800 bg-neutral-900/40 px-2 py-1 text-[11px] text-neutral-300 hover:bg-neutral-800/60"
                  >
                    + Folder
                  </button>
                  <BeatLibraryDropTarget id="__trash__">
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedBeatLibraryContainerId !== "all") deleteBeatLibraryContainer(selectedBeatLibraryContainerId);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setBeatLibraryDropTargetId("__trash__");
                      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
                    }}
                    onDragLeave={() =>
                      setBeatLibraryDropTargetId((prev) => (prev === "__trash__" ? null : prev))
                    }
                    onDrop={async (e) => {
                      e.preventDefault();
                      await handleBeatLibraryTrashDrop();
                    }}
                    disabled={selectedBeatLibraryContainerId === "all"}
                    className={`rounded border px-2 py-1 text-[11px] ${
                      beatLibraryDropTargetId === "__trash__"
                        ? "border-red-500/80 bg-red-900/25 text-red-100 shadow-[0_0_0_1px_rgba(239,68,68,0.35)]"
                        : selectedBeatLibraryContainerId !== "all"
                          ? "border-red-900 text-red-200 hover:bg-red-900/30"
                          : "border-neutral-800 text-neutral-500 bg-neutral-900/60 cursor-not-allowed"
                    }`}
                    title={
                      selectedBeatLibraryContainerId !== "all"
                        ? "Delete selected folder or drop beats/folders here"
                        : "Drop beats/folders here to delete"
                    }
                      >
                        <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 16 16"
                        className="h-4 w-4"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z" />
                        <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z" />
                      </svg>
                  </button>
                  </BeatLibraryDropTarget>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <input
                    ref={beatNameInputRef}
                    type="text"
                    value={beatNameDraft}
                    onChange={(e) => setBeatNameDraft(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      if (canUpdateLoadedLocalBeat) updateCurrentLoadedBeatLocal();
                      else saveCurrentBeatLocal();
                      try { e.currentTarget.blur(); } catch (_) {}
                      setIsBeatLibraryOpen(false);
                    }}
                    placeholder="Beat name"
                    className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm min-w-[180px] flex-1"
                  />
                  <button
                    ref={beatSaveButtonRef}
                    type="button"
                    onClick={saveCurrentBeatLocal}
                    className="px-2.5 py-1 rounded border text-sm border-neutral-700 text-white bg-neutral-800 hover:bg-neutral-700/60 focus:outline-none focus:border-sky-500/70 focus:bg-sky-900/30 focus:shadow-[0_0_0_1px_rgba(14,165,233,0.35)]"
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
                    onClick={saveCurrentBeatLocal}
                    className="px-2.5 py-1 rounded border text-sm border-neutral-700 text-white bg-neutral-800 hover:bg-neutral-700/60"
                    title="Save as new beat"
                  >
                    Save as new
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
              </div>
            </div>
          ) : (
          <div className="space-y-2 dg-scroll-follow-list">
            <div className="rounded border border-neutral-800 bg-neutral-950/30 p-2">
              <button
                type="button"
                onClick={() => setBeatLibraryTab("local")}
                className="flex w-full items-center gap-2 rounded border border-neutral-800 bg-neutral-900/40 px-2 py-1 text-left text-sm text-neutral-300"
              >
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded text-xs text-neutral-700" />
                <span className="min-w-0 flex-1 truncate">All beats</span>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setBeatLibraryTab("local");
                    }}
                    className={`px-2.5 py-1 rounded border text-xs ${
                      beatLibraryTab === "local"
                        ? "border-neutral-700 text-white bg-neutral-800"
                        : "border-neutral-800 text-neutral-400 bg-neutral-900/60"
                    }`}
                  >
                    Local
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setBeatLibraryTab("public");
                    }}
                    className={`px-2.5 py-1 rounded border text-xs ${
                      beatLibraryTab === "public"
                        ? "border-neutral-700 text-white bg-neutral-800"
                        : "border-neutral-800 text-neutral-400 bg-neutral-900/60"
                    }`}
                  >
                    Public
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setLibraryFiltersOpen((v) => !v);
                    }}
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
                <span className="rounded border border-neutral-800 px-1.5 py-0.5 text-[11px] text-neutral-500">
                  {filteredPublicBeats.length}
                </span>
              </button>
            </div>
            {filteredPublicBeats.map((beat) => renderBeatRow(beat, "public"))}
            {publicLibraryLoading && <div className="text-xs text-neutral-400">Loading public library…</div>}
            {!publicLibraryLoading && filteredPublicBeats.length === 0 && (
              <div className="text-xs text-neutral-500">No public beats yet.</div>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

function BeatLibraryDropTarget({ id, children, ...props }) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div ref={setNodeRef} {...props}>
      {children}
    </div>
  );
}

function SortableBeatLibraryTreeBeatRow({
  beat,
  depth,
  beatRowKey,
  beatBpm,
  beatLibraryDropTargetId,
  isLoadedTrackedBeat,
  isSelectedArrangementSourceBeat,
  editingBeatLibraryBeatId,
  editingBeatLibraryBeatName,
  setEditingBeatLibraryBeatName,
  commitEditingBeatLibraryBeat,
  cancelEditingBeatLibraryBeat,
  startEditingBeatLibraryBeat,
  loadBeatIntoEditor,
  handleDeleteLocalBeatClick,
  renderPencilIcon,
}) {
  const id = `beat:${String(beat.id)}`;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const verticalTransform = transform ? { ...transform, x: 0 } : null;
  const style = {
    marginLeft: `${Math.max(0, depth) * 0.5}rem`,
    transform: CSS.Transform.toString(verticalTransform),
    transition,
  };

  return (
    <div ref={setNodeRef} className="relative" style={style}>
      <div
        data-beat-row-id={beatRowKey}
        role="button"
        tabIndex={0}
        onClick={() => loadBeatIntoEditor("local", beat)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            loadBeatIntoEditor("local", beat);
          }
        }}
        {...attributes}
        {...listeners}
        className={`flex items-center gap-2 rounded border px-2 py-1 text-left text-sm outline-none focus:outline-none focus-visible:outline-none ${
          isLoadedTrackedBeat || isSelectedArrangementSourceBeat
            ? "border-sky-500/70 bg-sky-900/30 shadow-[0_0_0_1px_rgba(14,165,233,0.35)]"
            : isDragging
              ? "border-cyan-700/70 bg-cyan-950/20"
              : "border-neutral-800 bg-neutral-950/40 hover:bg-neutral-900/60"
        }`}
      >
        <span className="inline-flex h-5 min-w-5 items-center justify-center text-neutral-700" aria-hidden="true">
          •
        </span>
        <div className="min-w-0 flex-1">
          {String(editingBeatLibraryBeatId || "") === String(beat.id) ? (
            <input
              type="text"
              value={editingBeatLibraryBeatName}
              onChange={(e) => setEditingBeatLibraryBeatName(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onFocus={(e) => e.currentTarget.select()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  commitEditingBeatLibraryBeat();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  cancelEditingBeatLibraryBeat();
                }
              }}
              onBlur={() => commitEditingBeatLibraryBeat()}
              autoFocus
              className="w-full rounded bg-neutral-950/70 px-1 py-0.5 text-sm text-white outline-none"
            />
          ) : (
            <div className="truncate text-white">{beat.name || "Untitled Beat"}</div>
          )}
          <div className="truncate text-[11px] text-neutral-500">
            {(beat.timeSigCategory || "4/4") + (Number.isFinite(beatBpm) ? ` · ${beatBpm} BPM` : "")}
          </div>
        </div>
        <button
          type="button"
          onPointerDown={(e) => {
            if (String(editingBeatLibraryBeatId || "") === String(beat.id)) {
              e.preventDefault();
              e.stopPropagation();
              commitEditingBeatLibraryBeat();
              return;
            }
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (String(editingBeatLibraryBeatId || "") === String(beat.id)) {
              return;
            } else {
              startEditingBeatLibraryBeat(beat.id);
            }
          }}
          className="inline-flex h-6 min-w-6 items-center justify-center rounded text-neutral-400 hover:bg-neutral-800/60 hover:text-white"
          title="Rename beat"
        >
          {renderPencilIcon()}
        </button>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => handleDeleteLocalBeatClick(e, beat.id)}
          className="px-1.5 py-0.5 rounded border border-red-900 text-[11px] text-red-200 hover:bg-red-900/30"
          aria-label="Delete beat"
          title="Delete beat (Cmd/Ctrl+click: clear all)"
        >
          ×
        </button>
      </div>
    </div>
  );
}
