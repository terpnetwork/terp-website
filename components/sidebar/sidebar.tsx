import { Box, Flex, Icon, Link, Stack, Text } from "@chakra-ui/react";
import { BsApp } from "react-icons/bs";
import { FaNetworkWired, FaTicketAlt } from "react-icons/fa";
import { FiCalendar, FiHome, FiSettings } from "react-icons/fi";

const links = [
    { href: "/poap", label: "Badges", icon: FaTicketAlt },
    { href: "/bridge", label: "Bridge", icon: FaNetworkWired },
    { href: "/events", label: "Calendar", icon: FiCalendar },
    { href: "/dashboard", label: "Dashboard", icon: BsApp },
    { href: "/gov", label: "Governance", icon: FiHome },
    { href: "/merch", label: "Marketplace", icon: FiHome },
    { href: "/multi-sigs", label: "Multisigs", icon: FiHome },
    { href: "/stake", label: "Staking", icon: FiHome },
    { href: "/swap", label: "Swap", icon: FiHome },
    { href: "/widgets", label: "Widgets", icon: FiHome },
  ];
  
const IconWrapper = ({ icon }) => <Icon as={icon} mr="2" />;
  
export const SideBarContent = ({ activeTab, onTabClick }) => {
    return (
<div className="left-sidebar">
<Box bg="blackAlpha.800" color="white" w="64" minH="100vh" py="6" px="4">
          <Flex align="center" mb="8">
            <Text fontSize="xl" fontWeight="bold">
              Terp Dashboard
            </Text>
          </Flex>
          <Stack spacing="4">
          {links.map((link) => (
            <div className="frosted">
            <Link
              key={link.label}
              href={link.href}
              display="flex"
              alignItems="center"
              color={activeTab === link.label ? "blue.500" : "whiteAlpha.700"}
            onClick={() => onTabClick(link.label)}
            >
              <IconWrapper icon={link.icon} />
              {link.label}
            </Link>
            </div>
          ))}
          </Stack>
        </Box>
</div>
      );
}