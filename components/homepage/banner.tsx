


export const Banner = () => {
    return (
        <section className="banner-section">
        <div className="container">
            <div className="row">
                <div className="col-md-12 col-sm-12 text-center">
                    <p className="banner-heading"><span>TERPNET: Decentralized Infrastructure for Terp Culture  </span></p>
                    <p className="text">
                        Terp Network is a decentralized L1 blockchain hub within the Interchain, powering
                        <span>   a full spectrum of DeFi applications.</span>
                    </p>
                    <div className={"button-section text-center d-inline-block"}>
                    <a href="/delegate" rel="noopener noreferrer"
                        className="button-initial button one">
                        Staking Dashboard
                    </a>
                </div>
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
                            <h2>$66+ Billion</h2>
                            <h6 className="home-desc">Digital Assets on Cosmos Networks </h6>
                        </div>
                        <div className="stats-section">
                            <h2>$790+ Million</h2>
                            <h6 className="home-desc">IBC Volume (30 Days)</h6>
                        </div>
                    </div>

                </div>

            </div>
        </div>
    </section>
    )
}
