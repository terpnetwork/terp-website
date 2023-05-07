import React from 'react';
import { MetaProps } from '../types/layout';
import Head from './head';
import { Center } from '@chakra-ui/react';


type LayoutProps = {
  children: React.ReactNode;
  customMeta?: MetaProps;
};

export const WEBSITE_HOST_URL = 'https://nextjs-typescript-mdx-blog.vercel.app';

const Layout = ({ children, customMeta }: LayoutProps): JSX.Element => {
  return (
    <>
      <Head customMeta={customMeta} />
        <Center>
      <header>
        <div className="max-w-5xl px-8 mx-auto">
          <div className="flex items-center justify-between py-6">
  
          </div>
        </div>
      </header>
      <main>
        <div className="max-w-5xl px-8 py-4 mx-auto">{children}</div>
      </main>
      </Center>

    </>
  );
};

export default Layout;