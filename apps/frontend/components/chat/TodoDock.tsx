
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Todo } from '@opencode-ai/sdk/v2/client';
import { animate, type AnimationPlaybackControls } from 'motion';
import { AnimatedNumber } from './AnimatedNumber';
import { prefersReducedMotion } from './message-helpers';

function PulsingDot() {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" fill="currentColor" data-slot="todo-dot">
      <circle cx="6" cy="6" r="3" />
    </svg>
  );
}

function TodoCheckbox({ todo }: { todo: Todo }) {
  const isCompleted = todo.status === 'completed' || todo.status === 'cancelled';
  const isInProgress = todo.status === 'in_progress';
  const isPending = todo.status === 'pending';

  return (
    <label
      data-component="todo-dock-checkbox"
      data-checked={isCompleted ? '' : undefined}
      data-in-progress={isInProgress ? '' : undefined}
      data-state={todo.status}
      style={{
        opacity: isPending ? 0.94 : 1,
      }}
    >
      <span data-slot="todo-dock-checkbox-control">
        {isCompleted && (
          <svg viewBox="0 0 12 12" fill="none" width="10" height="10" data-slot="todo-dock-check-icon">
            <path d="M3 7.17905L5.02703 8.85135L9 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
          </svg>
        )}
        {isInProgress && <PulsingDot />}
      </span>
      <span
        data-slot="todo-dock-content"
        data-completed={isCompleted ? '' : undefined}
      >
        {todo.content}
      </span>
    </label>
  );
}

function TodoList({ todos, open }: { todos: Todo[]; open: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  const scrollTimer = useRef<number | undefined>(undefined);
  const scrollingRef = useRef(false);

  const inProgressIdx = useMemo(
    () => todos.findIndex((t) => t.status === 'in_progress'),
    [todos],
  );

  useEffect(() => {
    if (!open || inProgressIdx < 0) return;
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      if (scrollingRef.current) return;
      const target = el.querySelector('[data-in-progress]');
      if (!(target instanceof HTMLElement)) return;

      const topFade = 16;
      const bottomFade = 44;
      const container = el.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      const top = rect.top - container.top + el.scrollTop;
      const bottom = rect.bottom - container.top + el.scrollTop;
      const viewTop = el.scrollTop + topFade;
      const viewBottom = el.scrollTop + el.clientHeight - bottomFade;

      if (top < viewTop) {
        el.scrollTop = Math.max(0, top - topFade);
      } else if (bottom > viewBottom) {
        el.scrollTop = bottom - (el.clientHeight - bottomFade);
      }
      setStuck(el.scrollTop > 0);
    });
  }, [open, inProgressIdx]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    setStuck(el.scrollTop > 0);
    scrollingRef.current = true;
    if (scrollTimer.current) window.clearTimeout(scrollTimer.current);
    scrollTimer.current = window.setTimeout(() => {
      scrollingRef.current = false;
    }, 250);
  }, []);

  useEffect(() => {
    return () => {
      if (scrollTimer.current) window.clearTimeout(scrollTimer.current);
    };
  }, []);

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        data-slot="todo-dock-list"
        onScroll={handleScroll}
        style={{ overflowAnchor: 'none' }}
      >
        {todos.map((todo, i) => (
          <TodoCheckbox key={i} todo={todo} />
        ))}
      </div>
      <div
        data-slot="todo-dock-fade-top"
        style={{ opacity: stuck ? 1 : 0 }}
      />
    </div>
  );
}

const SPRING = { type: 'spring' as const, visualDuration: 0.3, bounce: 0 };
const COLLAPSED_HEIGHT = 44;

export const TodoDock = memo(function TodoDock({ todos }: { todos: Todo[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<AnimationPlaybackControls | null>(null);
  const [contentHeight, setContentHeight] = useState(320);
  const isFirst = useRef(true);

  const total = todos.length;
  const done = useMemo(() => todos.filter((t) => t.status === 'completed').length, [todos]);
  const active = useMemo(
    () =>
      todos.find((t) => t.status === 'in_progress') ??
      todos.find((t) => t.status === 'pending') ??
      todos.filter((t) => t.status === 'completed').at(-1) ??
      todos[0],
    [todos],
  );
  const preview = active?.content ?? '';

  // Measure content height
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const update = () => setContentHeight(el.getBoundingClientRect().height);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Animate collapse/expand
  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    const el = contentRef.current?.parentElement;
    if (!el) return;

    if (prefersReducedMotion()) {
      const full = Math.max(COLLAPSED_HEIGHT, contentHeight);
      el.style.maxHeight = collapsed ? `${COLLAPSED_HEIGHT}px` : `${full}px`;
      return;
    }

    animRef.current?.stop();
    const full = Math.max(COLLAPSED_HEIGHT, contentHeight);
    const target = collapsed ? COLLAPSED_HEIGHT : full;
    animRef.current = animate(el, { maxHeight: `${target}px` }, SPRING);
    return () => { animRef.current?.stop(); };
  }, [collapsed, contentHeight]);

  const toggle = useCallback(() => setCollapsed((v) => !v), []);

  const fullHeight = Math.max(COLLAPSED_HEIGHT, contentHeight);

  return (
    <div
      data-component="todo-dock"
      style={{
        maxHeight: `${fullHeight}px`,
        overflowX: 'visible',
        overflowY: 'hidden',
      }}
    >
      <div ref={contentRef}>
        {/* Header */}
        <div
          data-slot="todo-dock-header"
          role="button"
          tabIndex={0}
          onClick={toggle}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            toggle();
          }}
        >
          <span data-slot="todo-dock-progress" aria-label={`${done} of ${total}`}>
            <AnimatedNumber value={done} />
            <span> of </span>
            <AnimatedNumber value={total} />
          </span>

          <div data-slot="todo-dock-preview">
            {collapsed && preview && (
              <span data-slot="todo-dock-preview-text">{preview}</span>
            )}
          </div>

          <button
            type="button"
            data-slot="todo-dock-toggle"
            onClick={(e) => {
              e.stopPropagation();
              toggle();
            }}
            aria-label={collapsed ? 'Expand todos' : 'Collapse todos'}
          >
            <svg
              viewBox="0 0 20 20"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeLinecap="square"
              style={{
                transform: `rotate(${collapsed ? 180 : 0}deg)`,
                transition: 'transform 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            >
              <path d="M6.6665 8.33325L9.99984 11.6666L13.3332 8.33325" />
            </svg>
          </button>
        </div>

        {/* Todo list */}
        <div
          data-slot="todo-dock-body"
          aria-hidden={collapsed}
          style={{
            opacity: collapsed ? 0 : 1,
            visibility: collapsed ? 'hidden' : 'visible',
            transition: 'opacity 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          <TodoList todos={todos} open={!collapsed} />
        </div>
      </div>
    </div>
  );
});
