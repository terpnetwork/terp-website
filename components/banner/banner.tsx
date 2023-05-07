import React from 'react'
import Image from 'next/image';
import { BsCloudSun, BsFillMoonStarsFill, BsFillSunFill, BsPencilSquare, BsThreeDotsVertical } from 'react-icons/bs';
import {
  Box,
  Button,
  ButtonGroup,
  Container,
  Flex,
  HStack,
  useBreakpointValue,
  useColorMode,
  useColorModeValue,
  Text,
  Divider,
  useDisclosure,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  Heading,
  Center,
  Modal,
  ModalContent,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  ModalCloseButton,
} from '@chakra-ui/react'
import Link from 'next/link';
import { useRouter } from 'next/router';
// import Homebutton from './homebutton';


export const Banner = () => {

  const router = useRouter();

  const handleClick = (buttonId: string) => {
    switch (buttonId) {
      case 'ecosystem':
        router.push('/ecosystem');
        break;
      case 'blog':
        router.push('/blog');
        break;
      case 'docs':
        router.push('https://docs.terp.network');
        break;
      case 'dashboard':
        router.push('/dashboard');
        break;
      default:
        break;
    }
  };
    const OverlayOne = () => (
        <ModalOverlay
          bg='none'
          backdropFilter='auto'
          backdropInvert='80%'
          backdropBlur='2px'
        />
      )


  const { colorMode, toggleColorMode } = useColorMode();
  const { isOpen, onOpen, onClose } = useDisclosure()
  const [overlay, setOverlay] = React.useState(<OverlayOne />)

  return (
    <Center >
      <div className='navbarcontent p-4 '>
        <Button className="frosted"
        onClick={() => handleClick('ecosystem')} >
        Ecosystem
        </Button>
      </div>
  
      <div className='navbarcontent  p-4 '>
        <Button className="frosted"
        onClick={() => handleClick('blog')} >
        Blog
        </Button>
      </div>
      <div className='navbarcontent  p-4 '>
        <Button className="frosted"
        onClick={() => handleClick('docs')} >
        Documentation
        </Button>
      </div>
      <div className='navbarcontent  p-4 '>
        <Button className="frosted"
           onClick={() => handleClick('dashboard')} >
        Dashboard
        </Button>
      </div>
    </Center>
  )
}