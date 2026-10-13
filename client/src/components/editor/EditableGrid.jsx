/**
 * Drag-and-drop version of the tile grid, built on dnd-kit.
 *
 * Tiles have different sizes, so instead of letting dnd-kit animate
 * siblings with transforms (which distorts mixed sizes), we reorder the real
 * list *while dragging* (onDragOver) and let CSS grid reflow. The dragged
 * tile follows the pointer in a <DragOverlay>, and the whole gesture is a
 * single undo step.
 *
 * Works with mouse, touch (long-press) and keyboard (focus a tile, press
 * Space, use arrow keys, Space again to drop).
 */
import { useRef, useState } from 'react';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { trackPointer } from '../TileGrid.jsx';
import Tile, { cellClassName } from '../Tile.jsx';
import { useEditor } from './EditorContext.js';
import { dragClock } from './dragClock.js';
import SortableTile from './SortableTile.jsx';

/** No sibling transforms: the grid itself reflows as the order changes. */
const noTransformStrategy = () => null;

export default function EditableGrid() {
  const { page, actions, setSelectedId } = useEditor();
  const [activeId, setActiveId] = useState(null);
  const gesture = useRef({ id: 0, lastOver: null });

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeTile = page.tiles.find((t) => t.id === activeId);

  const onDragStart = ({ active }) => {
    gesture.current = { id: gesture.current.id + 1, lastOver: null };
    actions.checkpoint();
    setActiveId(active.id);
    setSelectedId(active.id);
  };

  const onDragOver = ({ active, over }) => {
    // Only react when the hovered tile *changes*; prevents two tiles of
    // different sizes from endlessly swapping under a stationary pointer.
    if (!over || over.id === active.id || over.id === gesture.current.lastOver) return;
    gesture.current.lastOver = over.id;
    actions.moveTile(active.id, over.id, gesture.current.id);
  };

  const onDragEnd = () => {
    setActiveId(null);
    dragClock.endedAt = Date.now();
    actions.checkpoint();
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragEnd}
    >
      {/* Tapping empty space deselects the current tile (touch screens). */}
      <div className="tile-grid-container" onClick={(e) => !e.target.closest('.tile-cell') && setSelectedId(null)}>
        <SortableContext items={page.tiles.map((t) => t.id)} strategy={noTransformStrategy}>
          <ul className="tile-grid tile-grid--editing" onPointerMove={trackPointer}>
            {page.tiles.map((tile) => (
              <SortableTile key={tile.id} tile={tile} />
            ))}
          </ul>
        </SortableContext>
        {page.tiles.length === 0 && <p className="tile-grid-empty">Your page is empty. Click “Add” below to create your first tile.</p>}
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: 'ease-out' }}>
        {activeTile && (
          <div className={`${cellClassName(activeTile)} tile-cell--overlay`}>
            <Tile tile={activeTile} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
