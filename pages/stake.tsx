import StakingContent from "components/apps/staking";
import TwoColumnLayout from "components/layout/twoColumnLayout"
import React from "react";


const DashboardPage = () => {
  return (
    <div  className="two-column-layout">
    <TwoColumnLayout/>
    <StakingContent/>
    </div>
  )
}


export default DashboardPage;