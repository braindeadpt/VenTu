'use client';

import { useId, type ReactNode } from 'react';
import { Waves, CalendarDays, Sparkles, BarChart3 } from 'lucide-react';

interface TabDef {
  id: string;
  icon: typeof Waves;
  labelPt: string;
  labelEn: string;
}

interface SpotDrawerTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  locale: string;
  children: ReactNode;
}

const TABS: TabDef[] = [
  { id: 'now', icon: Waves, labelPt: 'Agora', labelEn: 'Now' },
  { id: '7d', icon: CalendarDays, labelPt: '7 dias', labelEn: '7 days' },
  { id: 'windows', icon: Sparkles, labelPt: 'Janelas', labelEn: 'Windows' },
  { id: 'seasonality', icon: BarChart3, labelPt: 'Sazonalidade', labelEn: 'Seasonality' },
];

export default function SpotDrawerTabs({
  activeTab,
  onTabChange,
  locale,
  children,
}: SpotDrawerTabsProps) {
  const isPt = locale === 'pt';
  const instanceId = useId();

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-divider -mx-4 px-4" role="tablist">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          const tabId = `drawer-tab-${tab.id}-${instanceId}`;
          const panelId = `drawer-tabpanel-${tab.id}-${instanceId}`;
          return (
            <button
              key={tab.id}
              id={tabId}
              role="tab"
              aria-selected={active}
              aria-controls={panelId}
              tabIndex={active ? 0 : -1}
              onClick={() => onTabChange(tab.id)}
              className={[
                'flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-all whitespace-nowrap',
                active
                  ? 'border-data-waves text-fg'
                  : 'border-transparent text-fg-subtle hover:text-fg hover:border-divider-strong',
              ].join(' ')}
            >
              <Icon className="w-3.5 h-3.5" />
              {isPt ? tab.labelPt : tab.labelEn}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div
        id={`drawer-tabpanel-${activeTab}-${instanceId}`}
        role="tabpanel"
        aria-labelledby={`drawer-tab-${activeTab}-${instanceId}`}
        className="pt-3"
      >
        {children}
      </div>
    </div>
  );
}
