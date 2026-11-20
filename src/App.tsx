import { Component, lazy, Suspense, useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { useUiStore } from './store/uiStore';
import { useSimStore } from './store/simStore';
import { syncDriver, stopDriver } from './playback/driver';
import SetupView from './views/setup/SetupView';
const EndingView = lazy(() => import('./views/ending/EndingView'));
import SharedView from './views/shared/SharedView';

const SimulationView = lazy(() => import('./views/simulation/SimulationView'));

// StrictMode 双挂载只引导一次：否则首遍清除坏 hash 后，第二遍会误走存档恢复。
let bootstrapped = false;

class ViewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch() { useSimStore.getState().suspendPlayback(); }

  render() {
    if (!this.state.failed) return this.props.children;
    return <main role="alert" className="flex min-h-screen flex-col items-center justify-center gap-5 bg-abyss-950 px-6 text-center">
      <h1 className="text-xl text-zinc-100">页面暂时无法显示</h1>
      <p className="text-sm text-zinc-400">请检查网络后重试。可用进度会在重新加载后恢复。</p>
      <button type="button" onClick={() => location.reload()} className="min-h-11 rounded-xl bg-wealth-500 px-6 text-abyss-950">重新加载</button>
      <button type="button" onClick={() => { useSimStore.getState().restart(); this.setState({ failed: false }); }} className="min-h-11 rounded-xl border border-abyss-600 px-6 text-zinc-300">重新开局</button>
    </main>;
  }
}

export default function App() {
  const view = useUiStore((s) => s.view);

  useEffect(() => {
    if (!bootstrapped) {
      bootstrapped = true;
      useSimStore.getState().openLocation();
    }
    const onHashChange = () => useSimStore.getState().openLocation();
    window.addEventListener('hashchange', onHashChange);
    syncDriver();
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      stopDriver();
    };
  }, []);

  return (
    <ViewBoundary><MotionConfig reducedMotion="user"><AnimatePresence mode="wait">
      <motion.div
        key={view}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.35 }}
      >
        {view === 'setup' && <SetupView />}
        {view === 'shared' && <SharedView />}
        {view === 'simulating' && (
          <Suspense
            fallback={
              <div className="flex min-h-screen items-center justify-center bg-abyss-950">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-abyss-600 border-t-wealth-400" />
              </div>
            }
          >
            <SimulationView />
          </Suspense>
        )}
        {view === 'ending' && <Suspense fallback={<div className="min-h-screen bg-abyss-950" role="status" aria-label="正在展开结局" />}><EndingView /></Suspense>}
      </motion.div>
    </AnimatePresence></MotionConfig></ViewBoundary>
  );
}