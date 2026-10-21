import { useRef, useState } from 'react';
import { BUSINESS_TYPES, BUSINESSES, STAGES, teamPhoto, useBusiness, type BusinessType, type Stage } from '../business';
import { Icon } from './Icon';

/** Round headshot (from the current business's team photos), falling back to the person's initial. */
export function Avatar({ name, photo, size = 36 }: { name: string; photo?: string | null; size?: number }) {
  const { type } = useBusiness();
  const src = teamPhoto(type, photo);
  const style = { width: size, height: size, fontSize: size * 0.42 };
  return src ? (
    <img className="avatar avatar-photo" src={src} alt="" width={size} height={size} style={style} loading="lazy" />
  ) : (
    <span className="avatar" style={style} aria-hidden>
      {name.charAt(0)}
    </span>
  );
}

/** Horizontal progress through a project's stages, named for the current business. */
export function StageTracker({ stage, compact }: { stage: Stage; compact?: boolean }) {
  const { config } = useBusiness();
  const current = STAGES.indexOf(stage);
  return (
    <div className={`stages ${compact ? 'stages-compact' : ''}`}>
      <ol aria-label={`Stage: ${config.stages[stage]}`}>
        {STAGES.map((s, i) => (
          <li key={s} className={i < current || stage === 'done' ? 'done' : i === current ? 'current' : ''}>
            <span className="stage-dot" aria-hidden />
            <span className="stage-label">{config.stages[s]}</span>
          </li>
        ))}
      </ol>
      {!compact && <p className="muted small stage-help">{config.stageHelp[stage]}</p>}
    </div>
  );
}

/**
 * File picker for the demo. Only the chosen file's name and size are sent to the server;
 * the contents never leave the browser.
 */
export function FilePicker({
  label = 'Choose a file',
  onPick,
  disabled,
}: {
  label?: string;
  onPick: (file: { fileName: string; sizeBytes: number }) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const pick = (f: File | undefined) => f && onPick({ fileName: f.name, sizeBytes: f.size });
  return (
    <div
      className={`dropzone ${over ? 'over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) pick(e.dataTransfer.files[0]);
      }}
    >
      <Icon name="upload" />
      <span>
        Drag a file here, or{' '}
        <button type="button" className="link-btn" disabled={disabled} onClick={() => input.current?.click()}>
          {label.toLowerCase()}
        </button>
      </span>
      <span className="muted small">Demo: only the file's name and size are recorded. The file itself is never uploaded.</span>
      <input
        ref={input}
        type="file"
        hidden
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

/** A project's stage as a colored badge, named for the current business. */
export function StageBadge({ stage }: { stage: Stage }) {
  const { config } = useBusiness();
  return <span className={`badge badge-${stageTone[stage]}`}>{config.stages[stage]}</span>;
}

const stageTone: Record<Stage, string> = { new: 'gray', planning: 'blue', active: 'amber', review: 'blue', done: 'green' };

/** Business-type picker: the owner's setting, or on the demo, the visitor's own view. */
export function BusinessPicker({ compact }: { compact?: boolean }) {
  const { type, switchTo } = useBusiness();
  const [busy, setBusy] = useState<BusinessType | null>(null);
  return (
    <div className={`biz-picker ${compact ? 'biz-picker-compact' : ''}`} role="group" aria-label="Business type">
      {BUSINESS_TYPES.map((t) => (
        <button
          key={t}
          type="button"
          className={t === type ? 'active' : ''}
          aria-pressed={t === type}
          disabled={!!busy}
          onClick={async () => {
            if (t === type) return;
            setBusy(t);
            try {
              await switchTo(t);
            } catch (e) {
              alert((e as Error).message);
              setBusy(null);
            }
          }}
        >
          <Icon name={BUSINESSES[t].icon} />
          <span>{busy === t ? 'Switching…' : BUSINESSES[t].label}</span>
        </button>
      ))}
    </div>
  );
}
