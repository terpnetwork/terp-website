/* eslint-disable @next/next/no-img-element */
import Head from 'next/head';
import {
  Box,
  Divider,
  Grid,
  Heading,
  Text,
  Stack,
  Container,
  Link,
  Button,
  Flex,
  Icon,
  useColorMode,
  useColorModeValue,
} from '@chakra-ui/react';
import Image from 'next/image'
import { Product, Dependency, WalletSection } from '../components';
import { dependencies, products } from '../config';
import { useTheme } from '../contexts/theme';
import { MoonIcon, SunIcon } from '@heroicons/react/24/outline';
import { Banner } from '../components/homepage/banner';
import { Ecosystem } from '../components/homepage/ecosystem';
import { Network } from '../components/homepage';

export default function Home() {
  const chainName = process.env.NEXT_PUBLIC_CHAIN ?? 'terpnetwork';
  const { theme, toggleTheme } = useTheme();

  return (
    <Container maxW="5xl"  py={10}> 
      <Head>
        <title>Terp Network</title>
        <meta name="description" content="The Culture's Verifiable Platform" />
        <link rel="icon" href="/favicon.ico" />
      </Head>


      <Banner/>
      <Ecosystem/>
      <Network/>
     


      <div className="flex justify-center pt-6 text-sm text-center border-t border-black/10 dark:border-white/10">
        <span className="flex flex-row items-center space-x-2">
          <p>Built with</p>
          <a
            href="https://cosmology.tech/"
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
        src="/cosmology.webp"
              className="w-auto h-4 transition duration-150 transform cursor-pointer hover:scale-105"
              alt="cosmology"
      />
          </a>
        </span>
      </div>

    </Container>
  );
}
