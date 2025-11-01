/**
 * OtriX Motion Library
 * Reusable Framer Motion animation presets for the OtriX Admin Dashboard
 */

import { Variants, Transition } from "framer-motion";

// Easing Functions
export const easings = {
  smooth: [0.4, 0, 0.2, 1],
  spring: [0.6, 0.01, -0.05, 0.95],
  bounce: [0.68, -0.55, 0.265, 1.55],
} as const;

// Base Transitions
export const transitions = {
  default: {
    duration: 0.3,
    ease: easings.smooth,
  } as Transition,

  smooth: {
    duration: 0.5,
    ease: easings.smooth,
  } as Transition,

  spring: {
    type: "spring",
    stiffness: 300,
    damping: 30,
  } as Transition,

  springBounce: {
    type: "spring",
    stiffness: 400,
    damping: 25,
    mass: 1.2,
  } as Transition,

  slow: {
    duration: 0.8,
    ease: easings.smooth,
  } as Transition,

  fast: {
    duration: 0.15,
    ease: easings.smooth,
  } as Transition,
} as const;

// Fade Variants
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: transitions.default,
  },
};

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: transitions.smooth,
  },
};

export const fadeInDown: Variants = {
  hidden: { opacity: 0, y: -20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: transitions.smooth,
  },
};

export const fadeInScale: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: transitions.spring,
  },
};

// Slide Variants
export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -50 },
  visible: {
    opacity: 1,
    x: 0,
    transition: transitions.smooth,
  },
};

export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 50 },
  visible: {
    opacity: 1,
    x: 0,
    transition: transitions.smooth,
  },
};

// Scale Variants
export const scaleIn: Variants = {
  hidden: { scale: 0, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: transitions.springBounce,
  },
};

export const scaleUp: Variants = {
  hidden: { scale: 0.8, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: transitions.spring,
  },
};

// Glow Variants (for OtriX theme)
export const glowPulse: Variants = {
  hidden: {
    boxShadow: "0 0 0px rgba(110, 43, 255, 0)",
  },
  visible: {
    boxShadow: [
      "0 0 20px rgba(110, 43, 255, 0.4)",
      "0 0 40px rgba(110, 43, 255, 0.2)",
      "0 0 20px rgba(110, 43, 255, 0.4)",
    ],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: "easeInOut",
    },
  },
};

// Card Hover Variants
export const cardHover: Variants = {
  rest: {
    scale: 1,
    y: 0,
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
  },
  hover: {
    scale: 1.02,
    y: -4,
    boxShadow: "0 8px 32px rgba(110, 43, 255, 0.15)",
    transition: transitions.fast,
  },
};

// Sidebar Link Variants
export const sidebarLink: Variants = {
  inactive: {
    backgroundColor: "rgba(255, 255, 255, 0)",
    borderColor: "rgba(255, 255, 255, 0)",
    boxShadow: "0 0 0px rgba(110, 43, 255, 0)",
  },
  active: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderColor: "rgba(110, 43, 255, 0.3)",
    boxShadow: "0 0 20px rgba(110, 43, 255, 0.4)",
    transition: transitions.smooth,
  },
  hover: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    transition: transitions.fast,
  },
};

// Stagger Children (for lists)
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: transitions.smooth,
  },
};

// Modal/Dialog Variants
export const modalBackdrop: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: transitions.default,
  },
  exit: {
    opacity: 0,
    transition: transitions.fast,
  },
};

export const modalContent: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.9,
    y: 20,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: transitions.spring,
  },
  exit: {
    opacity: 0,
    scale: 0.9,
    y: 20,
    transition: transitions.fast,
  },
};

// Number Counter Animation
export const numberCounter = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: transitions.spring,
};

// Progress Bar Animation
export const progressBar: Variants = {
  hidden: { width: 0 },
  visible: (progress: number) => ({
    width: `${progress}%`,
    transition: {
      duration: 1,
      ease: easings.smooth,
    },
  }),
};

// Gradient Shift (for buttons)
export const gradientShift = {
  rest: {
    backgroundPosition: "0% 50%",
  },
  hover: {
    backgroundPosition: "100% 50%",
    transition: {
      duration: 0.5,
      ease: easings.smooth,
    },
  },
};

// Notification Toast Variants
export const toast: Variants = {
  hidden: {
    opacity: 0,
    x: 100,
    scale: 0.8,
  },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: transitions.spring,
  },
  exit: {
    opacity: 0,
    x: 100,
    scale: 0.8,
    transition: transitions.fast,
  },
};

// Table Row Variants
export const tableRow: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: (index: number) => ({
    opacity: 1,
    x: 0,
    transition: {
      delay: index * 0.05,
      ...transitions.smooth,
    },
  }),
};

// Chart Animation
export const chartFadeIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.8,
      ease: easings.smooth,
    },
  },
};

// Loading Spinner
export const spinnerRotate = {
  animate: {
    rotate: 360,
    transition: {
      duration: 1,
      repeat: Infinity,
      ease: "linear",
    },
  },
};

// Utility function to create custom delay
export const createDelayedVariant = (variant: Variants, delay: number): Variants => {
  const delayed = { ...variant };
  if (delayed.visible && typeof delayed.visible === 'object') {
    delayed.visible = {
      ...delayed.visible,
      transition: {
        ...(delayed.visible.transition as Transition),
        delay,
      },
    };
  }
  return delayed;
};

// Utility function for sequential animations
export const createSequence = (items: number, baseDelay: number = 0.1) => ({
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: baseDelay,
    },
  },
});
