import { Box, Button, Container, Heading } from '@chakra-ui/react'
import Link from 'next/link'


export const Banner = () => {
    return (
        <section className="banner-section">
        <Container>
            <div className="row">
                <div className="text-center">
                    <Heading className="banner-heading"><span>Decentralized Infrastructure for Terp Culture  </span></Heading>
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
        </Container>
    </section>
    )
}
