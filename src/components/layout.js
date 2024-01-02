import React from "react"
import Footer from "./footer";
import Header from "./header";
import {Helmet} from "react-helmet";
import { ParallaxProvider } from 'react-scroll-parallax';


import favicon from '../images/favicons/apple-icon-57x57.png';
import favicon72 from '../images/favicons/apple-icon-72x72.png';

export default function Layout({ children }) {

    return (
        <div>
            <Helmet>
                <html lang="en" />

                <script src="https://cdn.jsdelivr.net/npm/masonry-layout@4.2.2/dist/masonry.pkgd.min.js"
                        integrity="sha384-GNFwBvfVxBkLMJpYMOABq3c+d3KnQxudP/mGPkzpZSTYykLBNsZEnG2D9G/X/+7D"
                        crossOrigin="anonymous" async></script>

                <meta charSet="utf-8" />
                <title>Terp Network - Terp Culture Zone</title>
                <meta name={'title'} content={'Terp Network - Terp Culture Zone'} />
                <meta name={'description'} content={'TerpNET applications bridge self-soviergnty & interoperability into our community.'} />

                <meta content="Smart Contracts Zone" property="og:site_name"/>
                <meta content="https://terp.network/" property="og:url"/>
                <meta property="og:title" content="Terp Network - Terp Culture Zone" />
                <meta name={'og:description'} content={'TerpNET applications bridge self-soviergnty & interoperability into our community.'} />
               

                <link rel="canonical" href="https://terp.network/" />

                <link rel="apple-touch-icon" href={favicon} />
                <link rel="apple-touch-icon" sizes="72x72" href={favicon72} />

                <meta name="theme-color" content="#312526"/>

                <meta property="article:publisher" content="https://terp.network/" />
                <meta property="og:site_name" content="Terp Network - Terp Culture Zone" />
                <meta property="og:type" content="website" />
                <meta name="author" content="Terp Network - Terp Culture Zone" />
                <meta name="twitter:card" content="summary" />
                <meta name="twitter:text:title" content="Terp Network - Terp Culture Zone" />
                <meta property="og:url" content="https://terp.network/" />

             
                <meta property="og:image:height" content={930} />
                <meta property="og:image:width" content={1900} />
                <meta name="twitter:card" content="summary_large_image"/>

            </Helmet>
            <Header/>
            <ParallaxProvider>
                <main>
                    {children}
                    <Footer/>
                </main>
            </ParallaxProvider>
        </div>
    )
}
