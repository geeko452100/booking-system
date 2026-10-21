import { useRef, useState } from 'react';
import { labels, MATTER_STAGES, stageHelp, teamPhoto } from '../format';
import type { MatterStage } from '../types';
import { Icon } from './Icon';

/** Round headshot, falling back to the person's initial. */
export function Avatar({ name, photo, size = 36 }: { name: string; photo?: string | null; size?: number }) {
  const src = teamPhoto(photo);
  const style = { width: size, height: size, fontSize: size * 0.42 };
  return src ? (
    <img className="avatar avatar-photo" src={src} alt="" width={size} height={size} style={style} loading="lazy" />
  ) : (
    <span className="avatar" style={style} aria-hidden>
      {name.charAt(0)}
    </span>
  );
}

/** Horizontal progress through a matter's stages. */
export function StageTracker({ stage, compact }: { stage: MatterStage; compact?: boolean }) {
  const current = MATTER_STAGES.indexOf(stage);
  return (
    <div className={`stages ${compact ? 'stages-compact' : ''}`}>
      <ol aria-label={`Stage: ${labels[stage]}`}>
        {MATTER_STAGES.map((s, i) => (
          <li key={s} className={i < current || stage === 'closed' ? 'done' : i === current ? 'current' : ''}>
            <span className="stage-dot" aria-hidden />
            <span className="stage-label">{labels[s]}</span>
          </li>
        ))}
      </ol>
      {!compact && <p className="muted small stage-help">{stageHelp[stage]}</p>}
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
