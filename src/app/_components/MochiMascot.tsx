'use client';

import { motion } from 'framer-motion';
import { Dumbbell, Leaf, MessageCircleHeart, Soup } from 'lucide-react';

type MochiMood = 'hello' | 'workout' | 'food' | 'coach';

const moodIcons = {
  hello: Leaf,
  workout: Dumbbell,
  food: Soup,
  coach: MessageCircleHeart,
};

export function MochiMascot({
  mood = 'hello',
  size = 'md',
  animate = true,
  className = '',
}: {
  mood?: MochiMood;
  size?: 'sm' | 'md' | 'lg';
  animate?: boolean;
  className?: string;
}) {
  const Icon = moodIcons[mood];
  const dimensions = size === 'sm' ? 'h-9 w-9' : size === 'lg' ? 'h-20 w-20' : 'h-12 w-12';

  return (
    <motion.div
      aria-hidden
      animate={animate ? { y: [0, -3, 0], rotate: [0, -1.5, 1.5, 0] } : undefined}
      transition={animate ? { duration: 3.6, repeat: Infinity, ease: 'easeInOut' } : undefined}
      className={`relative shrink-0 ${dimensions} ${className}`}
    >
      <div className="absolute inset-[5%] rounded-[46%_54%_48%_52%/52%_48%_55%_45%] border-2 border-[#9c7b60]/18 bg-linear-to-br from-[#fff7e8] via-[#f5dfbd] to-[#d8b98c] shadow-[0_8px_18px_rgba(105,82,57,0.18)] dark:border-[#d8c5a8]/20 dark:from-[#88745e] dark:via-[#6d5d4d] dark:to-[#55483d]" />
      <span className="absolute left-[31%] top-[39%] h-[7%] w-[7%] rounded-full bg-[#55483d] dark:bg-[#fff4df]" />
      <span className="absolute right-[31%] top-[39%] h-[7%] w-[7%] rounded-full bg-[#55483d] dark:bg-[#fff4df]" />
      <span className="absolute left-1/2 top-[52%] h-[9%] w-[18%] -translate-x-1/2 rounded-b-full border-b-2 border-[#8d6954] dark:border-[#f1c7a6]" />
      <span className="absolute bottom-[17%] right-[3%] grid h-[31%] w-[31%] place-items-center rounded-full border-2 border-[#fff8ed] bg-[#d98c68] text-white shadow-sm dark:border-[#55483d] dark:bg-[#efa789] dark:text-[#5a392d]">
        <Icon className="h-[58%] w-[58%]" strokeWidth={2.5} />
      </span>
      <span className="absolute left-[18%] top-[51%] h-[7%] w-[12%] rounded-full bg-[#efaa91]/45" />
      <span className="absolute right-[18%] top-[51%] h-[7%] w-[12%] rounded-full bg-[#efaa91]/45" />
    </motion.div>
  );
}
