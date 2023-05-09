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
import {WalletSection} from '../../wallet'
import {VotingSection} from './react/vote'
import { useState } from 'react';
import { ChainName } from '@cosmos-kit/core';
import React from 'react';

export default function GovContent() {
  const { colorMode, toggleColorMode } = useColorMode();
  const [chainName, setChainName] = useState<ChainName | undefined>('osmosis');

  return (
    <Container maxW="5xl" py={10}>
      <Flex justifyContent="end" mb={4}>
        <Button variant="outline" px={0} onClick={toggleColorMode}>
          <Icon
            as={colorMode === 'light' ? BsFillMoonStarsFill : BsFillSunFill}
          />
        </Button>
      </Flex>
      <Box textAlign="center">
        <Heading
          as="h1"
          fontSize={{ base: '3xl', sm: '4xl', md: '5xl' }}
          fontWeight="extrabold"
          mb={3}
        >
          Create Cosmos App
        </Heading>
        <Heading
          as="h1"
          fontWeight="bold"
          fontSize={{ base: '2xl', sm: '3xl', md: '4xl' }}
        >
          <Text as="span">Welcome to&nbsp;</Text>
          <Text
            as="span"
            color={useColorModeValue('primary.500', 'primary.200')}
          >
            CosmosKit + Next.js
          </Text>
        </Heading>
      </Box>
      <WalletSection chainName={chainName} setChainName={setChainName} />
      {chainName && <VotingSection chainName={chainName} />}
    </Container>
  );
}
