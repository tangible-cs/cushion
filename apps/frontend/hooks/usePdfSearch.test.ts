import { act, createElement, type RefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { usePdfSearch } from './usePdfSearch';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mountUsePdfSearch(eventBusRef: RefObject<any>) {
  const host = document.createElement('div');
  document.body.appendChild(host);

  const root: Root = createRoot(host);
  let hookValue: ReturnType<typeof usePdfSearch> | null = null;

  function Harness() {
    hookValue = usePdfSearch(eventBusRef);
    return null;
  }

  act(() => {
    root.render(createElement(Harness));
  });

  return {
    getHook() {
      if (!hookValue) {
        throw new Error('Hook was not mounted');
      }
      return hookValue;
    },
    cleanup() {
      act(() => {
        root.unmount();
      });
      host.remove();
    },
  };
}

describe('usePdfSearch', () => {
  let dispatch: ReturnType<typeof vi.fn>;
  let unmount: () => void;
  let getHook: () => ReturnType<typeof usePdfSearch>;

  beforeEach(() => {
    vi.useFakeTimers();
    dispatch = vi.fn();

    const mounted = mountUsePdfSearch({
      current: { dispatch },
    } as RefObject<any>);

    unmount = mounted.cleanup;
    getHook = mounted.getHook;
  });

  afterEach(() => {
    act(() => {
      vi.runOnlyPendingTimers();
    });

    unmount();
    vi.useRealTimers();
  });

  it('dispatches a find event when query changes', () => {
    act(() => {
      getHook().setSearchQuery('needle');
    });

    expect(dispatch).toHaveBeenCalledWith(
      'find',
      expect.objectContaining({
        source: null,
        type: '',
        query: 'needle',
        caseSensitive: false,
        entireWord: false,
        highlightAll: true,
        findPrevious: false,
      }),
    );
    expect(getHook().searchQuery).toBe('needle');
  });

  it('dispatches again events for next and previous search navigation', () => {
    act(() => {
      getHook().setSearchQuery('topic');
    });
    dispatch.mockClear();

    act(() => {
      getHook().handleSearch('next');
      getHook().handleSearch('prev');
    });

    expect(dispatch).toHaveBeenNthCalledWith(
      1,
      'find',
      expect.objectContaining({
        type: 'again',
        query: 'topic',
        findPrevious: false,
      }),
    );
    expect(dispatch).toHaveBeenNthCalledWith(
      2,
      'find',
      expect.objectContaining({
        type: 'again',
        query: 'topic',
        findPrevious: true,
      }),
    );
  });

  it('dispatches dedicated find events for option toggles', () => {
    act(() => {
      getHook().setSearchQuery('pdf');
    });
    dispatch.mockClear();

    act(() => {
      getHook().setCaseSensitive(true);
      getHook().setEntireWord(true);
      getHook().setHighlightAll(false);
    });

    expect(dispatch).toHaveBeenNthCalledWith(
      1,
      'find',
      expect.objectContaining({
        type: 'casesensitivitychange',
        query: 'pdf',
        caseSensitive: true,
      }),
    );
    expect(dispatch).toHaveBeenNthCalledWith(
      2,
      'find',
      expect.objectContaining({
        type: 'entirewordchange',
        query: 'pdf',
        entireWord: true,
      }),
    );
    expect(dispatch).toHaveBeenNthCalledWith(
      3,
      'find',
      expect.objectContaining({
        type: 'highlightallchange',
        query: 'pdf',
        highlightAll: false,
      }),
    );
  });

  it('dispatches findbarclose and clears local search state when closed', () => {
    act(() => {
      getHook().setSearchQuery('to-clear');
      getHook().closeSearch();
    });

    expect(dispatch).toHaveBeenCalledWith('findbarclose', { source: null });
    expect(getHook().searchQuery).toBe('');
    expect(getHook().searchMatchesCount).toEqual({ current: 0, total: 0 });
    expect(getHook().searchStatusMessage).toBe('');
  });

  it('updates find status only while search UI is open', () => {
    act(() => {
      getHook().handleFindControlState({
        state: 3,
        matchesCount: { current: 1, total: 10 },
      });
    });

    expect(getHook().searchStatusMessage).toBe('');
    expect(getHook().searchMatchesCount).toEqual({ current: 0, total: 0 });

    act(() => {
      getHook().openSearch();
      vi.runOnlyPendingTimers();
      getHook().handleFindControlState({
        state: 3,
        matchesCount: { current: 2, total: 10 },
      });
    });

    expect(getHook().searchStatusMessage).toBe('Searching...');
    expect(getHook().searchMatchesCount).toEqual({ current: 2, total: 10 });

    act(() => {
      getHook().handleFindControlState({
        state: 2,
        previous: true,
        matchesCount: { current: 1, total: 10 },
      });
    });

    expect(getHook().searchStatusMessage).toBe(
      'Reached start of document, continuing from end',
    );
  });
});
