import { useEffect, useState } from 'react';
import { Check, Circle, Loader2, AlertTriangle, Info, ChevronDown, ChevronRight } from 'lucide-react';
import { getSharedCoordinatorClient } from '@/lib/shared-coordinator-client';

type StepStatus = 'pending' | 'running' | 'waiting' | 'done' | 'error';

type Step = {
  id: string;
  title: string;
  description: string;
  status: StepStatus;
  error?: string;
  output?: string;
};

async function shellExec(command: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const coordinator = await getSharedCoordinatorClient();
  return coordinator.call('shell/exec', { command, args });
}

export function NotebookLmPanel() {
  const [steps, setSteps] = useState<Step[]>([
    { id: 'check', title: 'Check Python', description: 'Verify Python is available', status: 'pending' },
    { id: 'install', title: 'Install package', description: 'pip install notebooklm-py + Playwright', status: 'pending' },
    { id: 'skill', title: 'Install skill', description: 'Register skill with AI agent', status: 'pending' },
    { id: 'login', title: 'Authenticate', description: 'Sign in with Google', status: 'pending' },
    { id: 'verify', title: 'Verify', description: 'Check connection works', status: 'pending' },
  ]);
  const [running, setRunning] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [checking, setChecking] = useState(true);

  const updateStep = (id: string, update: Partial<Step>) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...update } : s)));
  };

  // Auto-check on mount: if notebooklm is already installed and authenticated, mark all done
  useEffect(() => {
    (async () => {
      try {
        const result = await shellExec('notebooklm', ['list', '--json']);
        if (result.exitCode === 0) {
          const parsed = JSON.parse(result.stdout);
          const count = parsed?.notebooks?.length ?? 0;
          setSteps((prev) =>
            prev.map((s) => ({
              ...s,
              status: 'done' as const,
              output: s.id === 'verify' ? `${count} notebook${count !== 1 ? 's' : ''} found` : undefined,
            })),
          );
        }
      } catch { /* not installed yet */ }
      setChecking(false);
    })();
  }, []);

  const runSetup = async () => {
    setRunning(true);

    // Reset all steps
    setSteps((prev) => prev.map((s) => ({ ...s, status: 'pending' as const, error: undefined, output: undefined })));

    // Step 1: Check Python
    updateStep('check', { status: 'running' });
    let pythonCmd = '';
    try {
      for (const cmd of ['python', 'python3', 'py']) {
        const result = await shellExec(cmd, ['--version']);
        if (result.exitCode === 0) {
          updateStep('check', { status: 'done', output: (result.stdout || result.stderr).trim() });
          pythonCmd = cmd;
          break;
        }
      }
      if (!pythonCmd) {
        updateStep('check', { status: 'error', error: 'Python not found. Please install Python 3.11+.' });
        setRunning(false);
        return;
      }
    } catch {
      updateStep('check', { status: 'error', error: 'Failed to check Python' });
      setRunning(false);
      return;
    }

    // Step 2: Install package (use python -m pip to match the found Python)
    updateStep('install', { status: 'running' });
    try {
      const pip = await shellExec(pythonCmd, ['-m', 'pip', 'install', 'notebooklm-py[browser]']);
      if (pip.exitCode !== 0) {
        updateStep('install', { status: 'error', error: pip.stderr.slice(-200) });
        setRunning(false);
        return;
      }
      const pw = await shellExec(pythonCmd, ['-m', 'playwright', 'install', 'chromium']);
      if (pw.exitCode !== 0) {
        updateStep('install', { status: 'error', error: pw.stderr.slice(-200) });
        setRunning(false);
        return;
      }
      updateStep('install', { status: 'done' });
    } catch (err) {
      updateStep('install', { status: 'error', error: err instanceof Error ? err.message : 'Install failed' });
      setRunning(false);
      return;
    }

    // Step 3: Install skill
    updateStep('skill', { status: 'running' });
    try {
      const result = await shellExec('notebooklm', ['skill', 'install']);
      if (result.exitCode !== 0) {
        updateStep('skill', { status: 'error', error: result.stderr.slice(-200) });
        setRunning(false);
        return;
      }
      updateStep('skill', { status: 'done' });
    } catch (err) {
      updateStep('skill', { status: 'error', error: err instanceof Error ? err.message : 'Skill install failed' });
      setRunning(false);
      return;
    }

    // Step 4: Open login browser
    updateStep('login', { status: 'running' });
    try {
      const coordinator = await getSharedCoordinatorClient();
      await coordinator.call('shell/login-start');
      updateStep('login', { status: 'waiting' });
      setBrowserOpen(true);
    } catch {
      updateStep('login', { status: 'error', error: 'Failed to open login browser' });
    }
    setRunning(false);
  };

  const verifyLogin = async () => {
    setRunning(true);

    // Close the login browser
    try {
      const coordinator = await getSharedCoordinatorClient();
      await coordinator.call('shell/login-finish');
    } catch { /* may already be closed */ }
    setBrowserOpen(false);

    // Check auth
    updateStep('login', { status: 'running' });
    try {
      const result = await shellExec('notebooklm', ['list', '--json']);
      if (result.exitCode !== 0) {
        updateStep('login', { status: 'error', error: 'Not authenticated. Sign in and try again.' });
        setRunning(false);
        return;
      }
      updateStep('login', { status: 'done' });

      // Step 5: Verify
      updateStep('verify', { status: 'running' });
      const parsed = JSON.parse(result.stdout);
      const count = parsed?.notebooks?.length ?? 0;
      updateStep('verify', { status: 'done', output: `${count} notebook${count !== 1 ? 's' : ''} found` });
    } catch {
      updateStep('login', { status: 'error', error: 'Auth check failed' });
    }

    setRunning(false);
  };

  const loginStep = steps.find((s) => s.id === 'login')!;
  const isAtLoginStep = loginStep.status === 'waiting' || browserOpen;
  const allDone = steps.every((s) => s.status === 'done');

  if (checking) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-4">
        {/* Unofficial badge */}
        <div className="mb-3 flex items-center gap-2 rounded-md bg-[var(--overlay-10)] px-3 py-2">
          <AlertTriangle className="size-4 shrink-0 text-yellow-500" />
          <span className="text-[12px] text-muted-foreground">
            Unofficial — uses undocumented Google APIs that may break
          </span>
        </div>

        {/* Description */}
        <p className="mb-4 text-[13px] text-muted-foreground">
          Gives the AI agent full access to Google NotebookLM — create notebooks, add sources, generate podcasts, videos, quizzes, and more.
        </p>

        {/* Capabilities */}
        <CapabilitiesSection />

        {/* Global install warning */}
        <p className="mb-4 text-[12px] text-muted-foreground">
          Setup will install <span className="font-medium text-foreground">notebooklm-py</span> and <span className="font-medium text-foreground">Chromium</span> globally via pip. These are not installed in a virtual environment.
        </p>

        {/* Steps */}
        <div className="space-y-1">
          {steps.map((step) => (
            <div key={step.id} className="rounded-md px-3 py-2">
              <div className="flex items-center gap-3">
                <StepIcon status={step.status} />
                <div className="min-w-0 flex-1">
                  <span className="text-[14px] text-foreground">{step.title}</span>
                  <span className="ml-2 text-[13px] text-muted-foreground">{step.description}</span>
                </div>
              </div>
              {step.output && step.status === 'done' && (
                <p className="mt-1 ml-7 text-[12px] text-muted-foreground">{step.output}</p>
              )}
              {step.error && (
                <p className="mt-1 ml-7 text-[12px] text-[var(--error)]">{step.error}</p>
              )}
            </div>
          ))}
        </div>

        {/* Login instructions — shown when browser is open */}
        {isAtLoginStep && (
          <div className="mt-4 rounded-lg border border-border bg-surface p-4">
            <p className="mb-2 text-[13px] font-medium text-foreground">
              A browser window has opened.
            </p>
            <p className="text-[13px] text-muted-foreground">
              Sign in with your Google account and wait until you see the NotebookLM homepage.
            </p>
            <p className="mt-2 text-[12px] font-medium text-yellow-500">
              Do not close the browser — click "Verify" below when you're signed in.
            </p>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="border-t border-border px-4 py-3">
        {allDone ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[13px] text-green-500">
              <Check className="size-4" />
              NotebookLM is ready
            </div>
            <button
              type="button"
              onClick={runSetup}
              className="text-[12px] text-muted-foreground transition-colors hover:text-foreground"
            >
              Reinstall
            </button>
          </div>
        ) : isAtLoginStep ? (
          <button
            type="button"
            onClick={verifyLogin}
            disabled={running}
            className="rounded-md bg-[var(--accent-primary)] px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
          >
            {running ? (
              <span className="flex items-center gap-2">
                <Loader2 className="size-3.5 animate-spin" />
                Verifying...
              </span>
            ) : (
              'Verify'
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={runSetup}
            disabled={running}
            className="rounded-md bg-[var(--accent-primary)] px-4 py-1.5 text-[13px] font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
          >
            {running ? (
              <span className="flex items-center gap-2">
                <Loader2 className="size-3.5 animate-spin" />
                Setting up...
              </span>
            ) : (
              'Set up NotebookLM'
            )}
          </button>
        )}
      </div>
    </>
  );
}

function StepIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case 'done':
      return <Check className="size-4 shrink-0 text-green-500" />;
    case 'running':
      return <Loader2 className="size-4 shrink-0 animate-spin text-[var(--accent-primary)]" />;
    case 'waiting':
      return <Circle className="size-4 shrink-0 text-[var(--accent-primary)]" />;
    case 'error':
      return <AlertTriangle className="size-4 shrink-0 text-[var(--error)]" />;
    default:
      return <Circle className="size-4 shrink-0 text-muted-foreground opacity-40" />;
  }
}

type Capability = {
  name: string;
  description: string;
  examples: string[];
};

type CapabilityGroup = {
  category: string;
  items: Capability[];
};

const CAPABILITIES: CapabilityGroup[] = [
  {
    category: 'Research & Sources',
    items: [
      {
        name: 'Add Sources',
        description: 'URLs, YouTube, PDFs, Google Drive, text, audio, video, images',
        examples: [
          'Summarize these URLs/documents',
          'Add these sources to NotebookLM',
        ],
      },
      {
        name: 'Web Research',
        description: 'Automated research agents that find and import sources (fast/deep modes)',
        examples: [
          'Research recent advances in quantum computing',
          'Do a deep research on climate policy papers',
        ],
      },
      {
        name: 'Chat with Sources',
        description: 'Ask questions, get cited answers, conversation history, custom personas',
        examples: [
          'What are the key themes across my sources?',
          'Explain this like I\'m a first-year student',
        ],
      },
    ],
  },
  {
    category: 'Content Generation',
    items: [
      {
        name: 'Audio Overviews',
        description: 'Podcasts in 4 formats (deep-dive, brief, critique, debate), 3 lengths, 50+ languages',
        examples: [
          'Create a podcast about my research paper',
          'Turn this into an audio overview',
        ],
      },
      {
        name: 'Video Overviews',
        description: '3 formats (explainer, brief, cinematic) with 9 visual styles',
        examples: [
          'Generate a video explainer',
          'Make a cinematic documentary-style summary',
        ],
      },
      {
        name: 'Slide Decks',
        description: 'Detailed or presenter format, per-slide revision with natural language',
        examples: [
          'Create a slide deck from this notebook',
          'Revise slide 3 to focus more on methodology',
        ],
      },
      {
        name: 'Quizzes & Flashcards',
        description: 'Configurable difficulty and quantity, export as JSON/Markdown/HTML',
        examples: [
          'Generate a quiz from my research',
          'Create flashcards for studying',
          'Download the quiz as markdown',
        ],
      },
      {
        name: 'Reports & More',
        description: 'Briefing docs, study guides, blog posts, infographics, mind maps, data tables',
        examples: [
          'Make an infographic',
          'Create a mind map of the concepts',
          'Generate a study guide',
        ],
      },
    ],
  },
  {
    category: 'Beyond the Web UI',
    items: [
      {
        name: 'Batch Downloads',
        description: 'Download all artifacts of a type at once (MP3, MP4, PDF, PPTX, PNG, CSV, JSON)',
        examples: [],
      },
      {
        name: 'Structured Export',
        description: 'Quiz/flashcard as JSON/Markdown/HTML, slides as editable PPTX, mind map as JSON, data tables as CSV',
        examples: [],
      },
      {
        name: 'Programmatic Control',
        description: 'Source fulltext access, sharing permissions, save chat to notes, slide revision',
        examples: [],
      },
    ],
  },
];

function CapabilitiesSection() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <Info className="size-3.5" />
        <span>What can the agent do?</span>
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
      </button>
      {open && (
        <div className="mt-2 space-y-4 rounded-md bg-[var(--overlay-10)] px-3 py-3">
          {CAPABILITIES.map((group) => (
            <div key={group.category}>
              <p className="mb-2 text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                {group.category}
              </p>
              <div className="space-y-2.5">
                {group.items.map((item) => (
                  <div key={item.name}>
                    <p className="text-[12px] text-foreground">
                      <span className="font-medium">{item.name}</span>
                      <span className="text-muted-foreground"> — {item.description}</span>
                    </p>
                    {item.examples.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                        {item.examples.map((ex) => (
                          <span key={ex} className="text-[11px] italic text-muted-foreground opacity-70">
                            "{ex}"
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
