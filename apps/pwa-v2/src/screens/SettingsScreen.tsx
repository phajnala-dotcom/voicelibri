/**
 * VoiceLibri - Neumorphism Settings Screen
 * COMPLETELY based on themesberg/neumorphism-ui-bootstrap
 * User preferences and app settings
 */

import { 
  User, 
  Volume2, 
  Moon, 
  Sun,
  Monitor,
  Bell,
  Download,
  HelpCircle,
  Info,
  ChevronRight,
  LogOut,
  Gauge,
  Clock,
  Wifi
} from 'lucide-react';
import { useThemeStore } from '../stores/themeStore';
import { Card, CardBody, Toggle } from '../components/ui';

/**
 * Neumorphism Settings Screen
 */
export function SettingsScreen() {
  const { theme, setTheme, resolvedTheme } = useThemeStore();
  
  const themeOptions = [
    { value: 'light' as const, label: 'Light', icon: Sun },
    { value: 'dark' as const, label: 'Dark', icon: Moon },
    { value: 'system' as const, label: 'System', icon: Monitor },
  ];

  return (
    <div className="min-h-screen bg-[var(--neu-body-bg)]">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[var(--neu-body-bg)] shadow-[var(--neu-shadow-light)]">
        <div className="px-4 py-4">
          <h1 className="text-2xl font-bold text-[var(--neu-dark)]">Settings</h1>
        </div>
      </header>

      <div className="px-4 py-4 space-y-6">
        {/* Profile section */}
        <Card className="p-4 flex items-center gap-4 cursor-pointer active:shadow-[var(--neu-shadow-inset)]">
          <div className="w-16 h-16 neu-pressed rounded-full flex items-center justify-center">
            <User className="w-8 h-8 text-[var(--neu-secondary)]" />
          </div>
          <div className="flex-1">
            <h3 className="text-[var(--neu-dark)] font-semibold">Guest User</h3>
            <p className="text-[var(--neu-gray-700)] text-sm">Sign in to sync your library</p>
          </div>
          <ChevronRight className="w-5 h-5 text-[var(--neu-gray-600)]" />
        </Card>

        {/* Theme Selection */}
        <div className="space-y-2">
          <h4 className="text-xs text-[var(--neu-gray-600)] uppercase tracking-wider font-semibold px-1">
            Appearance
          </h4>
          <Card>
            <CardBody>
              <div className="flex items-center gap-2 mb-3">
                {resolvedTheme === 'dark' ? (
                  <Moon className="w-5 h-5 text-[var(--neu-gray-700)]" />
                ) : (
                  <Sun className="w-5 h-5 text-[var(--neu-gray-700)]" />
                )}
                <span className="text-[var(--neu-dark)] text-sm font-semibold">Theme</span>
              </div>
              <div className="flex gap-2">
                {themeOptions.map((option) => {
                  const Icon = option.icon;
                  const isActive = theme === option.value;
                  return (
                    <button
                      key={option.value}
                      onClick={() => setTheme(option.value)}
                      className={`
                        flex-1 flex flex-col items-center gap-2 p-3 
                        rounded-[var(--neu-radius)] 
                        transition-all duration-200
                        ${isActive
                          ? 'neu-pressed text-[var(--neu-secondary)]'
                          : 'neu-raised text-[var(--neu-gray-700)] hover:text-[var(--neu-dark)]'
                        }
                      `}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-xs font-semibold">{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Playback Settings */}
        <div className="space-y-2">
          <h4 className="text-xs text-[var(--neu-gray-600)] uppercase tracking-wider font-semibold px-1">
            Playback
          </h4>
          <Card className="divide-y divide-[var(--neu-gray-400)]">
            <SettingRow icon={Gauge} label="Default Speed" value="1.0x" />
            <SettingRow icon={Clock} label="Skip Duration" value="15 seconds" />
            <SettingToggle icon={Volume2} label="Volume Boost" defaultValue={false} />
            <SettingToggle icon={Moon} label="Auto Sleep Timer" defaultValue={true} />
          </Card>
        </div>

        {/* Storage Settings */}
        <div className="space-y-2">
          <h4 className="text-xs text-[var(--neu-gray-600)] uppercase tracking-wider font-semibold px-1">
            Storage
          </h4>
          <Card className="divide-y divide-[var(--neu-gray-400)]">
            <SettingRow icon={Download} label="Download Quality" value="High" />
            <SettingToggle icon={Wifi} label="WiFi Only Downloads" defaultValue={true} />
          </Card>
        </div>

        {/* Notifications */}
        <div className="space-y-2">
          <h4 className="text-xs text-[var(--neu-gray-600)] uppercase tracking-wider font-semibold px-1">
            Notifications
          </h4>
          <Card>
            <SettingToggle icon={Bell} label="Push Notifications" defaultValue={true} />
          </Card>
        </div>

        {/* Support */}
        <div className="space-y-2">
          <h4 className="text-xs text-[var(--neu-gray-600)] uppercase tracking-wider font-semibold px-1">
            Support
          </h4>
          <Card className="divide-y divide-[var(--neu-gray-400)]">
            <SettingRow icon={HelpCircle} label="Help & FAQ" />
            <SettingRow icon={Info} label="About VoiceLibri" />
          </Card>
        </div>

        {/* Sign out */}
        <button className="
          w-full neu-card px-4 py-3 
          flex items-center gap-3 
          text-[var(--neu-danger)]
          hover:shadow-[var(--neu-shadow-soft)]
          active:shadow-[var(--neu-shadow-inset)]
          transition-all duration-200
        ">
          <LogOut className="w-5 h-5" />
          <span className="text-sm font-semibold">Sign Out</span>
        </button>

        {/* Version */}
        <div className="text-center text-[var(--neu-gray-600)] text-xs py-4">
          VoiceLibri v1.0.0
        </div>
      </div>
    </div>
  );
}

// Helper components
function SettingRow({ 
  icon: Icon, 
  label, 
  value 
}: { 
  icon: React.ComponentType<{ className?: string }>; 
  label: string; 
  value?: string;
}) {
  return (
    <button className="
      w-full px-4 py-3 
      flex items-center gap-3 
      hover:bg-[var(--neu-gray-300)]/50 
      transition-colors
    ">
      <Icon className="w-5 h-5 text-[var(--neu-gray-700)]" />
      <span className="flex-1 text-left text-[var(--neu-body-color)] text-sm font-medium">{label}</span>
      {value ? (
        <span className="text-[var(--neu-gray-600)] text-sm">{value}</span>
      ) : (
        <ChevronRight className="w-4 h-4 text-[var(--neu-gray-600)]" />
      )}
    </button>
  );
}

function SettingToggle({ 
  icon: Icon, 
  label, 
  defaultValue 
}: { 
  icon: React.ComponentType<{ className?: string }>; 
  label: string; 
  defaultValue: boolean;
}) {
  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <Icon className="w-5 h-5 text-[var(--neu-gray-700)]" />
      <span className="flex-1 text-left text-[var(--neu-body-color)] text-sm font-medium">{label}</span>
      <Toggle defaultChecked={defaultValue} />
    </div>
  );
}
