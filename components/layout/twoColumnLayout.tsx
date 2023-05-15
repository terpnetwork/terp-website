import React, { useState } from 'react';
import DashboardContent from '../apps/dashboard';
import { SideBarContent } from 'components/sidebar';



const TwoColumnLayout = () => {
  const [activeTab, setActiveTab] = useState<string>();

  const handleTabClick = (tab: string) => {
    setActiveTab(tab);
  };


  return (
    <div >
       {activeTab !== undefined ? (
        <>
      <SideBarContent activeTab={activeTab} onTabClick={handleTabClick} />
      {activeTab === 'dashboard' && <DashboardContent />}
      {activeTab === 'badges' && <h1>Badges Content</h1>}
      {activeTab === 'bridge' && <h1>Bridge Content</h1>}
      {activeTab === 'events' && <h1>Event Content</h1>}
      {activeTab === 'governance' && <h1>Governance Content</h1>}
      {activeTab === 'marketplace' && <h1>Marketplace Content</h1>}
      {activeTab === 'multisigs' && <h1>Multisigs Content</h1>}
      {activeTab === 'staking' && <h1>Staking Content</h1>}
      {activeTab === 'swap' && <h1>Swap Content</h1>}
      {activeTab === 'widgets' && <h1>Widgets Content</h1>}
      </>
       ) : (
       <div>
          <SideBarContent activeTab={activeTab} onTabClick={handleTabClick} />
      {activeTab === 'dashboard' && <DashboardContent />}
      {activeTab === 'badges' && <h1>Badges Content</h1>}
      {activeTab === 'bridge' && <h1>Bridge Content</h1>}
      {activeTab === 'events' && <h1>Event Content</h1>}
      {activeTab === 'governance' && <h1>Governance Content</h1>}
      {activeTab === 'marketplace' && <h1>Marketplace Content</h1>}
      {activeTab === 'multisigs' && <h1>Multisigs Content</h1>}
      {activeTab === 'staking' && <h1>Staking Content</h1>}
      {activeTab === 'swap' && <h1>Swap Content</h1>}
      {activeTab === 'widgets' && <h1>Widgets Content</h1>}
       </div>
      )}
       </div>
         );
};

export default TwoColumnLayout;