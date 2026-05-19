interface DecisionButtonsProps {
  onDrop: () => void;
  onInfo: () => void;
  onKeep: () => void;
  disabled?: boolean;
}

export function DecisionButtons({ onDrop, onInfo, onKeep, disabled }: DecisionButtonsProps) {
  return (
    <div className="flex justify-center gap-4">
      <Ctrl variant="drop" onClick={onDrop} disabled={disabled} title="Mark for delete (←)">
        <svg viewBox="0 0 24 24" className="w-[22px] h-[22px] stroke-current fill-none stroke-[1.4]">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </Ctrl>
      <Ctrl variant="info" onClick={onInfo} disabled={disabled} title="Details (space)">
        <svg viewBox="0 0 24 24" className="w-[22px] h-[22px] stroke-current fill-none stroke-[1.4]">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 10v7M12 7v.5" />
        </svg>
      </Ctrl>
      <Ctrl variant="keep" onClick={onKeep} disabled={disabled} title="Keep (→)">
        <svg viewBox="0 0 24 24" className="w-[22px] h-[22px] stroke-current fill-none stroke-[1.4]">
          <path d="M12 21s-7-4.5-9.5-9.5C.5 7.5 4 4 7 4c2 0 3.5 1.5 5 3 1.5-1.5 3-3 5-3 3 0 6.5 3.5 4.5 7.5C19 16.5 12 21 12 21z" />
        </svg>
      </Ctrl>
    </div>
  );
}

interface CtrlProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant: 'drop' | 'info' | 'keep';
}

function Ctrl({ variant, className = '', ...props }: CtrlProps) {
  const styles: Record<typeof variant, string> = {
    drop: 'text-danger border-danger hover:bg-danger hover:text-bg',
    info: 'text-muted border-border hover:text-text hover:border-text',
    keep: 'text-text border-border hover:bg-text hover:text-bg',
  };
  return (
    <button
      {...props}
      className={`w-[60px] h-[60px] grid place-items-center border transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${styles[variant]} ${className}`}
    />
  );
}
