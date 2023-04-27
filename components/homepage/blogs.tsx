import Carousel from "react-multi-carousel";
import React from "react";

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
        <Carousel
          ssr
          partialVisbile
          deviceType={deviceType}
          itemClass="image-item"
          responsive={responsive}
          autoPlay={false}
        >
          {images.slice(0, 5).map((image: Image) => {
            return (
              <>
                <a
                  href={image.url}
                  rel="noopener noreferrer"
                  target="_blank"
                  key={image.url}
                  className="button"
                >
                  <img
                    draggable={true}
                    alt={image.image}
                    style={{ width: "100%", height: "100%" }}
                    src={image.image}
                  />
                  <div className={"blog-title"}>
                    <h6>{image.subtitle}</h6>
                    <h5>{image.title}</h5>
                  </div>
                </a>
              </>
            );
          })}
        </Carousel>
      </div>
    </section>
  );
};

export default Blogs;
