import React from "react";
import Image from  'next/image'

interface Image {
  url: string;
  image: string;
  title: string;
  subtitle: string;
}

interface Props {
  deviceType: string;
}

const responsive = {
  desktop: {
    breakpoint: { max: 3000, min: 1024 },
    items: 3,
  },
  tablet: {
    breakpoint: { max: 1024, min: 464 },
    items: 2,
  },
  mobile: {
    breakpoint: { max: 464, min: 0 },
    items: 1,
  },
};

const images: Image[] = [
  {
    url: "https://terpnetwork.medium.com",
    image:
      "https://miro.medium.com/max/1400/1*BB8Dhd_9iQFN6ru74OPOvQ.jpeg",
    title: "The Vision for Terp Network",
    subtitle: "Terp Network",
  },
];

const Blogs: React.FC<Props> = ({ deviceType }) => {
  return (
    <section className="stay-updated">
      <div className="container">
         </div>
    </section>
  );
};

export default Blogs;
