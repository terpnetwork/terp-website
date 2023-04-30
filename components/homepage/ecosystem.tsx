import React from 'react';
import {
    Box,
    Divider,
    Grid,
    Heading,
    Text,
    Stack,
    Container,
    Link,
    Button,
    Flex,
    Card,
    Icon,
    useColorMode,
    useColorModeValue,
  } from '@chakra-ui/react';


export const Ecosystem = () => {
    return (
        <section className="home-ecosystem-section">
            <div className='silver-gradient'>

                <h3 className="section-title">Infusing Censorship Resistant Technology</h3>
                <p className="sub-heading">Terp Network applications bridge self-soviergnty & interoperability into our community. Utilize any Terp Network logic in your buisness model to integrate censorship-resistant solutions & discover amazing opportunities.</p>
                <div className="card-tiles">
                                <h3 className='section-title'>What is it?</h3>
                    <Container >
                        <Card  className='banner-title-font'> 
                     
                                <Text className='text-ecosystem'>
                                    <span>A community owned smart contract database for creating solutions to problems that exist in our culture.</span>

                                </Text>


                        

                        </Card>

                    </Container>
                </div>
          </div>
        </section>
    );
}
