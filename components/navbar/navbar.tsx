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
import { SideBarContent } from '../sidebar';
// import Homebutton from './homebutton';


export const NavBar = () => {

  const router = useRouter();

  const handleClick = (buttonId: string) => {
    switch (buttonId) {
      case 'blog':
        router.push('/blog');
        break;
      case 'dashboard':
        router.push('/dashboard');
        break;
      case 'docs':
        router.push('https://docs.terp.network');
        break;
      case 'ecosystem':
        router.push('/ecosystem');
        break;
      case 'home':
        router.push('https://terp.network');
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
    <div className='navbar-bg'>
    <Center >
    <div className='navbarcontent p-4 '>
        <Button className="frosted"
        onClick={() => handleClick('home')} >
        Home
        </Button>
      </div>
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
    </div>
  )
}