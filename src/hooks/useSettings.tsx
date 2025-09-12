import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export interface Settings {
  // Appearance
  compactMode: boolean;
  animations: boolean;
  
  // Notifications
  birthdayNotifications: boolean;
  requestReminders: boolean;
  systemAlerts: boolean;
  
  // Display
  itemsPerPage: number;
  dateFormat: string;
  showTooltips: boolean;
  
  // Advanced
  debugMode: boolean;
  autoSave: boolean;
}

const defaultSettings: Settings = {
  compactMode: false,
  animations: true,
  birthdayNotifications: true,
  requestReminders: true,
  systemAlerts: true,
  itemsPerPage: 10,
  dateFormat: "dd/MM/yyyy",
  showTooltips: true,
  debugMode: false,
  autoSave: true,
};

interface SettingsContextType {
  settings: Settings;
  updateSettings: (newSettings: Partial<Settings>) => void;
  resetSettings: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(defaultSettings);

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem("app-settings");
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setSettings({ ...defaultSettings, ...parsed });
      } catch (error) {
        console.warn("Failed to parse saved settings, using defaults");
      }
    }
  }, []);

  // Save settings to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("app-settings", JSON.stringify(settings));
  }, [settings]);

  const updateSettings = (newSettings: Partial<Settings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  };

  const resetSettings = () => {
    setSettings(defaultSettings);
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, resetSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}