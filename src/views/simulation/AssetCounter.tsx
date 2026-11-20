import { useEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useTransform, useReducedMotion, type AnimationPlaybackControls } from 'motion/react';
import { formatAssetMoney, formatMoney } from '../../lib/format';

export default function AssetCounter({
  value,
  speed,
  frozen,
}: {
  value: number;
  speed: number;
  frozen: boolean;
}) {
  const reduced = useReducedMotion();
  const mv = useMotionValue(value);
  const display = useTransform(mv, (v) => formatAssetMoney(Math.round(v)));
  const prev = useRef(value);
  const controlsRef = useRef<AnimationPlaybackControls | null>(null);
  const [dir, setDir] = useState<'up' | 'down' | 'flat'>('flat');

  useEffect(() => {
    setDir(value > prev.current ? 'up' : value < prev.current ? 'down' : 'flat');
    prev.current = value;
    // 仅视觉插值：目标值始终是引擎真实状态，播放速度不进入引擎。
    const controls = animate(mv, value, {
      duration: reduced ? 0 : Math.min(0.9, 0.95 / speed),
      ease: [0.22, 1, 0.36, 1],
    });
    controlsRef.current = controls;
    if (frozen) controls.pause();
    return () => controls.stop();
  }, [value, speed, mv, reduced]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    if (frozen) controls.pause();
    else controls.play();
  }, [frozen]);

  const color =
    dir === 'up' ? 'text-wealth-300' : dir === 'down' ? 'text-flare-400' : 'text-zinc-50';

  return (
    <motion.div
      title={formatMoney(value)}
      aria-label={`当前资产 ${formatMoney(value)}`}
      className={`tnum max-w-full break-all text-[clamp(2.4rem,9vw,6rem)] leading-tight font-semibold transition-colors duration-700 ${color}`}
    >
      {display}
    </motion.div>
  );
}
