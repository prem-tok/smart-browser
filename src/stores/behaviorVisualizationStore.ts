import { create } from 'zustand';

/**
 * Current behavior action being performed
 */
export type BehaviorAction = 
  | 'idle'
  | 'clicking'
  | 'typing'
  | 'scrolling'
  | 'hovering'
  | 'thinking'
  | 'reading'
  | 'moving';

/**
 * Mouse movement point
 */
export interface MousePoint {
  x: number;
  y: number;
  timestamp: number;
}

/**
 * Behavior visualization state
 */
interface BehaviorVisualizationState {
  /** Whether human behavior is active */
  isActive: boolean;
  /** Current action being performed */
  currentAction: BehaviorAction;
  /** Current action details */
  actionDetails: {
    selector?: string;
    text?: string;
    progress?: number; // 0-100 for typing progress
  };
  /** Mouse movement path points */
  mousePath: MousePoint[];
  /** Whether a delay is happening */
  isDelaying: boolean;
  /** Delay duration in ms */
  delayDuration: number;
  /** Current delay progress (0-100) */
  delayProgress: number;
  /** Position for overlay */
  position: {
    x: number;
    y: number;
  };

  // Actions
  setActive: (active: boolean) => void;
  setAction: (action: BehaviorAction, details?: BehaviorVisualizationState['actionDetails']) => void;
  addMousePoint: (point: MousePoint) => void;
  clearMousePath: () => void;
  setDelaying: (delaying: boolean, duration?: number) => void;
  updateDelayProgress: (progress: number) => void;
  setPosition: (x: number, y: number) => void;
  reset: () => void;
}

const initialState = {
  isActive: false,
  currentAction: 'idle' as BehaviorAction,
  actionDetails: {},
  mousePath: [],
  isDelaying: false,
  delayDuration: 0,
  delayProgress: 0,
  position: { x: 10, y: 10 },
};

export const useBehaviorVisualizationStore = create<BehaviorVisualizationState>((set, get) => ({
  ...initialState,

  setActive: (active) => {
    set({ isActive: active });
    if (!active) {
      // Reset when deactivated
      get().reset();
    }
  },

  setAction: (action, details = {}) => {
    set({ 
      currentAction: action,
      actionDetails: details,
    });
    
    // Clear mouse path when action changes (except for moving)
    if (action !== 'moving') {
      get().clearMousePath();
    }
  },

  addMousePoint: (point) => {
    const { mousePath } = get();
    const newPath = [...mousePath, point];
    
    // Keep only last 50 points for performance
    const trimmedPath = newPath.slice(-50);
    
    set({ mousePath: trimmedPath });
  },

  clearMousePath: () => {
    set({ mousePath: [] });
  },

  setDelaying: (delaying, duration = 0) => {
    set({ 
      isDelaying: delaying,
      delayDuration: duration,
      delayProgress: 0,
    });
  },

  updateDelayProgress: (progress) => {
    set({ delayProgress: Math.min(100, Math.max(0, progress)) });
  },

  setPosition: (x, y) => {
    set({ position: { x, y } });
  },

  reset: () => {
    set({
      ...initialState,
      position: get().position, // Keep position
    });
  },
}));

