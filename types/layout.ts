import { PostType } from './post';

export interface MetaProps
  extends Pick<PostType, 'date' | 'description' | 'image' | 'title'> {
  /**
   * For the meta tag `og:type`
   */
  type?: string;
}

export interface MobileProps {
  isMobile?: boolean;
}

export const enum Breakpoint {
  SM = 640,
  MD = 768,
  LG = 1024,
  XLG = 1152,
  XL = 1280,
  XLHALF = 1408,
  XXL = 1536,
}