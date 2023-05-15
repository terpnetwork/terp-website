import DashboardContent from "components/apps/dashboard/dashboard";
import TwoColumnLayout from "components/layout/twoColumnLayout"


const DashboardPage = () => {
  return (
    <div  className="two-column-layout">
    <TwoColumnLayout/>
    <DashboardContent/>
    </div>
  )
}


export default DashboardPage;