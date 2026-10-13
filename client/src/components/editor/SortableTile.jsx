import { useRef, useState } from 'react';
import { useDndContext } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { clampSize, SIZE_PRESETS } from '../../lib/layout.js';
import { TILE_TYPES } from '../../lib/tileRegistry.js';
import { Icon } from '../Icons.jsx';
import Tile, { cellClassName, cellStyle } from '../Tile.jsx';
import TileBadges from './TileBadges.jsx';
import { dragClock } from './dragClock.js';
import { useEditor } from './EditorContext.js';

/** Stop pointer events on controls from starting a drag. */
const stop = (e) => e.stopPropagation();
const controlGuards = { onPointerDown: stop, onMouseDown: stop, onTouchStart: stop };

let resizeGestureId = 0;

/** Devices without hover (phones, tablets) use tap-to-select instead. */
const isTouchUI = () => window.matchMedia('(hover: none)').matches;

/** Presets a tile type allows (presets outside its min/max are hidden). */
function presetsFor(limits) {
  return SIZE_PRESETS.filter((p) => {
    const c = clampSize(limits, p.w, p.h);
    return c.w === p.w && c.h === p.h;
  });
}

/**
 * Read the live grid geometry so a drag can be snapped to whole cells.
 * @param {HTMLElement} grid the .tile-grid element
 */
function gridMetrics(grid) {
  const cs = getComputedStyle(grid);
  const tracks = cs.gridTemplateColumns.split(' ');
  return {
    cols: tracks.length,
    colW: parseFloat(tracks[0]),
    rowH: parseFloat(cs.gridAutoRows),
    gap: parseFloat(cs.columnGap) || 0,
  };
}

/**
 * A tile in edit mode: draggable, with duplicate / edit / delete buttons,
 * size presets, and a corner handle for free resizing (snaps to the grid).
 *
 * A transparent "shield" covers the tile content so links and iframes
 * (Spotify, embeds…) don't swallow clicks or drags while editing; clicking
 * the shield opens the tile's settings.
 *
 * @param {{ tile: import('../../lib/types.js').Tile }} props
 */
export default function SortableTile({ tile }) {
  const { actions, openTileEditor, selectedId, setSelectedId } = useEditor();
  const selected = selectedId === tile.id;
  const { setNodeRef, attributes, listeners, isDragging } = useSortable({
    id: tile.id,
    // Keep the <li>'s list semantics (dnd-kit defaults to role="button",
    // which isn't allowed on a list item and nests the tile's own buttons
    // inside a button). It stays focusable and keyboard-draggable.
    attributes: { role: 'listitem' },
  });
  const dragActive = Boolean(useDndContext().active);
  const def = TILE_TYPES[tile.type];
  const limits = def?.layout || {};
  const presets = presetsFor(limits);
  const canResize = (limits.minW ?? 1) !== (limits.maxW ?? 4) || (limits.minH ?? 1) !== (limits.maxH ?? 8);
  const [resizing, setResizing] = useState(false);
  const resize = useRef(null);

  /**
   * Click/tap on the tile. With a mouse it opens the editor. On touch
   * screens the first tap selects the tile (showing its controls) and a
   * second tap opens the editor, so controls don't cover every card at once.
   */
  const openEditor = () => {
    if (Date.now() - dragClock.endedAt < 250) return; // click that ended a drag/resize
    if (isTouchUI() && !selected) {
      setSelectedId(tile.id);
      return;
    }
    openTileEditor(tile.id);
  };

  /* ------------------------- Corner drag-resize ------------------------ */

  const onResizeStart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const cell = e.currentTarget.closest('.tile-cell');
    resize.current = { rect: cell.getBoundingClientRect(), metrics: gridMetrics(cell.parentElement), gesture: ++resizeGestureId };
    e.currentTarget.setPointerCapture(e.pointerId);
    actions.checkpoint();
    setResizing(true);
  };

  const onResizeMove = (e) => {
    if (!resize.current) return;
    const { rect, metrics, gesture } = resize.current;
    const { colW, rowH, gap, cols } = metrics;
    const w = Math.round((e.clientX - rect.left + gap) / (colW + gap));
    const h = Math.round((e.clientY - rect.top + gap) / (rowH + gap));
    const size = clampSize({ ...limits, maxW: Math.min(limits.maxW ?? 4, cols) }, w, h);
    // On the 2-column phone layout, a full-width tile (w 3–4) keeps its width.
    if (cols === 2 && tile.w > 2 && size.w === 2) size.w = tile.w;
    actions.resizeTile(tile.id, size.w, size.h, gesture);
  };

  const onResizeEnd = () => {
    if (!resize.current) return;
    resize.current = null;
    setResizing(false);
    dragClock.endedAt = Date.now();
    actions.checkpoint();
  };

  return (
    <li
      ref={setNodeRef}
      data-tile-id={tile.id}
      style={cellStyle(tile)}
      className={`${cellClassName(tile)} is-editable ${isDragging ? 'is-placeholder' : ''} ${resizing ? 'is-resizing' : ''} ${selected ? 'is-selected' : ''}`}
      {...attributes}
      {...listeners}
      aria-roledescription="Draggable tile"
      aria-label={`${def?.label || tile.type} tile, ${tile.w} by ${tile.h}. Press Space to move, Enter to edit.`}
      // Keyboard focus selects the tile; focus caused by a tap must not
      // (otherwise the same tap would immediately open the editor).
      onFocus={(e) => e.target === e.currentTarget && e.target.matches(':focus-visible') && setSelectedId(tile.id)}
      onKeyDown={(e) => {
        // Shortcuts only apply when the tile itself (not a control) has focus,
        // and never during a keyboard drag: there Enter/Space drop the tile
        // and dnd-kit handles them.
        if (e.target !== e.currentTarget) return;
        if (dragActive) return;
        if (e.key === 'Enter') {
          // Without preventDefault, the same Enter press would also activate
          // the dialog's first button (Close) and shut it straight away.
          e.preventDefault();
          openTileEditor(tile.id);
        }
        else if (e.key === 'Delete' || e.key === 'Backspace') actions.removeTile(tile.id);
        else listeners?.onKeyDown?.(e);
      }}
    >
      {/* inert: links and embeds inside a tile can't be tabbed to or clicked
          while editing (the tile itself is the focus stop). */}
      <div className="tile-inert" inert="">
        <Tile tile={tile} />
      </div>
      <div className="tile-shield" onClick={openEditor} aria-hidden="true" />
      <TileBadges tile={tile} />

      <div className="tile-controls tile-controls--top" {...controlGuards}>
        <button type="button" className="tile-control" onClick={() => actions.duplicateTile(tile.id)} aria-label="Duplicate tile" title="Duplicate">
          <Icon name="duplicate" size={16} />
        </button>
        <button type="button" className="tile-control" onClick={() => openTileEditor(tile.id)} aria-label="Edit tile" title="Edit">
          <Icon name="pencil" size={16} />
        </button>
        <button type="button" className="tile-control tile-control--danger" onClick={() => actions.removeTile(tile.id)} aria-label="Delete tile" title="Delete">
          <Icon name="trash" size={16} />
        </button>
      </div>

      {presets.length > 1 && (
        <div className="tile-controls tile-controls--sizes" {...controlGuards} role="group" aria-label="Tile size">
          {presets.map((p) => {
            const active = tile.w === p.w && tile.h === p.h;
            return (
              <button
                key={p.key}
                type="button"
                className={`tile-control ${active ? 'is-active' : ''}`}
                onClick={() => actions.resizeTile(tile.id, p.w, p.h)}
                aria-pressed={active}
                aria-label={p.label}
                title={p.label}
              >
                <Icon name={`size-${p.key}`} size={16} />
              </button>
            );
          })}
        </div>
      )}

      {canResize && (
        <span
          className="resize-handle"
          onPointerDown={onResizeStart}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeEnd}
          onPointerCancel={onResizeEnd}
          onMouseDown={stop}
          onTouchStart={stop}
          title="Drag to resize"
          aria-hidden="true"
        >
          <Icon name="resize" size={14} />
        </span>
      )}
      {resizing && (
        <span className="resize-badge">
          {tile.w} × {tile.h}
        </span>
      )}
    </li>
  );
}
