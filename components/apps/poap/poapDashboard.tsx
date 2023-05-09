import Head from "next/head";
import { NextPage } from "next";

import Claim from "./claim";
import React from "react";

const PoapContent: NextPage = () => {
  return (
    <>
      <Head>
        <title>badges | claim</title>
      </Head>
     
      <Claim />
    </>
  );
};

export default PoapContent;
