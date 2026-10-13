import { Component } from 'react';
import { shapeOf } from '../lib/layout.js';
import { TILE_TYPES } from '../lib/tileRegistry.js';

/**
 * Error boundary so one misconfigured tile can't blank the whole page.
 * (Error boundaries still have to be class components in React 18.)
 */
class TileErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('Tile failed to render:', error);
  }

  componentDidUpdate(prevProps) {
    // Retry after the tile's data has been edited.
    if (this.state.failed && prevProps.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    return this.state.failed ? <div className="tile-empty">This tile couldn’t be displayed</div> : this.props.children;
  }
}

/**
 * CSS classes for a tile's grid cell: width, height, shape and type, plus
 * its own colours and spotlight animation if it has them.
 */
export const cellClassName = (tile) =>
  [
    `tile-cell w-${tile.w} h-${tile.h} shape-${shapeOf(tile)} type-${tile.type}`,
    (tile.style?.bg || tile.style?.text) && 'has-own-colors',
    tile.style?.animation && tile.style.animation !== 'none' && `spotlight spotlight--${tile.style.animation}`,
  ]
    .filter(Boolean)
    .join(' ');

/**
 * Per-card colours: the card's own --card/--text (and derived muted/border
 * colours), so everything inside follows without special cases.
 */
export function cellStyle(tile, extra = {}) {
  const { bg, text } = tile.style || {};
  const style = { ...extra };
  if (bg) {
    style['--card'] = bg;
    style['--card-muted'] = `color-mix(in srgb, ${text || 'var(--text)'} 8%, ${bg})`;
  }
  if (text) {
    style['--text'] = text;
    style['--muted'] = `color-mix(in srgb, ${text} 68%, ${bg || 'var(--card)'})`;
    style['--border'] = `color-mix(in srgb, ${text} 12%, transparent)`;
  }
  return style;
}

/**
 * Renders a tile's content by looking its type up in the registry, passing
 * its rough `shape` (see lib/layout.js). Layout (grid spans, card chrome)
 * is handled by the parent grid via `cellClassName()`.
 *
 * @param {{ tile: import('../lib/types.js').Tile }} props
 */
export default function Tile({ tile }) {
  const def = TILE_TYPES[tile.type];
  if (!def) return null;
  const Content = def.component;
  return (
    <TileErrorBoundary resetKey={JSON.stringify(tile.data)}>
      <Content tile={tile} shape={shapeOf(tile)} />
    </TileErrorBoundary>
  );
}
