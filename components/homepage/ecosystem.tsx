import React from 'react';
import {Card,CardGroup} from 'react-bootstrap';
import {Text} from '@chakra-ui/react';
import cometbft from '../../public/cometbft.png';
import cosmwasm from '../../public/cosmwasm.svg';
import cosmossdk from '../../public/cosmossdk.svg';

export const Ecosystem = () => {
    return (
        <section className="home-ecosystem-section">
            <div className="container">
                <h3 className="section-title">Infusing Censorship Resistant Technology</h3>
                <p className="sub-heading">TerpNET applications bridge self-soviergnty & interoperability into our community. Utilize any Terp Network logic in your buisness model to integrate censorship-resistant solutions & discover amazing opportunities.</p>
                <div className="card-tiles">
                    <CardGroup>
                        <Card >
                            <div >

                                <h3 className='section-title'>What is it?</h3>
                                <p className={' frosted-blog '}>
                                  A community owned smart contract database for creating solutions to problems that exist in our culture.
                                </p>


                            </div>

                        </Card>

                    </CardGroup>
                </div>
            </div>
        </section>
    );
}
