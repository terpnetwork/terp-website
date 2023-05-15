import React from "react";
import { Card, CardGroup } from "react-bootstrap"
import validator from '../../public/validatoricon.svg';
import community from  '../../public/community.svg';
import build from '../../public/buildon.svg';
import {
    TERPNET_DISCORD_URL, TERPNET_GITHUB_URL,TERPNET_MEDIUM_URL,TERPNET_REDDIT_URL,
    TERPNET_ELEMENT_URL,
    TERPNET_TWITTER_URL,TERPNET_YOUTUBE_URL
 } from "../../config/defaults";
import { Icon } from "@chakra-ui/react";
import Link from "next/link";

 

export const TerpEcosystem = () => {

    const socialList: {url: string, iconName: string, tooltip: string}[] = [
        {
            url:TERPNET_TWITTER_URL,
            iconName: 'twitter-logo',
            tooltip: 'twitter'
        },
        {
            url:TERPNET_YOUTUBE_URL,
            iconName: 'youtube',
            tooltip: 'youtube'
        },
        {
            url:TERPNET_MEDIUM_URL,
            iconName: 'mediumlink',
            tooltip: 'medium'
        },
        {
            url:TERPNET_REDDIT_URL,
            iconName: 'reddit-round',
            tooltip: 'reddit'
        },
        {
            url:TERPNET_ELEMENT_URL,
            iconName: 'telegram-plane',
            tooltip: 'telegram'
        },
        {
            url: TERPNET_DISCORD_URL ,
            iconName: 'discord',
            tooltip: 'discord'
        }, {
            url: TERPNET_GITHUB_URL,
            iconName: 'github',
            tooltip: 'github'
        }
    ];
    
    
    return (
        <section className="home-ecosystem-section TerpEcosystem">
            <div className="container">
                <h3 className="section-title">Get Involved In Terp Network.</h3> 
                <h3 className="section-title"> Powered by <span className={"subt"}>TERP <span>&</span> THIOL</span>.</h3>
                <p className="sub-heading"></p>
                <div className="card-tiles">
                    <CardGroup>
                        <Card className={'h-100'}>
                            <div className={'card-section'}>
                                <Card.Body >
                                    <div className={"symbol-section"}>
                                        <Card.Img variant="top" src={build} />

                                    <h5>&nbsp;</h5>
                                    </div>

                                    <Card.Title className={'mb-3 mt-4'}>Documentation For Your Terp Network Experience</Card.Title>
                                    <Card.Text>
                                       Join our discord to grow our resources together!
                                    </Card.Text>
                                    <div className={"button-section cards-buttons mt-5"}>
                                        <a href="https://docs.terp.network/cosmwasm/" rel="noopener noreferrer"
                                           target="_blank" className="button-initial button">
                                            CosmWasm
                                        </a>
                                        <a href="https://docs.terp.network/frontend/" rel="noopener noreferrer"
                                           target="_blank" className="button-initial button ml-3">
                                            Frontends & Client Tooling
                                        </a>
                                    </div>
                                </Card.Body>
                            </div>

                        </Card>
                        <Card className={'h-100'}>
                            <div className={'card-section h-100'}>
                                <Card.Body >
                                    <div className={"symbol-section"}>
                                        <Card.Img variant="top" src={validator} />
                                        <h5>&nbsp;</h5>
                                    </div>
                                    <Card.Title className={'mb-3 mt-4'}>Learn How to Become a Validator</Card.Title>
                                    <Card.Text>
                                        decentralize secure the network, and practice sovereignty. 
                                    </Card.Text>

                                    <div className={"comingsoon cards-buttons button-section mt-5"}>
                                    <Link href="https://docs.terp.network/overview/validate"
                                     target="_blank" rel="noopener noreferrer" className="button-initial button" >
                                     DOCS
                                    </Link>
                                    </div>
                                </Card.Body>
                            </div>
                        </Card>
                        <Card className={'h-100'}>
                            <div className={'card-section h-100'}>
                                <Card.Body >
                                    <div className={"symbol-section"}>
                                        <Card.Img variant="top" src={community} />
                                        <h5>&nbsp;</h5>
                                    </div>
                                    <Card.Title className={'mb-3 mt-4'}>TerpNET Community</Card.Title>
                                    <Card.Text>

                                    <div className="links">



                                        </div>
                                    </Card.Text>

                                    <div className={"comingsoon cards-buttons button-section mt-5"}>
                                        <Link href="/ecosystem" rel="noopener noreferrer" className="button-initial button">
                                            ECOSYSTEM
                                        </Link>
                                        <Link href="https://bit.ly/38VBfme" rel="noopener noreferrer"
                                            className="button-initial button ml-3">
                                            Zealy
                                        </Link>
                                    </div>
                                </Card.Body>
                            </div>
                        </Card>
                    </CardGroup>
                </div>
            </div>
        </section>
    )
}
