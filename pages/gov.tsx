import React from "react";
import TwoColumnLayout from "components/layout/twoColumnLayout"
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
import { BsFillMoonStarsFill, BsFillSunFill } from 'react-icons/bs';
import {VotingSection} from '../components/apps/gov/react/vote'
import { useState } from 'react';
import { ChainName } from '@cosmos-kit/core';
import { WalletSection } from "components/wallet";


export default function GovernancePage(){

  const { colorMode, toggleColorMode } = useColorMode();
  const [chainName, setChainName] = useState<ChainName | undefined>('terpnetwork');
  return (
    <div  className="two-column-layout">
    <TwoColumnLayout/>
    <Container maxW="5xl" py={10}>
      <Flex justifyContent="end" mb={4}>
   
      </Flex>
      <Box textAlign="center">
        <Heading
          as="h1"
          fontSize={{ base: '3xl', sm: '4xl', md: '5xl' }}
          fontWeight="extrabold"
          mb={3}
        >
       Governance Dashboard
        </Heading>
      </Box>
      <WalletSection chainName={chainName} setChainName={setChainName} />
      {chainName && <VotingSection chainName={chainName} />}
    </Container>
    </div>
  )
}
