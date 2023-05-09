import TwoColumnLayout from "components/layout/twoColumnLayout"
import PoapContent from "../components/apps/poap/poapDashboard";
import React from "react";


export default function PoapPage(){
  return (
    <div  className="two-column-layout">
    <TwoColumnLayout/>
    <PoapContent/>
    </div>
  )
}

