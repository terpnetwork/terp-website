import { useRouter } from "next/router";
import React, { FunctionComponent } from "react";
import {  useWindowSize } from "../../hooks";
import { MainMenu } from "../main-menu";
import { NavBar } from "../navbar";


export const MainLayout = () => {
  const router = useRouter();

  const { height, isMobile } = useWindowSize();

  const smallVerticalScreen = height < 850;

  const showFixedLogo = !smallVerticalScreen && !isMobile;
  const showBlockLogo = smallVerticalScreen && !isMobile;



  return (
    <React.Fragment>
      {showFixedLogo && (
        <div className="fixed z-50 w-sidebar px-5 pt-6">
       
        </div>
      )}
      <article className="fixed inset-y-0 z-40 flex w-sidebar flex-col overflow-x-hidden bg-osmoverse-800 px-2 py-6 md:hidden">

        <MainMenu  />
        <div className="flex flex-1 flex-col justify-end">
          
                </div>
      </article>
      <NavBar
     

      />
      <div className="ml-sidebar h-content bg-osmoverse-900 md:ml-0 md:h-content-mobile">

      </div>
    </React.Fragment>
  );
}
