
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { QuestionRequest } from '@opencode-ai/sdk/v2/client';

type QuestionDockProps = {
  request: QuestionRequest;
  onReply: (input: { requestID: string; answers: string[][] }) => void;
  onReject: (input: { requestID: string }) => void;
};

export const QuestionDock = memo(function QuestionDock({ request, onReply, onReject }: QuestionDockProps) {
  const questions = request.questions;
  const total = questions.length;

  const [tab, setTab] = useState(0);
  const [answers, setAnswers] = useState<string[][]>(() => questions.map(() => []));
  const [custom, setCustom] = useState<string[]>(() => questions.map(() => ''));
  const [customOn, setCustomOn] = useState<boolean[]>(() => questions.map(() => false));
  const [editing, setEditing] = useState(false);
  const [sending, setSending] = useState(false);

  const question = questions[tab];
  const options = question?.options ?? [];
  const multi = question?.multiple === true;
  const input = custom[tab] ?? '';
  const on = customOn[tab] === true;
  const isLast = tab >= total - 1;
  const selected = answers[tab] ?? [];

  const canSubmit = useMemo(
    () => questions.every((_, i) => (answers[i]?.length ?? 0) > 0),
    [answers, questions],
  );

  // --- Selection logic ---

  const pick = useCallback((label: string, isCustom = false) => {
    setAnswers((prev) => {
      const next = prev.map((a) => a.slice());
      next[tab] = [label];
      return next;
    });
    if (isCustom) {
      setCustom((prev) => { const n = prev.slice(); n[tab] = label; return n; });
    }
    if (!isCustom) {
      setCustomOn((prev) => { const n = prev.slice(); n[tab] = false; return n; });
    }
    setEditing(false);
  }, [tab]);

  const toggle = useCallback((label: string) => {
    setAnswers((prev) => {
      const next = prev.map((a) => a.slice());
      const current = next[tab] ?? [];
      next[tab] = current.includes(label)
        ? current.filter((item) => item !== label)
        : [...current, label];
      return next;
    });
  }, [tab]);

  const customUpdate = useCallback((value: string, isSelected: boolean = on) => {
    const prev = input.trim();
    const next = value.trim();
    setCustom((p) => { const n = p.slice(); n[tab] = value; return n; });

    if (!isSelected) return;

    if (multi) {
      setAnswers((p) => {
        const a = p.map((x) => x.slice());
        const current = a[tab] ?? [];
        const removed = prev ? current.filter((item) => item.trim() !== prev) : current;
        if (!next) { a[tab] = removed; return a; }
        if (removed.some((item) => item.trim() === next)) { a[tab] = removed; return a; }
        a[tab] = [...removed, next];
        return a;
      });
      return;
    }
    setAnswers((p) => {
      const a = p.map((x) => x.slice());
      a[tab] = next ? [next] : [];
      return a;
    });
  }, [tab, multi, on, input]);

  const commitCustom = useCallback(() => {
    setEditing(false);
    customUpdate(input);
  }, [customUpdate, input]);

  const customOpen = useCallback(() => {
    if (sending) return;
    if (!on) setCustomOn((p) => { const n = p.slice(); n[tab] = true; return n; });
    setEditing(true);
    customUpdate(input, true);
  }, [sending, on, tab, customUpdate, input]);

  const customToggle = useCallback(() => {
    if (sending) return;
    if (!multi) {
      setCustomOn((p) => { const n = p.slice(); n[tab] = true; return n; });
      setEditing(true);
      customUpdate(input, true);
      return;
    }
    const next = !on;
    setCustomOn((p) => { const n = p.slice(); n[tab] = next; return n; });
    if (next) {
      setEditing(true);
      customUpdate(input, true);
      return;
    }
    const value = input.trim();
    if (value) {
      setAnswers((p) => {
        const a = p.map((x) => x.slice());
        a[tab] = (a[tab] ?? []).filter((item) => item.trim() !== value);
        return a;
      });
    }
    setEditing(false);
  }, [sending, multi, on, tab, customUpdate, input]);

  const selectOption = useCallback((optIndex: number) => {
    if (sending) return;
    if (optIndex === options.length) {
      customOpen();
      return;
    }
    const opt = options[optIndex];
    if (!opt) return;
    if (multi) {
      toggle(opt.label);
      return;
    }
    pick(opt.label);
  }, [sending, options, multi, toggle, pick, customOpen]);

  // --- Navigation ---

  const submit = useCallback(() => {
    setSending(true);
    const finalAnswers = questions.map((_, i) => answers[i] ?? []);
    onReply({ requestID: request.id, answers: finalAnswers });
  }, [questions, answers, request.id, onReply]);

  const next = useCallback(() => {
    if (sending) return;
    if (editing) commitCustom();
    if (isLast) { submit(); return; }
    setTab((t) => t + 1);
    setEditing(false);
  }, [sending, editing, commitCustom, isLast, submit]);

  const back = useCallback(() => {
    if (sending || tab <= 0) return;
    setTab((t) => t - 1);
    setEditing(false);
  }, [sending, tab]);

  const jump = useCallback((t: number) => {
    if (sending) return;
    setTab(t);
    setEditing(false);
  }, [sending]);

  const dismiss = useCallback(() => {
    if (sending) return;
    setSending(true);
    onReject({ requestID: request.id });
  }, [sending, request.id, onReject]);

  if (!question) return null;

  return (
    <div data-component="question-dock">
      {/* Shell (elevated surface) */}
      <div data-slot="question-dock-shell">
        {/* Header */}
        <div data-slot="question-dock-header">
          <span data-slot="question-dock-title">
            {total > 1 ? `Question ${tab + 1} of ${total}` : 'Question'}
          </span>
          {total > 1 && (
            <div data-slot="question-dock-progress">
              {questions.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  data-slot="question-dock-segment"
                  data-active={i === tab || undefined}
                  data-answered={(answers[i]?.length ?? 0) > 0 || undefined}
                  disabled={sending}
                  onClick={() => jump(i)}
                  aria-label={`Question ${i + 1}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div data-slot="question-dock-content">
          <div data-slot="question-dock-text">{question.question}</div>
          <div data-slot="question-dock-hint">
            {multi ? 'Select all that apply' : 'Choose one'}
          </div>

          <div data-slot="question-dock-options">
            {options.map((opt, i) => {
              const picked = selected.includes(opt.label);
              return (
                <button
                  key={opt.label}
                  type="button"
                  data-slot="question-dock-option"
                  data-picked={picked || undefined}
                  role={multi ? 'checkbox' : 'radio'}
                  aria-checked={picked}
                  disabled={sending}
                  onClick={() => selectOption(i)}
                >
                  <span data-slot="question-dock-option-check" aria-hidden="true">
                    <span
                      data-slot="question-dock-option-box"
                      data-type={multi ? 'checkbox' : 'radio'}
                      data-picked={picked || undefined}
                    >
                      {multi
                        ? <CheckIcon />
                        : <span data-slot="question-dock-option-radio-dot" />
                      }
                    </span>
                  </span>
                  <span data-slot="question-dock-option-main">
                    <span data-slot="question-dock-option-label">{opt.label}</span>
                    {opt.description && (
                      <span data-slot="question-dock-option-desc">{opt.description}</span>
                    )}
                  </span>
                </button>
              );
            })}

            {/* Custom answer option */}
            {question.custom !== false && (
              editing ? (
                <CustomEditOption
                  multi={multi}
                  on={on}
                  input={input}
                  sending={sending}
                  onInput={(v) => customUpdate(v)}
                  onToggle={customToggle}
                  onCommit={commitCustom}
                  onCancel={() => setEditing(false)}
                />
              ) : (
                <button
                  type="button"
                  data-slot="question-dock-option"
                  data-custom="true"
                  data-picked={on || undefined}
                  role={multi ? 'checkbox' : 'radio'}
                  aria-checked={on}
                  disabled={sending}
                  onClick={customOpen}
                >
                  <span
                    data-slot="question-dock-option-check"
                    aria-hidden="true"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); customToggle(); }}
                  >
                    <span
                      data-slot="question-dock-option-box"
                      data-type={multi ? 'checkbox' : 'radio'}
                      data-picked={on || undefined}
                    >
                      {multi ? <CheckIcon /> : <span data-slot="question-dock-option-radio-dot" />}
                    </span>
                  </span>
                  <span data-slot="question-dock-option-main">
                    <span data-slot="question-dock-option-label">Type your own answer</span>
                    <span data-slot="question-dock-option-desc">
                      {input || 'Enter a custom response'}
                    </span>
                  </span>
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {/* Tray (footer) */}
      <div data-slot="question-dock-tray">
        <button
          type="button"
          data-slot="question-dock-btn"
          data-variant="ghost"
          disabled={sending}
          onClick={dismiss}
        >
          Dismiss
        </button>
        <div data-slot="question-dock-actions">
          {tab > 0 && (
            <button
              type="button"
              data-slot="question-dock-btn"
              data-variant="secondary"
              disabled={sending}
              onClick={back}
            >
              Back
            </button>
          )}
          <button
            type="button"
            data-slot="question-dock-btn"
            data-variant={isLast ? 'primary' : 'secondary'}
            disabled={sending || (isLast && !canSubmit)}
            onClick={next}
          >
            {isLast ? 'Submit' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
});

function CheckIcon() {
  return (
    <svg viewBox="0 0 12 12" fill="none" width="10" height="10" data-slot="question-dock-check-icon">
      <path d="M3 7.17905L5.02703 8.85135L9 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
    </svg>
  );
}

function CustomEditOption({
  multi, on, input, sending,
  onInput, onToggle, onCommit, onCancel,
}: {
  multi: boolean;
  on: boolean;
  input: string;
  sending: boolean;
  onInput: (value: string) => void;
  onToggle: () => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    setTimeout(() => {
      el.focus();
      el.style.height = '0px';
      el.style.height = `${el.scrollHeight}px`;
    }, 0);
  }, []);

  return (
    <form
      data-slot="question-dock-option"
      data-custom="true"
      data-picked={on || undefined}
      role={multi ? 'checkbox' : 'radio'}
      aria-checked={on}
      onMouseDown={(e) => {
        if (sending) { e.preventDefault(); return; }
        if (e.target instanceof HTMLTextAreaElement) return;
        textareaRef.current?.focus();
      }}
      onSubmit={(e) => { e.preventDefault(); onCommit(); }}
    >
      <span
        data-slot="question-dock-option-check"
        aria-hidden="true"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(); }}
      >
        <span
          data-slot="question-dock-option-box"
          data-type={multi ? 'checkbox' : 'radio'}
          data-picked={on || undefined}
        >
          {multi ? <CheckIcon /> : <span data-slot="question-dock-option-radio-dot" />}
        </span>
      </span>
      <span data-slot="question-dock-option-main">
        <span data-slot="question-dock-option-label">Type your own answer</span>
        <textarea
          ref={textareaRef}
          data-slot="question-dock-custom-input"
          placeholder="Enter a custom response"
          value={input}
          rows={1}
          disabled={sending}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); onCancel(); return; }
            if (e.key !== 'Enter' || e.shiftKey) return;
            e.preventDefault();
            onCommit();
          }}
          onInput={(e) => {
            const el = e.currentTarget;
            onInput(el.value);
            el.style.height = '0px';
            el.style.height = `${el.scrollHeight}px`;
          }}
        />
      </span>
    </form>
  );
}
