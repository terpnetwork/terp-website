import { Box, Flex, Icon, Link, Stack, Text } from "@chakra-ui/react";
import { BsApp } from "react-icons/bs";
import { FaNetworkWired, FaTicketAlt } from "react-icons/fa";
import { FiCalendar, FiHome, FiSettings } from "react-icons/fi";

type IconWrapperProps = {
  icon: React.ElementType;
};

const links = [
    { href: "/poap", label: "Badges (Coming Soon)", icon: FaTicketAlt, disabled: true },
    { href: "/bridge", label: "Bridge (Coming Soon)", icon: FaNetworkWired, disabled: true},
    { href: "/events", label: "Events (Coming Soon)", icon: FiCalendar, disabled: true },
    { href: "/dashboard", label: "Dashboard", icon: BsApp },
    { href: "/gov", label: "Governance", icon: FiHome },
    { href: "/merch", label: "Store (Coming Soon)", icon: FiHome, disabled: true },
    { href: "/multi-sigs", label: "Multi-Sig (Coming Soon)", icon: FiHome, disabled: true },
    { href: "/stake", label: "Staking", icon: FiHome },
    { href: "/swap", label: "Swap ", icon: FiHome,  disabled: true  },
    { href: "/widgets", label: "Widgets (Coming Soon)", icon: FiHome, disabled: true },
  ];
  
  const IconWrapper = ({ icon }: IconWrapperProps) => <Icon as={icon} mr="2" />;

  interface SidebarContentProps {
    activeTab: string | undefined;
    onTabClick: (tab: string) => void;
  }
  
  
export const SideBarContent = ({ activeTab, onTabClick }: SidebarContentProps) => {
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
  <div className="frosted" key={link.label}>
 <Link
  key={link.label}
  href={link.href}
  display="flex"
  alignItems="center"
  color={activeTab === link.label ? "blue.500" : "whiteAlpha.700"}
  onClick={() => onTabClick(link.label)}
  pointerEvents={link.disabled ? "none" : "auto"}
  opacity={link.disabled ? "0.5" : "1"}
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