import React, { useState } from 'react';
import DashboardContent from '../apps/dashboard';
import { SideBarContent } from 'components/sidebar';

const TwoColumnLayout = () => {
  const [activeTab, setActiveTab] = useState(undefined);

  const handleTabClick = (tab: React.SetStateAction<undefined>) => {
    setActiveTab(tab);
  };

  return (
    <div className="two-column-layout">
      <SideBarContent activeTab={activeTab} onTabClick={handleTabClick} />
      {activeTab === 'dashboard' && <DashboardContent />}
      {activeTab === 'badges' && <h1>Badges Content</h1>}
      {activeTab === 'bridge' && <h1>Bridge Content</h1>}
      {activeTab === 'calendar' && <h1>Calendar Content</h1>}
      {activeTab === 'governance' && <h1>Governance Content</h1>}
      {activeTab === 'marketplace' && <h1>Marketplace Content</h1>}
      {activeTab === 'multisigs' && <h1>Multisigs Content</h1>}
      {activeTab === 'staking' && <h1>Staking Content</h1>}
      {activeTab === 'swap' && <h1>Swap Content</h1>}
      {activeTab === 'widgets' && <h1>Widgets Content</h1>}
    </div>
  );
};

export default TwoColumnLayout;