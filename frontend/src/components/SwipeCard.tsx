import { motion, useMotionValue, useTransform } from 'framer-motion';
import type { PanInfo } from 'framer-motion';
import type { Item } from '../lib/types';
import { formatBytes } from '../lib/api';

interface SwipeCardProps {
  item: Item;
  index: number; // 0 = top (interactive), 1+ = behind
  onDecide: (decision: 'keep' | 'mark') => void;
}

const SWIPE_PX = 100;
const SWIPE_VELO = 500;

/* Two-layer architecture:
   - Outer motion.div: animates POSITION (y, scale, base tilt) from index. When the
     top card leaves, the next card's index goes 1→0 and the outer smoothly
     slides/scales into the slot. No re-mount, no pop.
   - Inner motion.div: handles drag (x + drag-driven rotate). Only enabled when
     index === 0. The drag rotation multiplies on top of the outer tilt (nested
     CSS transforms compose), so behind cards keep their gallery-fan tilt while
     the top card rotates only from drag.
*/
export function SwipeCard({ item, index, onDecide }: SwipeCardProps) {
  const isTop = index === 0;
  const x = useMotionValue(0);
  const dragRotate = useTransform(x, [-300, 0, 300], [-18, 0, 18]);
  const dropOpacity = useTransform(x, [-160, -40, 0], [1, 0.4, 0]);
  const keepOpacity = useTransform(x, [0, 40, 160], [0, 0.4, 1]);

  const tilt = isTop ? 0 : (index % 2 === 0 ? 1 : -1) * 1.4 * index;
  const targetY = index * 14;
  const targetScale = 1 - index * 0.05;
  const targetOpacity = isTop ? 1 : Math.max(0.35, 1 - index * 0.18);

  function onDragEnd(_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    const dx = info.offset.x;
    const vx = info.velocity.x;
    if (Math.abs(dx) > SWIPE_PX || Math.abs(vx) > SWIPE_VELO) {
      onDecide(dx < 0 ? 'mark' : 'keep');
    } else {
      x.set(0);
    }
  }

  return (
    <motion.div
      className="absolute inset-0"
      style={{ zIndex: 20 - index }}
      animate={{ y: targetY, scale: targetScale, rotate: tilt, opacity: targetOpacity }}
      transition={{ type: 'tween', duration: 0.34, ease: [0.18, 0.74, 0.27, 1] }}
    >
      <motion.div
        className={`absolute inset-0 bg-bg border border-border swipe-card ${
          isTop ? 'cursor-grab active:cursor-grabbing' : ''
        }`}
        style={isTop ? { x, rotate: dragRotate } : undefined}
        drag={isTop ? 'x' : false}
        dragElastic={0.6}
        dragMomentum={false}
        onDragEnd={isTop ? onDragEnd : undefined}
        whileTap={isTop ? { cursor: 'grabbing' } : undefined}
      >
        <CardFace item={item} dimmed={!isTop} />

        {isTop && (
          <>
            <motion.div
              style={{ opacity: dropOpacity }}
              className="pointer-events-none absolute inset-0 grid place-items-center border-2 border-danger bg-danger/15"
            >
              <span className="font-serif italic text-[64px] text-danger -rotate-[16deg] px-3.5 py-1.5 border-2 border-danger">
                DROP
              </span>
            </motion.div>
            <motion.div
              style={{ opacity: keepOpacity }}
              className="pointer-events-none absolute inset-0 grid place-items-center border-2 border-[#137333] bg-[#137333]/15"
            >
              <span className="font-serif italic text-[64px] text-[#137333] rotate-[12deg] px-3.5 py-1.5 border-2 border-[#137333]">
                KEEP
              </span>
            </motion.div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

interface CardFaceProps {
  item: Item;
  dimmed?: boolean;
}

function CardFace({ item, dimmed }: CardFaceProps) {
  return (
    <div className="absolute inset-0 flex flex-col p-6 lg:p-7">
      <div className="relative flex-1 border border-border overflow-hidden">
        {item.posterUrl ? (
          <img
            src={item.posterUrl}
            alt={item.title}
            className={`w-full h-full object-cover ${dimmed ? 'opacity-90' : ''}`}
            draggable={false}
          />
        ) : (
          <div
            className="w-full h-full"
            style={{
              backgroundColor: hashColor(item.title),
              backgroundImage:
                'radial-gradient(circle at 30% 28%, rgba(255,255,255,.18), transparent 55%), radial-gradient(circle at 75% 80%, rgba(0,0,0,.55), transparent 60%)',
            }}
          />
        )}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(180deg, rgba(0,0,0,0) 60%, rgba(0,0,0,0.18) 100%)',
            mixBlendMode: 'multiply',
          }}
        />
      </div>

      <div className="pt-5 pb-1 flex flex-col gap-2.5">
        <h3
          className="font-serif italic text-[24px] lg:text-[26px] leading-[1.05] tracking-[0.005em] text-text overflow-hidden text-ellipsis whitespace-nowrap"
          title={item.title}
        >
          ⟨ {item.title} ⟩
        </h3>
        <div className="flex flex-wrap gap-x-2.5 gap-y-1 text-[10px] uppercase tracking-[0.24em] text-text-dim font-medium">
          {item.year && <span>{item.year}</span>}
          {item.year && (item.runtimeMin || item.sizeBytes) && <span className="text-border">·</span>}
          {item.runtimeMin && <span>{item.runtimeMin} min</span>}
          {item.runtimeMin && item.sizeBytes > 0 && <span className="text-border">·</span>}
          {item.sizeBytes > 0 && <span>{formatBytes(item.sizeBytes)}</span>}
        </div>
        <div className="font-mono text-[9.5px] text-muted overflow-hidden whitespace-nowrap text-ellipsis tracking-[0.04em]">
          {item.path || '—'}
        </div>
      </div>
    </div>
  );
}

function hashColor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  const palette = [
    '#0d3b3a', '#0b2f4a', '#3a2615', '#1a1e22',
    '#5b0e16', '#5a1a16', '#1f2530', '#243018',
    '#2d1f3a', '#3a1f1f', '#1f3a2d', '#3a2d1f',
  ];
  return palette[Math.abs(h) % palette.length];
}
