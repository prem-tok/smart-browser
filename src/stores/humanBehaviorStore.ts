import { create } from 'zustand';
import type { HumanBehaviorConfig } from '@/config/humanBehaviorConfig';
import { defaultHumanBehaviorConfig } from '@/config/humanBehaviorConfig';

export interface HumanBehaviorSettings {
  enabled: boolean;
  randomnessLevel: number; // 1-10
  delayBetweenActions: {
    min: number;
    max: number;
  };
  typingSpeed: {
    min: number;
    max: number;
  };
  mouseMovementSpeed: number;
  breakFrequency: number; // Actions between breaks
  breakDuration: {
    min: number;
    max: number;
  };
  // Advanced settings
  advanced: {
    clickDelayBefore: { min: number; max: number };
    clickDelayAfter: { min: number; max: number };
    typingMistakeProbability: number;
    scrollSpeedVariation: { min: number; max: number };
    overshootProbability: number;
    jitterAmount: number;
  };
}

interface HumanBehaviorState {
  settings: HumanBehaviorSettings;
  isDirty: boolean;
  originalSettings: HumanBehaviorSettings;
  
  // Actions
  updateSettings: (settings: Partial<HumanBehaviorSettings>) => void;
  resetToDefaults: () => void;
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
  applyPreset: (preset: 'minimal' | 'normal' | 'highlyRandom') => void;
  markDirty: (dirty: boolean) => void;
}

const defaultSettings: HumanBehaviorSettings = {
  enabled: true,
  randomnessLevel: 5,
  delayBetweenActions: {
    min: 1000,
    max: 3000,
  },
  typingSpeed: {
    min: 40,
    max: 80,
  },
  mouseMovementSpeed: 800,
  breakFrequency: 10,
  breakDuration: {
    min: 5000,
    max: 15000,
  },
  advanced: {
    clickDelayBefore: { min: 50, max: 200 },
    clickDelayAfter: { min: 100, max: 300 },
    typingMistakeProbability: 0.02,
    scrollSpeedVariation: { min: 0.7, max: 1.3 },
    overshootProbability: 0.15,
    jitterAmount: 3,
  },
};

export const useHumanBehaviorStore = create<HumanBehaviorState>((set, get) => ({
  settings: { ...defaultSettings },
  isDirty: false,
  originalSettings: { ...defaultSettings },

  updateSettings: (newSettings) => {
    set((state) => ({
      settings: { ...state.settings, ...newSettings },
      isDirty: true,
    }));
  },

  resetToDefaults: () => {
    set({
      settings: { ...defaultSettings },
      isDirty: false,
      originalSettings: { ...defaultSettings },
    });
  },

  loadSettings: async () => {
    try {
      // Try to load from electron-store via IPC first
      if (typeof window !== 'undefined' && window.api?.getHumanBehaviorSettings) {
        const result = await window.api.getHumanBehaviorSettings();
        if (result.success && result.data) {
          set({
            settings: { ...defaultSettings, ...result.data },
            originalSettings: { ...defaultSettings, ...result.data },
            isDirty: false,
          });
          return;
        }
      }
      
      // Fallback to localStorage
      const saved = localStorage.getItem('humanBehaviorSettings');
      if (saved) {
        const parsed = JSON.parse(saved);
        set({
          settings: { ...defaultSettings, ...parsed },
          originalSettings: { ...defaultSettings, ...parsed },
          isDirty: false,
        });
      }
    } catch (error) {
      console.error('Failed to load human behavior settings:', error);
    }
  },

  saveSettings: async () => {
    try {
      const { settings } = get();
      
      // Save to electron-store via IPC
      if (typeof window !== 'undefined' && window.api?.saveHumanBehaviorSettings) {
        const result = await window.api.saveHumanBehaviorSettings(settings);
        if (!result.success) {
          throw new Error(result.error || 'Failed to save settings');
        }
      }
      
      // Also save to localStorage as backup
      localStorage.setItem('humanBehaviorSettings', JSON.stringify(settings));
      
      set({
        isDirty: false,
        originalSettings: { ...settings },
      });
      
      // Also update the HumanAgent if available
      if (typeof window !== 'undefined' && window.api?.updateHumanBehaviorConfig) {
        await window.api.updateHumanBehaviorConfig(settings);
      }
    } catch (error) {
      console.error('Failed to save human behavior settings:', error);
      throw error;
    }
  },

  applyPreset: (preset) => {
    let newSettings: HumanBehaviorSettings;

    switch (preset) {
      case 'minimal':
        newSettings = {
          ...defaultSettings,
          enabled: true,
          randomnessLevel: 2,
          delayBetweenActions: { min: 300, max: 800 },
          typingSpeed: { min: 60, max: 100 },
          mouseMovementSpeed: 1200,
          breakFrequency: 20,
          breakDuration: { min: 2000, max: 5000 },
          advanced: {
            clickDelayBefore: { min: 30, max: 100 },
            clickDelayAfter: { min: 50, max: 150 },
            typingMistakeProbability: 0.005,
            scrollSpeedVariation: { min: 0.9, max: 1.5 },
            overshootProbability: 0.05,
            jitterAmount: 1,
          },
        };
        break;

      case 'highlyRandom':
        newSettings = {
          ...defaultSettings,
          enabled: true,
          randomnessLevel: 9,
          delayBetweenActions: { min: 2000, max: 6000 },
          typingSpeed: { min: 25, max: 50 },
          mouseMovementSpeed: 500,
          breakFrequency: 5,
          breakDuration: { min: 10000, max: 30000 },
          advanced: {
            clickDelayBefore: { min: 150, max: 500 },
            clickDelayAfter: { min: 250, max: 600 },
            typingMistakeProbability: 0.08,
            scrollSpeedVariation: { min: 0.5, max: 1.1 },
            overshootProbability: 0.25,
            jitterAmount: 6,
          },
        };
        break;

      case 'normal':
      default:
        newSettings = { ...defaultSettings };
        break;
    }

    set({
      settings: newSettings,
      isDirty: true,
    });
  },

  markDirty: (dirty) => {
    set({ isDirty: dirty });
  },
}));

