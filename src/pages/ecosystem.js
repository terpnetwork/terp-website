import * as React from "react"
import {AnchorLink} from "gatsby-plugin-anchor-links";
import Layout from "../components/layout";
import Ecosystem from "../components/ecosystem";
import EcosystemVideoMov from "../videos/ecosystem-small.mp4";
import EcosystemVideo from "../videos/ecosystem-small.webm";
import EcosystemPoster from "../videos/ecosystem.png";
import {useState, useEffect} from "react";

const menu = require('../contents/urls.json');
const ecosystems = require('../contents/ecosystems.json');
const daos = require('../contents/daos.json');

function toggleNav(){
    document.getElementById('filter-nav').classList.toggle('opened');
}

function loadTab(props){
    const hashtag = window.location.hash
    if (!hashtag) {
        const currentCategory = props.location.hash ? props.location.hash.substring(1) : 'dapp';
        document.getElementById('nav-'+currentCategory+'-tab').click();
    }
}

const EcosystemPage = (props) => {
    function checkSoon(){
        for (var index = 0; index < ecosystems.length; ++index) {
            var ecosystem = ecosystems[index];
            if(ecosystem.category == "Soon"){
                setSoon(true);
                break;
            }
        }
    }
    const [hasSoon, setSoon] = useState(false);
    const [isSafari, setSafari] = useState(false);
    useEffect(() => {
        loadTab(props);
        checkSoon()
        document.getElementById('filter-nav').classList.remove('opened');
        window.scrollTo(0,0)
        setSafari(/constructor/i.test(window.HTMLElement) || (function (p) { return p.toString() === "[object SafariRemoteNotification]"; })(!window['safari'] || (typeof safari !== 'undefined' && safari.pushNotification)));
    });
    return (
        <div className={'ecosystem-page'}>
            <Layout>
                <section className={'hero-section'}>
                    <div className={'container'}>
                        <div className={'video-container'}>
                            <div className={'video-wrapper'}>
                                <div className={'video-bg'}/>
                                {/* <video autoPlay={true} loop={true} preload={'none'} playsInline={true} muted={true} poster={EcosystemPoster}>
                                    {isSafari &&
                                        <source src={EcosystemVideoMov} type='video/mp4;codecs="hvc1"'/>
                                    }
                                    {!isSafari &&
                                        <source src={EcosystemVideo} type="video/webm" />
                                    }
                                </video> */}
                            </div>
                        </div>
                        <div className={'row'}>
                            <div className={'col-12 col-sm-8 col-xl-10'}>
                                <h1 data-sal="fade"
                                    data-sal-delay="200"
                                    data-sal-duration="1000">The Ecosystem
                                </h1>

                                <div className={'text-box'} data-sal="fade"
                                     data-sal-delay="400"
                                     data-sal-duration="1000">
                                   Check out applications on Terp Network & within the larger Interchain Ecosystem
                                </div>

                                <div className={'row'} data-sal="fade"
                                     data-sal-delay="600"
                                     data-sal-duration="1000">
                                    <div className={'col-auto'}>
                                        <AnchorLink to={'/ecosystem/#browse'}>
                                            <button type={'button'}>Start browsing</button>
                                        </AnchorLink>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section id={'browse'} className={'search-section mt-4 mt-lg-5'}>
                    <div className={'container'}>
                        <div className={'row justify-content-between'}>
                            <div className={'col-auto'}>
                                <h5 className={'mb-3 mb-lg-4 mb-xl-1'}
                                    data-sal="fade"
                                    data-sal-delay="200"
                                    data-sal-duration="1000">Browse The Ecosystem
                                </h5>
                            </div>
                            <div className={'col-12 col-md-auto'}>
                                <nav>
                                    <div className="nav nav-tabs" id="filter-nav" role="tablist">
                                        <button className="nav-link active" id="nav-dapp-tab"
                                                onClick={()=>toggleNav()}
                                                data-bs-toggle="tab" data-bs-target="#nav-dapp" type="button"
                                                role="tab" aria-controls="nav-dapp" aria-selected="true">Dapp
                                        </button>
                                        <button className="nav-link" id="nav-contract-tab" data-bs-toggle="tab"
                                                onClick={()=>toggleNav()}
                                                data-bs-target="#nav-contract" type="button" role="tab"
                                                aria-controls="nav-contract" aria-selected="false">Contract
                                        </button>
                                        <button className="nav-link" id="nav-tool-tab" data-bs-toggle="tab"
                                                onClick={()=>toggleNav()}
                                                data-bs-target="#nav-tool" type="button" role="tab"
                                                aria-controls="nav-tool" aria-selected="false">Tool
                                        </button>
                                        <button className="nav-link" id="nav-dao-tab" data-bs-toggle="tab"
                                                onClick={()=>toggleNav()}
                                                data-bs-target="#nav-dao" type="button" role="tab"
                                                aria-controls="nav-dao" aria-selected="false">DAO
                                        </button>
                                        <button className="nav-link" id="nav-nft-tab" data-bs-toggle="tab"
                                                onClick={()=>toggleNav()}
                                                data-bs-target="#nav-nft" type="button" role="tab"
                                                aria-controls="nav-nft" aria-selected="false">NFT
                                        </button>
                                        <button className="nav-link" id="nav-network-tab" data-bs-toggle="tab"
                                                onClick={()=>toggleNav()}
                                                data-bs-target="#nav-networks" type="button" role="tab"
                                                aria-controls="nav-networks" aria-selected="false">Networks
                                        </button>
                                        <button className="nav-link" id="nav-soon-tab" data-bs-toggle="tab"
                                                onClick={()=>toggleNav()}
                                                data-bs-target="#nav-soon" type="button" role="tab"
                                                aria-controls="nav-soon" aria-selected="false">Soon
                                        </button>
                                        <button className="nav-link" id="nav-all-tab"
                                                onClick={()=>toggleNav()}
                                                data-bs-toggle="tab" data-bs-target="#nav-all" type="button"
                                                role="tab" aria-controls="nav-all" aria-selected="true">All
                                        </button>
                                    </div>
                                </nav>
                            </div>
                        </div>


                        <div className="tab-content pt-3" id="nav-tabContent">

                            <div className="tab-pane fade show active" id="nav-dapp" role="tabpanel"
                                 aria-labelledby="nav-dapp-tab">
                                <div className={'row mt-5'}>
                                    <div className={'col-12'}>
                                        <h6 className={'mb-2'}>Dapps</h6>
                                    </div>
                                </div>
                                <div className={'row'}>
                                    {ecosystems.map((ecosystem,index) => {
                                        return (
                                            ecosystem.category === 'Dapp' && (<div key={index} className={'col-6 col-md-3 p-2'}>
                                                <Ecosystem ecosystem={ecosystem}/>
                                            </div>)
                                        )
                                    })}
                                </div>
                            </div>

                            <div className="tab-pane fade" id="nav-contract" role="tabpanel"
                                 aria-labelledby="nav-contract-tab">
                                <div className={'row mt-5'}>
                                    <div className={'col-12'}>
                                        <h6 className={'mb-2'}>Contracts</h6>
                                    </div>
                                </div>
                                <div className={'row'}>
                                    {ecosystems.map((ecosystem,index) => {
                                        return (
                                            ecosystem.category === 'Contract' && (<div key={index} className={'col-6 col-md-3 p-2'}>
                                                <Ecosystem ecosystem={ecosystem}/>
                                            </div>)
                                        )
                                    })}
                                </div>
                            </div>

                            <div className="tab-pane fade" id="nav-tool" role="tabpanel"
                                 aria-labelledby="nav-tool-tab">
                                <div className={'row mt-5'}>
                                    <div className={'col-12'}>
                                        <h6 className={'mb-2'}>Tools</h6>
                                    </div>
                                </div>
                                <div className={'row'}>
                                    {ecosystems.map((ecosystem,index) => {
                                        return (
                                            ecosystem.category === 'Tool' && (<div key={index} className={'col-6 col-md-3 p-2'}>
                                                <Ecosystem ecosystem={ecosystem}/>
                                            </div>)
                                        )
                                    })}
                                </div>
                            </div>

                            <div className="tab-pane fade" id="nav-dao" role="tabpanel"
                                 aria-labelledby="nav-dao-tab">
                                <div className={'row mt-5'}>
                                    <div className={'col-12'}>
                                        <h6 className={'mb-2'}>DAOs</h6>
                                    </div>
                                </div>
                                <div className={'row'}>
                                    {daos.map((dao,index) => {
                                        return (
                                            <div key={index} className={'col-6 col-md-3 p-2'}>
                                                <Ecosystem ecosystem={dao}/>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>

                            <div className="tab-pane fade" id="nav-dao" role="tabpanel"
                                 aria-labelledby="nav-dao-tab">
                                <div className={'row mt-5'}>
                                    <div className={'col-12'}>
                                        <h6 className={'mb-2'}>Networks</h6>
                                    </div>
                                </div>
                                <div className={'row'}>
                                    {ecosystems.map((ecosystems,index) => {
                                        return (
                                            <div key={index} className={'col-6 col-md-3 p-2'}>
                                                <Ecosystem ecosystem={ecosystems}/>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>

                            <div className="tab-pane fade" id="nav-nft" role="tabpanel"
                                 aria-labelledby="nav-nft-tab">
                                <div className={'row mt-5'}>
                                    <div className={'col-12'}>
                                        <h6 className={'mb-2'}>NFT Collections</h6>
                                    </div>
                                </div>
                                <div className={'row'}>
                                    {ecosystems.map((ecosystem,index) => {
                                        return (
                                            ecosystem.category === 'NFT' && (<div key={index} className={'col-6 col-md-3 p-2'}>
                                                <Ecosystem ecosystem={ecosystem}/>
                                            </div>)
                                        )
                                    })}
                                </div>
                            </div>

                            <div className="tab-pane fade" id="nav-soon" role="tabpanel"
                                 aria-labelledby="nav-soon-tab">
                                <div className={'row mt-5'}>
                                    <div className={'col-12'}>
                                        <h6 className={'mb-2'}>Coming Soon</h6>
                                    </div>
                                </div>
                                <div className={'row'}>
                                    {hasSoon && ecosystems.map((ecosystem,index) => {
                                        return (
                                            ecosystem.category === 'Soon' && (<div key={index} className={'col-6 col-md-3 p-2'}>
                                                <Ecosystem ecosystem={ecosystem}/>
                                            </div>)
                                        )
                                    })}
                                    {!hasSoon && 
                                        <div className={'text-box'} data-sal="fade">
                                            Have an ongoing project coming up on you want to see on chain ? Let us know. <a className={'p-1'} href={'https://github.com/terpnetwork/website/pulls'} target={'_blank'} rel={'noreferrer'}><i className={'icon-social-github'} aria-label={'Github'}></i></a>
                                        </div>
                                    }
                                </div>
                            </div>


                            <div className="tab-pane fade" id="nav-all" role="tabpanel"
                                 aria-labelledby="nav-all-tab">
                                <div className={'row mt-5'}>
                                    <div className={'col-12'}>
                                        <h6 className={'mb-2'}>All</h6>
                                    </div>
                                </div>

                                <div className={'row'}>
                                    {ecosystems.map((ecosystem, index) => {
                                        return (
                                            ecosystem.category !== 'Contract' && (<div key={index} className={'col-6 col-md-3 p-2'}>
                                                <Ecosystem ecosystem={ecosystem}/>
                                            </div>)
                                        )
                                    })}
                                </div>
                            </div>

                        </div>
                    </div>
                </section>
            </Layout>
        </div>
    )
}

export default EcosystemPage
