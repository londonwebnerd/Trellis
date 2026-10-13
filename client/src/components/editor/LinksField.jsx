/**
 * Editor for a link list: rows of label + URL that can be added, removed
 * and reordered by dragging the handle (dnd-kit sortable list).
 */
import { useRef } from 'react';
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { detectPlatform } from '../../lib/platforms.js';
import { BrandBadge, Icon } from '../Icons.jsx';

let rowCounter = 0;
const rowId = () => `row-${++rowCounter}`;

/** Accept "example.com" or an email address and turn it into a real link. */
function normaliseUrl(raw) {
  const s = raw.trim();
  if (!s) return '';
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return `mailto:${s}`;
  if (/^(https?:|mailto:|tel:)/i.test(s)) return s;
  return `https://${s}`;
}

function Row({ id, link, onChange, onRemove }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id });
  const platform = /^mailto:/i.test(link.url) ? 'email' : detectPlatform(link.url);
  return (
    <li ref={setNodeRef} className={`links-field__row ${isDragging ? 'is-dragging' : ''}`} style={{ transform: CSS.Translate.toString(transform), transition }}>
      <button type="button" className="links-field__handle" {...attributes} {...listeners} aria-label="Drag to reorder">
        <Icon name="grip" size={16} />
      </button>
      <BrandBadge platform={platform} size={28} className="links-field__badge" />
      <div className="links-field__inputs">
        <input className="input" placeholder="Label" maxLength={80} value={link.label} onChange={(e) => onChange({ ...link, label: e.target.value })} aria-label="Link label" />
        <input
          className="input"
          placeholder="https://… or email"
          value={link.url}
          onChange={(e) => onChange({ ...link, url: e.target.value })}
          onBlur={(e) => onChange({ ...link, url: normaliseUrl(e.target.value) })}
          aria-label="Link URL"
        />
      </div>
      <button type="button" className="icon-button" onClick={onRemove} aria-label="Remove link" title="Remove">
        <Icon name="trash" size={16} />
      </button>
    </li>
  );
}

/**
 * @param {{ value: { label: string, url: string }[], onChange: (links: object[]) => void }} props
 */
export default function LinksField({ value = [], onChange }) {
  // Stable ids for drag-and-drop (links themselves don't have ids).
  const ids = useRef([]);
  while (ids.current.length < value.length) ids.current.push(rowId());
  if (ids.current.length > value.length) ids.current.length = value.length;

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const update = (index, link) => onChange(value.map((l, i) => (i === index ? link : l)));
  const remove = (index) => {
    ids.current.splice(index, 1);
    onChange(value.filter((_, i) => i !== index));
  };
  const add = () => onChange([...value, { label: '', url: '' }]);

  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const from = ids.current.indexOf(active.id);
    const to = ids.current.indexOf(over.id);
    ids.current = arrayMove(ids.current, from, to);
    onChange(arrayMove(value, from, to));
  };

  return (
    <div className="links-field">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids.current} strategy={verticalListSortingStrategy}>
          <ul>
            {value.map((link, i) => (
              <Row key={ids.current[i]} id={ids.current[i]} link={link} onChange={(l) => update(i, l)} onRemove={() => remove(i)} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <button type="button" className="button button--secondary" onClick={add}>
        <Icon name="plus" size={16} /> Add link
      </button>
    </div>
  );
}
