import { RefObject } from "react"

export interface ChooseChainInfo {
    chainName: string
    chainRoute?: string
    label: string
    value: string
    icon?: string
    disabled?: boolean
  }

  export interface ChainCardProps {
    prettyName: string
    icon?: string
    
  }

  export interface OptionBase {
    variant?: string;
    colorScheme?: string;
    isFixed?: boolean;
    isDisabled?: boolean;
  }
  
  export interface ChainOption extends OptionBase {
    isDisabled?: boolean;
    label: string;
    value: string;
    icon?: string;
    chainName: string;
    chainRoute?: string;
    id?: string;
  }

  export type handleSelectChainDropdown = (value: ChainOption | null) => void;

export interface ChangeChainDropdownType {
  data: ChainOption[];
  selectedItem?: ChainOption;
  onChange: handleSelectChainDropdown;
  chainDropdownLoading?: boolean;
}

export interface ChangeChainMenuType {
  data: ChainOption[];
  value?: ChainOption;
  onClose?: () => void;
  onChange: handleSelectChainDropdown;
  innerRef?: RefObject<HTMLInputElement>;
}