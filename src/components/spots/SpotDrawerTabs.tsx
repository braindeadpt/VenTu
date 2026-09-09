'use client';

import { type ReactNode } from 'react';
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

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-divider -mx-4 px-4" role="tablist">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={active}
              onClick={() => onTabChange(tab.id)}
              className={[
                'flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] text-xs font-medium border-b-2 transition-all whitespace-nowrap',
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
      <div className="pt-3" role="tabpanel">
        {children}
      </div>
    </div>
  );
}
