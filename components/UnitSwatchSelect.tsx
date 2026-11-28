"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

type SwatchOption = { value: string; label: string; swatch?: string; disabled: boolean };

export function UnitSwatchSelect({ label, unit, options, value, placeholder, onChange, invalid, missing }: {
  label: string; unit: number; options: SwatchOption[]; value: string; placeholder: string;
  onChange: (value: string) => void; invalid?: boolean; missing?: boolean;
}) {
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const search = useRef({ text: "", time: 0 });
  const [active, setActive] = useState<number | null>(null);
  const selected = options.find(option => option.value === value);
  const enabled = options.map((option, index) => option.disabled ? -1 : index).filter(index => index >= 0);
  const initial = selected && !selected.disabled ? options.indexOf(selected) : enabled[0];
  const open = active !== null;
  const name = `${label} ליחידה ${unit}`;

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setActive(null);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  useEffect(() => {
    if (active !== null) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, listId]);

  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    setActive(null);
  }

  function navigate(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey || !enabled.length) return;
    const last = enabled.length - 1;
    const position = active === null ? -1 : enabled.indexOf(active);
    switch (event.key) {
      case "ArrowDown": setActive(active === null ? initial : enabled[Math.min(last, position + 1)]); break;
      case "ArrowUp": setActive(active === null ? initial : enabled[Math.max(0, position - 1)]); break;
      case "Home": setActive(enabled[0]); break;
      case "End": setActive(enabled[last]); break;
      case "Tab":
        if (active !== null) choose(active);
        return;
      case "Enter":
      case " ":
        if (active === null) setActive(initial);
        else choose(active);
        break;
      case "Escape":
        if (!open) return;
        event.stopPropagation();
        setActive(null);
        break;
      default: {
        if (event.key.length !== 1) return;
        const time = Date.now();
        const text = (time - search.current.time < 600 ? search.current.text : "") + event.key.toLocaleLowerCase();
        search.current = { text, time };
        const match = enabled.find(index => options[index].label.toLocaleLowerCase().startsWith(text));
        if (match !== undefined) setActive(match);
      }
    }
    event.preventDefault();
  }

  return <div className="unit-swatch-field" ref={root}>
    <label htmlFor={listId + "-trigger"}>{label}</label>
    <button type="button" id={listId + "-trigger"} className="plain unit-swatch-trigger" role="combobox"
      aria-label={name} aria-expanded={open} aria-controls={listId} aria-invalid={invalid}
      aria-activedescendant={active === null ? undefined : `${listId}-${active}`}
      disabled={!enabled.length} data-missing={missing || undefined} onBlur={() => setActive(null)}
      onClick={() => setActive(open ? null : initial)} onKeyDown={navigate}>
      {selected?.swatch && <span aria-hidden="true" className="swatch-dot" style={{ background: selected.swatch }} />}
      <span>{selected?.label ?? placeholder}</span>
    </button>
    <ul id={listId} role="listbox" aria-label={name} className="unit-swatch-list" hidden={!open}>
      {open && options.map((option, index) => <li key={option.value} role="option" id={`${listId}-${index}`}
        aria-selected={value === option.value} aria-disabled={option.disabled} data-active={active === index || undefined}
        onMouseDown={event => event.preventDefault()} onClick={() => choose(index)}>
        {option.swatch && <span aria-hidden="true" className="swatch-dot" style={{ background: option.swatch }} />}
        <span>{option.label}</span>
      </li>)}
    </ul>
  </div>;
}
