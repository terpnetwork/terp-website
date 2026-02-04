# Terp Network Website

Official website for Terp Network, featuring the terp-core installer integration.

## Features

- Responsive dark-themed landing page with animated backgrounds
- Integrated terp-core installer with tab-based installation options
- Docker-ready deployment
- SEO optimized with sitemap and meta tags

## Development

```sh
python3 -m http.server 8000
```

## Installation Scripts

The website serves two installation methods:

1. **Shell Script** (macOS & Linux): `curl -sL https://terp.network/install | python3`
2. **UV Tool**: `uvx --from terp-core terpd`

### Verifying Installation Script Integrity

Before running the installation scripts, verify their integrity using checksums:

#### SHA256 Checksums

```
0e2743c117a3be8e5648427e0e1d8863b7ac59e1e1cff428152eda99cf9dc970  terp-installer.py
a233f0863b439273e772b14d61b985c8a20e719c72506399adebff03551596c7  terp-installer.sh
```

#### BLAKE3 Checksums

```
3113805970499a614c8dda2b8d2730bade6f0b0a3d5a8fa99bac4e9856396cee  terp-installer.py
8c1826931f3c9c620dddabe6756881a2a51aa977c24b60842eca697dfd40ebb7  terp-installer.sh
```

#### Verification Instructions

**Using SHA256:**

```bash
# Download the script
curl -sL https://terp.network/install > terp-installer.py

# Verify with sha256sum (Linux)
echo "0e2743c117a3be8e5648427e0e1d8863b7ac59e1e1cff428152eda99cf9dc970  terp-installer.py" | sha256sum -c

# Verify with shasum (macOS)
echo "0e2743c117a3be8e5648427e0e1d8863b7ac59e1e1cff428152eda99cf9dc970  terp-installer.py" | shasum -a 256 -c
```

**Using BLAKE3:**

```bash
# Download the script
curl -sL https://terp.network/install > terp-installer.py

# Install b3sum if not already installed
# macOS: brew install b3sum
# Linux: cargo install b3sum
# or download from: https://github.com/BLAKE3-team/BLAKE3

# Verify with b3sum
echo "3113805970499a614c8dda2b8d2730bade6f0b0a3d5a8fa99bac4e9856396cee  terp-installer.py" | b3sum --check
```

**Expected output on successful verification:**

```
terp-installer.py: OK
```

⚠️ **Security Note:** Always verify checksums from multiple trusted sources (GitHub releases, official documentation, etc.) to ensure the checksums themselves haven't been tampered with.

## Running Locally

### Using Docker

Build and run the Docker container:

```bash
docker-compose up --build
```

The website will be available at `http://localhost:8080`

### Manual Build

Build the Docker image manually:

```bash
docker build -t terpnetwork/terp-network:latest .
```

Run the container:

```bash
docker run -p 8080:80 terpnetwork/terp-network:latest
```

## Project Structure

```
terp.network/
├── index.html              # Main website file
├── Dockerfile              # Docker configuration
├── docker-compose.yml      # Docker Compose configuration
├── nginx.conf              # NGINX server configuration
├── robots.txt              # SEO robots file
├── public/                 # Public assets
│   ├── favicon/           # Favicon files
│   ├── sitemap.xml        # SEO sitemap
│   └── site.webmanifest   # PWA manifest
└── install/                # Installation scripts
    ├── terp-installer.py  # Python installer script
    └── terp-installer.sh  # Shell installer script
```

## Deployment

### Docker Registry

Push to Docker registry:

```bash
docker-compose build
docker push terpnetwork/terp-network:latest
```

### Akash Network

Deploy to Akash using the provided SDL (see terp-installer repo for SDL examples).

## Installation Script Endpoints

- `/run` - Shell installation script
- `/install` - Python installation script

## Development

The website uses:

- Pure HTML/CSS/JavaScript (no build tools required)
- Satoshi font from CDN Fonts
- SVG graphics for icons and logos
- Canvas API for animated background effects

## Links

- Documentation: <https://docs.terp.network>
- GitHub: <https://github.com/terpnetwork>
- Twitter: <https://x.com/terpnetofficial>
- Discord: <https://discord.gg/W3QnHe77S6>

## License

See the main Terp Network repository for licensing information.
