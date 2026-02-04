# Use official NGINX image as base
FROM nginx:alpine

# Set working directory
WORKDIR /usr/share/nginx/html

# Copy website files
COPY index.html /usr/share/nginx/html/
COPY robots.txt /usr/share/nginx/html/
COPY public /usr/share/nginx/html/public

# Copy installer scripts
COPY install /usr/share/nginx/html/install

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
