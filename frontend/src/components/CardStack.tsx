import { AnimatePresence, motion } from 'framer-motion';
import type { Item } from '../lib/types';
import { SwipeCard } from './SwipeCard';

interface CardStackProps {
  items: Item[];
  cursor: number;
  exitDir: 'left' | 'right' | null;
  onDecide: (decision: 'keep' | 'mark') => void;
}

/* Renders up to 4 cards. Keys are stable (item.id), so when the top card exits,
   the previously-behind card retains its instance and smoothly animates from
   "behind" position to "top" — no re-mount, no pop. */
export function CardStack({ items, cursor, exitDir, onDecide }: CardStackProps) {
  const visible = items.slice(cursor, cursor + 4);

  return (
    <div className="relative w-[min(400px,86vw)] h-[620px]">
      <AnimatePresence initial={false}>
        {visible.map((item, idx) => (
          <motion.div
            key={item.id}
            className="absolute inset-0"
            // Only the top card exits visibly; behind cards just unmount with no animation
            exit={
              idx === 0 && exitDir
                ? {
                    x: exitDir === 'left' ? -900 : 900,
                    y: 80,
                    rotate: exitDir === 'left' ? -22 : 22,
                    opacity: 0,
                    transition: { duration: 0.34, ease: [0.4, 0, 0.2, 1] },
                  }
                : { opacity: 0, transition: { duration: 0.15 } }
            }
          >
            <SwipeCard item={item} index={idx} onDecide={onDecide} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
