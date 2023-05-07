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
  Link,
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
import { ChevronLeftIcon } from '@chakra-ui/icons';
// import Homebutton from './homebutton';


export const Banner = () => {

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
        <div className="frosted">
        Ecosystem
        </div>
      </div>
  
      <div className='navbarcontent  p-4 '>
        <div className="frosted">
        Blog
        </div>
      </div>
      <div className='navbarcontent  p-4 '>
        <div className="frosted">
        Documentation
        </div>
      </div>
      <div className='navbarcontent  p-4 '>
        <div className="frosted">
        Dashboard
        </div>
      </div>
    </Center>
  )
}