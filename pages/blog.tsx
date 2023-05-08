import { format, parseISO } from 'date-fns';
import { GetStaticProps } from 'next';
import Link from 'next/link';
import React from 'react';
import Layout from '../components/layout';
import { getAllPosts } from '../lib/api';
import { PostType } from '../types/post';
import { Button, Center, Heading, SimpleGrid } from '@chakra-ui/react';

type IndexProps = {
  posts: PostType[];
};

export const Index = ({ posts }: IndexProps): JSX.Element => {
  return (
    <Layout>
     
     <Center><Heading>All Blogs</Heading></Center>
     

      {posts.map((post) => (
        <SimpleGrid>
          <Center>
        <article key={post.slug} className="mt-12 frosted blog-card ">
          
          <p className="mb-1 text-sm text-gray-500 dark:text-gray-400">
          </p>
          <h1 className="mb-2 text-xl">
            <Link as={`/posts/${post.slug}`} href={`/posts/[slug]`}>
              <a className="text-gray-900 dark:text-white dark:hover:text-blue-400">
                {post.title}
              </a>
            </Link>
          </h1>
         
          <p className="mb-3 text">{post.description}</p>
          <Button>
            <Link as={`/posts/${post.slug}`} href={`/posts/[slug]`}>
              <a>Read More</a>
            </Link>
          </Button>
        </article>
        </Center>
        </SimpleGrid>
      ))}

    </Layout>
  );
};

export const getStaticProps: GetStaticProps = async () => {
  const posts = getAllPosts(['date', 'description', 'slug', 'title']);

  return {
    props: { posts },
  };
};

export default Index;