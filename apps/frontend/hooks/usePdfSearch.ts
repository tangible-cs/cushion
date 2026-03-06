import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

type SearchDirection = 'next' | 'prev' | 'initial';
type SearchMatchesCount = { current: number; total: number };
type FindEventType = '' | 'again' | 'highlightallchange' | 'casesensitivitychange' | 'entirewordchange';

const PDF_FIND_STATE = {
  NOT_FOUND: 1,
  WRAPPED: 2,
  PENDING: 3,
} as const;

const EMPTY_MATCHES_COUNT: SearchMatchesCount = { current: 0, total: 0 };

function normalizeMatchesCount(value: any): SearchMatchesCount {
  if (!value || typeof value !== 'object') {
    return EMPTY_MATCHES_COUNT;
  }

  const current = typeof value.current === 'number' ? value.current : 0;
  const total = typeof value.total === 'number' ? value.total : 0;
  return { current, total };
}

function getWrappedStatusMessage(previous: boolean): string {
  return previous
    ? 'Reached start of document, continuing from end'
    : 'Reached end of document, continuing from start';
}

export function usePdfSearch(eventBusRef: RefObject<any>) {
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQueryState] = useState('');
  const [caseSensitive, setCaseSensitiveState] = useState(false);
  const [entireWord, setEntireWordState] = useState(false);
  const [highlightAll, setHighlightAllState] = useState(true);
  const [searchMatchesCount, setSearchMatchesCount] = useState<SearchMatchesCount>(EMPTY_MATCHES_COUNT);
  const [searchStatusMessage, setSearchStatusMessage] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const showSearchRef = useRef(showSearch);

  useEffect(() => {
    showSearchRef.current = showSearch;
  }, [showSearch]);

  const dispatchFindEvent = useCallback((
    type: FindEventType,
    query: string,
    findPrevious: boolean,
    overrides?: Partial<{ caseSensitive: boolean; entireWord: boolean; highlightAll: boolean }>,
  ) => {
    const eventBus = eventBusRef.current;
    if (!eventBus) {
      return;
    }

    eventBus.dispatch('find', {
      source: null,
      type,
      query,
      caseSensitive: overrides?.caseSensitive ?? caseSensitive,
      entireWord: overrides?.entireWord ?? entireWord,
      highlightAll: overrides?.highlightAll ?? highlightAll,
      findPrevious,
    });
  }, [caseSensitive, entireWord, eventBusRef, highlightAll]);

  const handleSearch = useCallback((direction: SearchDirection = 'initial') => {
    if (!searchQuery) {
      return;
    }

    dispatchFindEvent(
      direction === 'initial' ? '' : 'again',
      searchQuery,
      direction === 'prev',
    );
  }, [dispatchFindEvent, searchQuery]);

  const setSearchQuery = useCallback((query: string) => {
    setSearchQueryState(query);
    dispatchFindEvent('', query, false);

    if (!query) {
      setSearchMatchesCount(EMPTY_MATCHES_COUNT);
      setSearchStatusMessage('');
    }
  }, [dispatchFindEvent]);

  const setCaseSensitive = useCallback((nextValue: boolean) => {
    setCaseSensitiveState(nextValue);
    dispatchFindEvent('casesensitivitychange', searchQuery, false, {
      caseSensitive: nextValue,
    });
  }, [dispatchFindEvent, searchQuery]);

  const setEntireWord = useCallback((nextValue: boolean) => {
    setEntireWordState(nextValue);
    dispatchFindEvent('entirewordchange', searchQuery, false, {
      entireWord: nextValue,
    });
  }, [dispatchFindEvent, searchQuery]);

  const setHighlightAll = useCallback((nextValue: boolean) => {
    setHighlightAllState(nextValue);
    dispatchFindEvent('highlightallchange', searchQuery, false, {
      highlightAll: nextValue,
    });
  }, [dispatchFindEvent, searchQuery]);

  const openSearch = useCallback(() => {
    showSearchRef.current = true;
    setShowSearch(true);
    setTimeout(() => searchInputRef.current?.focus(), 50);
  }, []);

  const closeSearch = useCallback(() => {
    const eventBus = eventBusRef.current;
    if (eventBus) {
      eventBus.dispatch('findbarclose', { source: null });
    }

    showSearchRef.current = false;
    setShowSearch(false);
    setSearchQueryState('');
    setSearchMatchesCount(EMPTY_MATCHES_COUNT);
    setSearchStatusMessage('');
  }, [eventBusRef]);

  const handleFindControlState = useCallback((evt: any) => {
    if (!showSearchRef.current) {
      return;
    }

    setSearchMatchesCount(normalizeMatchesCount(evt?.matchesCount));

    switch (evt?.state) {
      case PDF_FIND_STATE.PENDING:
        setSearchStatusMessage('Searching...');
        return;
      case PDF_FIND_STATE.NOT_FOUND:
        setSearchStatusMessage('No matches found');
        return;
      case PDF_FIND_STATE.WRAPPED:
        setSearchStatusMessage(getWrappedStatusMessage(Boolean(evt?.previous)));
        return;
      default:
        setSearchStatusMessage('');
    }
  }, []);

  const handleFindMatchesCount = useCallback((evt: any) => {
    if (!showSearchRef.current) {
      return;
    }

    setSearchMatchesCount(normalizeMatchesCount(evt?.matchesCount));
  }, []);

  return {
    showSearch,
    searchQuery,
    setSearchQuery,
    caseSensitive,
    setCaseSensitive,
    entireWord,
    setEntireWord,
    highlightAll,
    setHighlightAll,
    searchMatchesCount,
    searchStatusMessage,
    searchInputRef,
    handleSearch,
    handleFindControlState,
    handleFindMatchesCount,
    openSearch,
    closeSearch,
  };
}
