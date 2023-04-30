import { Box, Button } from '@chakra-ui/react'
import Link from 'next/link'


export const Banner = () => {
    return (
        <section className="banner-section">
        <div className="container">
            <div className="row">
                <div className="col-md-12 col-sm-12 text-center">
                    <p className="banner-heading"><span>TERP NETWORK: Decentralized Infrastructure for Terp Culture  </span></p>
                    <Box>
                    <p className="text">
                        Terp Network is a decentralized L1 blockchain hub, powering
                        <span> a full spectrum of DeFi applications.</span>
                    </p>
                    </Box>
                    <Button className={"button-section text-center d-inline-block"}>
                    <Link href="/delegate" 
                        className="button-initial button one">
                        Staking Dashboard
                    </Link>
                </Button>
                    <div className="stats-container text-white">
                        <div className="stats-section">
                            <h2>+52</h2>
                            <h6 className="home-desc">Interoperable Zones</h6>
                        </div>
                        <div className="stats-section">
                            <h2>$0</h2>
                            <h6 className="home-desc">Presale Raised</h6>
                        </div>
                        <div className="stats-section">
                            <h2> &gt;50% </h2>
                            <h6 className="home-desc">Supply is Protocol Owned </h6>
                        </div>
                    </div>

                </div>

            </div>
        </div>
    </section>
    )
}
