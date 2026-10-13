import { useState } from 'react';
import LockGate from './LockGate.jsx';
import Tile, { cellClassName, cellStyle } from './Tile.jsx';

/**
 * Tell the hovered tile where the pointer is (--mx/--my), for the Crystal
 * card style's moving highlight. Cheap: two CSS variables, no re-render.
 */
export function trackPointer(e) {
  if (e.pointerType !== 'mouse' || document.documentElement.dataset.cards !== 'crystal') return;
  const cell = e.target.closest('.tile-cell');
  if (!cell) return;
  const r = cell.getBoundingClientRect();
  cell.style.setProperty('--mx', `${e.clientX - r.left}px`);
  cell.style.setProperty('--my', `${e.clientY - r.top}px`);
}

/**
 * Read-only tile grid for visitors.
 * Tile placement is pure CSS grid (see styles/base.css): each tile spans
 * `w` columns and `h` rows via its "w-N" and "h-N" classes, and
 * `grid-auto-flow: dense` packs small tiles into gaps left by bigger ones.
 *
 * Locked cards show a LockGate over them until the visitor passes it; a
 * code lock then swaps in the content the server sent back.
 *
 * @param {{ tiles: import('../lib/types.js').Tile[] }} props
 */
export default function TileGrid({ tiles }) {
  /** id -> unlocked data (or true for sensitive/age gates). */
  const [unlocked, setUnlocked] = useState({});
  return (
    <div className="tile-grid-container">
      <ul className="tile-grid" onPointerMove={trackPointer}>
        {tiles.map((tile, i) => {
          const open = unlocked[tile.id];
          const locked = tile.lock && !open;
          const shown = open && typeof open === 'object' ? { ...tile, data: { ...tile.data, ...open } } : tile;
          return (
            // --i staggers the entrance animation (see "Animations" in base.css).
            <li
              key={tile.id}
              data-tile-id={tile.id}
              className={`${cellClassName(tile)} ${locked ? 'is-locked' : ''}`}
              style={cellStyle(tile, { '--i': Math.min(i, 14) })}
            >
              {!locked ? (
                <Tile tile={shown} />
              ) : (
                tile.lock.type !== 'code' && (
                  // Sensitive / age gates: the card is there, blurred, behind the notice.
                  <div className="tile-lockable" inert="" aria-hidden="true">
                    <Tile tile={tile} />
                  </div>
                )
              )}
              {locked && <LockGate tile={tile} onUnlocked={(data) => setUnlocked((u) => ({ ...u, [tile.id]: data || true }))} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
