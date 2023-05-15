

export type ImageSource = {
    imageSource: 'cosmostation' | 'keybase';
};

export interface MyValidator {
    details: string | undefined;
    name: string | undefined;
    address: string;
    staked: number;
    reward: number;
    identity: string | undefined;
    commission: string | undefined;
}