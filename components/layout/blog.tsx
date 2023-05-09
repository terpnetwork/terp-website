import React from 'react';
import { MetaProps } from '../../types/layout';
import Head from '../head';
import { Center } from '@chakra-ui/react';


type LayoutProps = {
  children: React.ReactNode;
  customMeta?: MetaProps;
};

export const WEBSITE_HOST_URL = 'https://terp.network/blogs';

const BlogLayout = ({ children, customMeta }: LayoutProps): JSX.Element => {
  return (
    <>
      <Head customMeta={customMeta} />
        <Center>
     
      <main>
        <div className="max-w-5xl px-8 py-4 mx-auto">{children}</div>
      </main>
      </Center>

    </>
  );
};

export default BlogLayout;