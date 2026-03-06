import type { EditorState, Extension } from '@codemirror/state';
import { EditorView, runScopeHandlers, type Panel, type ViewUpdate } from '@codemirror/view';
import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  search,
  selectMatches,
  setSearchQuery,
} from '@codemirror/search';

type QueryPatch = {
  search?: string;
  replace?: string;
  caseSensitive?: boolean;
  regexp?: boolean;
  wholeWord?: boolean;
};

type MatchStats = {
  current: number;
  total: number;
};

const SVG_NS = 'http://www.w3.org/2000/svg';

type SearchIcon = 'search' | 'previous' | 'next' | 'options' | 'close';

function createIcon(name: SearchIcon, className = 'cm-modern-search-icon'): SVGSVGElement {
  const icon = document.createElementNS(SVG_NS, 'svg');
  icon.classList.add(className);
  icon.setAttribute('viewBox', '0 0 16 16');
  icon.setAttribute('aria-hidden', 'true');

  const addPath = (d: string) => {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'currentColor');
    icon.append(path);
  };

  switch (name) {
    case 'search':
      addPath('M6.75 1.75a5 5 0 1 0 3.3 8.75l2.66 2.66a.75.75 0 1 0 1.06-1.06l-2.66-2.66a5 5 0 0 0-4.36-7.69Zm0 1.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z');
      break;
    case 'previous':
      addPath('M4.22 9.53a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1-1.06 1.06L8 6.59 5.28 9.53a.75.75 0 0 1-1.06 0Z');
      break;
    case 'next':
      addPath('M4.22 6.47a.75.75 0 0 1 1.06 0L8 9.41l2.72-2.94a.75.75 0 1 1 1.06 1.06l-3.25 3.5a.75.75 0 0 1-1.06 0l-3.25-3.5a.75.75 0 0 1 0-1.06Z');
      break;
    case 'options':
      addPath('M2.5 3.75a.75.75 0 0 1 .75-.75h9.5a.75.75 0 0 1 0 1.5h-9.5a.75.75 0 0 1-.75-.75Zm2.25 4.25a.75.75 0 0 1 .75-.75h7a.75.75 0 0 1 0 1.5h-7A.75.75 0 0 1 4.75 8Zm2 4.25a.75.75 0 0 1 .75-.75h5.25a.75.75 0 0 1 0 1.5H7.5a.75.75 0 0 1-.75-.75Z');
      break;
    case 'close':
      addPath('M4.22 4.22a.75.75 0 0 1 1.06 0L8 6.94l2.72-2.72a.75.75 0 1 1 1.06 1.06L9.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L8 9.06l-2.72 2.72a.75.75 0 0 1-1.06-1.06L6.94 8 4.22 5.28a.75.75 0 0 1 0-1.06Z');
      break;
  }

  return icon;
}

function createIconButton(
  iconName: SearchIcon,
  title: string,
  className = 'cm-modern-search-button'
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.title = title;
  button.setAttribute('aria-label', title);
  button.append(createIcon(iconName));
  return button;
}

function createTextButton(
  label: string,
  title: string,
  className = 'cm-modern-search-button'
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.title = title;
  button.setAttribute('aria-label', title);
  return button;
}

function getMatchStats(state: EditorState, query: SearchQuery): MatchStats {
  if (!query.search || !query.valid) {
    return { current: 0, total: 0 };
  }

  const cursor = query.getCursor(state);
  const mainSelection = state.selection.main;
  let total = 0;
  let current = 0;
  let firstAfterCursor = 0;

  while (true) {
    const result = cursor.next();
    if (result.done) break;

    total += 1;
    const { from, to } = result.value;

    if (from === mainSelection.from && to === mainSelection.to) {
      current = total;
      continue;
    }

    if (firstAfterCursor === 0 && from >= mainSelection.head) {
      firstAfterCursor = total;
    }
  }

  if (total > 0 && current === 0) {
    current = firstAfterCursor || 1;
  }

  return { current, total };
}

function createModernSearchPanel(view: EditorView): Panel {
  let query = getSearchQuery(view.state);
  const canReplace = !view.state.readOnly;
  let replaceVisible = canReplace && query.replace.length > 0;
  let optionsVisible =
    query.caseSensitive || query.regexp || query.wholeWord || replaceVisible;

  const panel = document.createElement('div');
  panel.className = 'cm-modern-search-panel';

  const mainRow = document.createElement('div');
  mainRow.className = 'cm-modern-search-main';
  panel.append(mainRow);

  const searchField = document.createElement('div');
  searchField.className = 'cm-modern-search-field';
  mainRow.append(searchField);

  const searchIcon = createIcon('search', 'cm-modern-search-leading-icon');
  searchField.append(searchIcon);

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'cm-modern-search-input';
  searchInput.placeholder = 'Search in file';
  searchInput.setAttribute('aria-label', 'Search in file');
  searchInput.setAttribute('main-field', 'true');
  searchInput.autocomplete = 'off';
  searchInput.spellcheck = false;
  searchField.append(searchInput);

  const matches = document.createElement('span');
  matches.className = 'cm-modern-search-count';
  searchField.append(matches);

  const actions = document.createElement('div');
  actions.className = 'cm-modern-search-actions';
  mainRow.append(actions);

  const previousButton = createIconButton('previous', 'Previous match (Shift+F3)');
  const nextButton = createIconButton('next', 'Next match (F3)');
  const optionsButton = createIconButton('options', 'Show search options');
  const closeButton = createIconButton(
    'close',
    'Close search',
    'cm-modern-search-button cm-modern-search-close'
  );
  actions.append(previousButton, nextButton, optionsButton, closeButton);

  const optionsRow = document.createElement('div');
  optionsRow.className = 'cm-modern-search-options';
  panel.append(optionsRow);

  const caseButton = createTextButton(
    'Aa',
    'Match case',
    'cm-modern-search-button cm-modern-search-toggle'
  );
  const regexButton = createTextButton(
    '.*',
    'Use regular expression',
    'cm-modern-search-button cm-modern-search-toggle'
  );
  const wordButton = createTextButton(
    'W',
    'Match whole word',
    'cm-modern-search-button cm-modern-search-toggle'
  );
  const allButton = createTextButton(
    'All',
    'Select all matches',
    'cm-modern-search-button cm-modern-search-secondary'
  );
  optionsRow.append(caseButton, regexButton, wordButton, allButton);

  let replaceToggleButton: HTMLButtonElement | null = null;
  if (canReplace) {
    replaceToggleButton = createTextButton(
      'Replace',
      'Show replace',
      'cm-modern-search-button cm-modern-search-secondary'
    );
    optionsRow.append(replaceToggleButton);
  }

  let replaceRow: HTMLDivElement | null = null;
  let replaceInput: HTMLInputElement | null = null;
  let replaceNextButton: HTMLButtonElement | null = null;
  let replaceAllButton: HTMLButtonElement | null = null;

  if (canReplace) {
    replaceRow = document.createElement('div');
    replaceRow.className = 'cm-modern-replace-row';
    panel.append(replaceRow);

    replaceInput = document.createElement('input');
    replaceInput.type = 'text';
    replaceInput.className = 'cm-modern-replace-input';
    replaceInput.placeholder = 'Replace';
    replaceInput.setAttribute('aria-label', 'Replace text');
    replaceInput.autocomplete = 'off';
    replaceInput.spellcheck = false;

    replaceNextButton = createTextButton(
      'Next',
      'Replace next match',
      'cm-modern-search-button cm-modern-search-secondary'
    );
    replaceAllButton = createTextButton(
      'All',
      'Replace all matches',
      'cm-modern-search-button cm-modern-search-secondary'
    );
    replaceRow.append(replaceInput, replaceNextButton, replaceAllButton);
  }

  const setOptionsVisibility = (visible: boolean) => {
    optionsVisible = visible;
    optionsRow.dataset.open = visible ? 'true' : 'false';
    optionsButton.dataset.active = visible ? 'true' : 'false';
    optionsButton.setAttribute('aria-pressed', visible ? 'true' : 'false');
    const title = visible ? 'Hide search options' : 'Show search options';
    optionsButton.title = title;
    optionsButton.setAttribute('aria-label', title);
  };

  const setReplaceVisibility = (visible: boolean) => {
    replaceVisible = visible;
    if (replaceRow) {
      replaceRow.dataset.open = visible ? 'true' : 'false';
    }
    if (replaceToggleButton) {
      replaceToggleButton.dataset.active = visible ? 'true' : 'false';
      replaceToggleButton.setAttribute('aria-pressed', visible ? 'true' : 'false');
      replaceToggleButton.title = visible ? 'Hide replace' : 'Show replace';
      replaceToggleButton.setAttribute('aria-label', visible ? 'Hide replace' : 'Show replace');
    }
  };

  const commit = (patch: QueryPatch) => {
    const nextQuery = new SearchQuery({
      search: patch.search ?? query.search,
      replace: patch.replace ?? query.replace,
      caseSensitive: patch.caseSensitive ?? query.caseSensitive,
      regexp: patch.regexp ?? query.regexp,
      wholeWord: patch.wholeWord ?? query.wholeWord,
      literal: query.literal,
      test: query.test,
    });

    if (nextQuery.eq(query)) return;

    query = nextQuery;
    view.dispatch({ effects: setSearchQuery.of(nextQuery) });
  };

  const updateFromState = (state: EditorState) => {
    query = getSearchQuery(state);

    if (searchInput.value !== query.search) {
      searchInput.value = query.search;
    }

    if (replaceInput && replaceInput.value !== query.replace) {
      replaceInput.value = query.replace;
    }

    caseButton.dataset.active = query.caseSensitive ? 'true' : 'false';
    caseButton.setAttribute('aria-pressed', query.caseSensitive ? 'true' : 'false');
    regexButton.dataset.active = query.regexp ? 'true' : 'false';
    regexButton.setAttribute('aria-pressed', query.regexp ? 'true' : 'false');
    wordButton.dataset.active = query.wholeWord ? 'true' : 'false';
    wordButton.setAttribute('aria-pressed', query.wholeWord ? 'true' : 'false');

    if ((query.caseSensitive || query.regexp || query.wholeWord || replaceVisible) && !optionsVisible) {
      setOptionsVisibility(true);
    }

    if (canReplace && query.replace.length > 0 && !replaceVisible) {
      setReplaceVisibility(true);
      if (!optionsVisible) {
        setOptionsVisibility(true);
      }
    }

    if (!query.search) {
      matches.textContent = '';
      matches.dataset.invalid = 'false';
      return;
    }

    if (!query.valid) {
      matches.textContent = 'invalid';
      matches.dataset.invalid = 'true';
      return;
    }

    const stats = getMatchStats(state, query);
    matches.dataset.invalid = 'false';
    matches.textContent = stats.total > 0 ? `${stats.current}/${stats.total}` : '0';
  };

  searchInput.addEventListener('input', () => {
    commit({ search: searchInput.value });
  });

  previousButton.addEventListener('click', () => {
    findPrevious(view);
  });

  nextButton.addEventListener('click', () => {
    findNext(view);
  });

  optionsButton.addEventListener('click', () => {
    setOptionsVisibility(!optionsVisible);
  });

  caseButton.addEventListener('click', () => {
    commit({ caseSensitive: !query.caseSensitive });
  });

  regexButton.addEventListener('click', () => {
    commit({ regexp: !query.regexp });
  });

  wordButton.addEventListener('click', () => {
    commit({ wholeWord: !query.wholeWord });
  });

  allButton.addEventListener('click', () => {
    selectMatches(view);
  });

  if (replaceToggleButton && replaceInput) {
    replaceToggleButton.addEventListener('click', () => {
      const nextVisible = !replaceVisible;
      setReplaceVisibility(nextVisible);
      if (nextVisible) {
        replaceInput.focus();
        replaceInput.select();
      } else {
        searchInput.focus();
      }
    });
  }

  if (replaceInput) {
    replaceInput.addEventListener('input', () => {
      commit({ replace: replaceInput.value });
    });
  }

  if (replaceNextButton) {
    replaceNextButton.addEventListener('click', () => {
      replaceNext(view);
    });
  }

  if (replaceAllButton) {
    replaceAllButton.addEventListener('click', () => {
      replaceAll(view);
    });
  }

  closeButton.addEventListener('click', () => {
    closeSearchPanel(view);
  });

  panel.addEventListener('keydown', (event) => {
    if (runScopeHandlers(view, event, 'search-panel')) {
      event.preventDefault();
      return;
    }

    if (event.key === 'Enter' && event.target === searchInput) {
      event.preventDefault();
      if (event.shiftKey) {
        findPrevious(view);
      } else {
        findNext(view);
      }
      return;
    }

    if (replaceInput && event.key === 'Enter' && event.target === replaceInput) {
      event.preventDefault();
      replaceNext(view);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeSearchPanel(view);
    }
  });

  setReplaceVisibility(replaceVisible);
  setOptionsVisibility(optionsVisible);
  updateFromState(view.state);

  return {
    dom: panel,
    mount() {
      searchInput.select();
    },
    update(update: ViewUpdate) {
      updateFromState(update.state);
    },
    get top() {
      return true;
    },
  };
}

const modernSearchTheme = EditorView.theme({
  '.cm-panels.cm-panels-top:has(.cm-modern-search-panel)': {
    backgroundColor: 'transparent',
    borderBottom: 'none',
  },
  '.cm-modern-search-panel': {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
    width: 'min(var(--md-content-max-width, 900px), calc(100% - 1.75rem))',
    margin: '0.55rem auto 0.35rem',
    padding: '0',
    backgroundColor: 'transparent',
  },
  '.cm-modern-search-main': {
    display: 'flex',
    alignItems: 'center',
    gap: '0.45rem',
    minWidth: '0',
  },
  '.cm-modern-search-field': {
    display: 'flex',
    alignItems: 'center',
    gap: '0.45rem',
    flex: '1 1 auto',
    minWidth: '0',
    height: '2.2rem',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    backgroundColor: 'var(--background)',
    padding: '0 0.65rem',
  },
  '.cm-modern-search-leading-icon': {
    width: '0.95rem',
    height: '0.95rem',
    color: 'var(--foreground-faint)',
    flexShrink: '0',
  },
  '.cm-modern-search-count': {
    minWidth: '3.6rem',
    marginLeft: '0.25rem',
    textAlign: 'right',
    fontSize: '0.75rem',
    color: 'var(--foreground-faint)',
    userSelect: 'none',
  },
  '.cm-modern-search-count:empty': {
    display: 'none',
  },
  '.cm-modern-search-count[data-invalid="true"]': {
    color: 'var(--accent-red)',
  },
  '.cm-modern-search-input': {
    flex: '1 1 auto',
    minWidth: '0',
    height: '100%',
    border: 'none',
    backgroundColor: 'transparent',
    color: 'var(--foreground)',
    fontFamily: 'inherit',
    fontSize: '0.875rem',
    padding: '0',
    outline: 'none',
  },
  '.cm-modern-search-field:focus-within': {
    borderColor: 'var(--background-modifier-border-focus)',
    boxShadow: '0 0 0 2px var(--accent-primary-12)',
  },
  '.cm-modern-replace-input': {
    flex: '1 1 auto',
    minWidth: '10rem',
    height: '2rem',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    backgroundColor: 'var(--background)',
    color: 'var(--foreground)',
    fontFamily: 'inherit',
    fontSize: '0.875rem',
    padding: '0 0.65rem',
    outline: 'none',
  },
  '.cm-modern-search-input::placeholder, .cm-modern-replace-input::placeholder': {
    color: 'var(--foreground-faint)',
  },
  '.cm-modern-replace-input:focus': {
    borderColor: 'var(--background-modifier-border-focus)',
    boxShadow: '0 0 0 2px var(--accent-primary-12)',
  },
  '.cm-modern-search-actions': {
    display: 'flex',
    alignItems: 'center',
    gap: '0.2rem',
    flexShrink: '0',
  },
  '.cm-modern-search-button': {
    width: '2rem',
    height: '2rem',
    border: '1px solid transparent',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: 'var(--foreground-muted)',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'inherit',
    fontSize: '0.75rem',
    lineHeight: '1',
    padding: '0',
  },
  '.cm-modern-search-icon': {
    width: '1rem',
    height: '1rem',
  },
  '.cm-modern-search-button:hover': {
    backgroundColor: 'var(--background-modifier-hover)',
    color: 'var(--foreground)',
  },
  '.cm-modern-search-button[data-active="true"]': {
    backgroundColor: 'var(--accent-primary-12)',
    borderColor: 'var(--accent-primary)',
    color: 'var(--accent-primary)',
  },
  '.cm-modern-search-button:focus-visible': {
    borderColor: 'var(--accent-primary)',
    boxShadow: '0 0 0 2px var(--accent-primary-12)',
    outline: 'none',
  },
  '.cm-modern-search-button.cm-modern-search-close': {
    color: 'var(--foreground-faint)',
  },
  '.cm-modern-search-options': {
    display: 'none',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '0.35rem',
  },
  '.cm-modern-search-options[data-open="true"]': {
    display: 'flex',
  },
  '.cm-modern-search-button.cm-modern-search-toggle': {
    width: 'auto',
    minWidth: '2rem',
    padding: '0 0.5rem',
    fontWeight: '500',
  },
  '.cm-modern-search-button.cm-modern-search-secondary': {
    width: 'auto',
    padding: '0 0.6rem',
  },
  '.cm-modern-replace-row': {
    display: 'none',
    alignItems: 'center',
    gap: '0.4rem',
  },
  '.cm-modern-replace-row[data-open="true"]': {
    display: 'flex',
  },
});

export const modernSearchExtension: Extension = [
  search({
    top: true,
    createPanel: createModernSearchPanel,
  }),
  modernSearchTheme,
];
