import { format, parseISO } from 'date-fns';
import { GetStaticProps } from 'next';
import Link from 'next/link';
import React from 'react';
import BlogLayout from '../components/layout/blog';
import { getAllPosts } from '../lib/api';
import { PostType } from '../types/post';
import { Button, Center, Grid, GridItem, Heading, SimpleGrid } from '@chakra-ui/react';

type IndexProps = {
  posts: PostType[];
};

export const Index = ({ posts }: IndexProps): JSX.Element => {
  return (
    <BlogLayout>
     <Center><Heading>All Blogs</Heading></Center>
     <Grid templateColumns={{ sm: 'repeat(1, 1fr)', md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }} gap={6}>
      {posts.map((post) => (
            <GridItem key={post.slug}>
               <Link as={`/posts/${post.slug}`} href={`/posts/[slug]`}>
        <article key={post.slug} className="mt-12 frosted-blog blog-card " style={{ minHeight: "300px" }} >
          <p className="mb-1 text-sm text-gray-500 dark:text-gray-400">
          </p>
          <h1 className="mb-2 text-xl">
          <Link as={`/posts/${post.slug}`} href={`/posts/[slug]`}>
              <a className="text-gray-900 dark:text-white dark:hover:text-blue-400 ">
                {post.title}
              </a>
            </Link>
          </h1>
          <div className="flex-grow mb-3">
          <p className="mb-3 dark:text-white-900 ">{post.description}</p>
            </div>
        </article>
        </Link>
        </GridItem>
        
      ))}
</Grid>
    </BlogLayout>
  );
};

export const getStaticProps: GetStaticProps = async () => {
  const posts = getAllPosts(['date', 'description', 'slug', 'title']);

  return {
    props: { posts },
  };
};

export default Index;