
import { memo, useEffect, useRef, useState } from 'react';

const TRACK = Array.from({ length: 30 }, (_, i) => i % 10);
const DURATION = 600;

function normalize(value: number) {
  return ((value % 10) + 10) % 10;
}

function spin(from: number, to: number, direction: 1 | -1) {
  if (from === to) return 0;
  if (direction > 0) return (to - from + 10) % 10;
  return -((from - to + 10) % 10);
}

function Digit({ value, direction }: { value: number; direction: 1 | -1 }) {
  const [step, setStep] = useState(value + 10);
  const [animating, setAnimating] = useState(false);
  const lastRef = useRef(value);

  useEffect(() => {
    const delta = spin(lastRef.current, value, direction);
    lastRef.current = value;
    if (!delta) {
      setAnimating(false);
      setStep(value + 10);
      return;
    }
    setAnimating(true);
    setStep((prev) => prev + delta);
  }, [value, direction]);

  return (
    <span data-slot="animated-number-digit">
      <span
        data-slot="animated-number-strip"
        data-animating={animating ? 'true' : 'false'}
        onTransitionEnd={() => {
          setAnimating(false);
          setStep(normalize(step) + 10);
        }}
        style={
          {
            '--animated-number-offset': `${step}`,
            '--animated-number-duration': `var(--tool-motion-odometer-ms, ${DURATION}ms)`,
          } as React.CSSProperties
        }
      >
        {TRACK.map((v, i) => (
          <span key={i} data-slot="animated-number-cell">
            {v}
          </span>
        ))}
      </span>
    </span>
  );
}

export const AnimatedNumber = memo(function AnimatedNumber({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const target = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;

  const [current, setCurrent] = useState(target);
  const [direction, setDirection] = useState<1 | -1>(1);

  useEffect(() => {
    if (target === current) return;
    setDirection(target > current ? 1 : -1);
    setCurrent(target);
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps

  const label = current.toString();
  const digits = Array.from(label, (char) => {
    const code = char.charCodeAt(0) - 48;
    return code >= 0 && code <= 9 ? code : 0;
  }).reverse();

  const width = `${digits.length}ch`;

  return (
    <span data-component="animated-number" className={className} aria-label={label}>
      <span data-slot="animated-number-value" style={{ '--animated-number-width': width } as React.CSSProperties}>
        {digits.map((digit, i) => (
          <Digit key={i} value={digit} direction={direction} />
        ))}
      </span>
    </span>
  );
});
