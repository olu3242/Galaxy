#!/usr/bin/env bash
# Galaxy local development setup script
# Run once after cloning: bash infrastructure/scripts/setup.sh

set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BOLD}Galaxy Loop OS — Local Development Setup${NC}"
echo "=========================================="

# Check prerequisites
check_command() {
  if ! command -v "$1" &> /dev/null; then
    echo -e "${RED}✗ $1 not found. Please install $1 and re-run.${NC}"
    exit 1
  else
    echo -e "${GREEN}✓ $1 found${NC}"
  fi
}

echo ""
echo -e "${BOLD}Checking prerequisites...${NC}"
check_command node
check_command pnpm
check_command docker

# Check Node version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo -e "${RED}✗ Node.js 20+ required. Found: $(node --version)${NC}"
  exit 1
fi

# Check pnpm version
PNPM_VERSION=$(pnpm --version | cut -d'.' -f1)
if [ "$PNPM_VERSION" -lt 9 ]; then
  echo -e "${RED}✗ pnpm 9+ required. Found: $(pnpm --version)${NC}"
  exit 1
fi

echo ""
echo -e "${BOLD}Setting up environment...${NC}"
if [ ! -f .env ]; then
  cp .env.example .env
  echo -e "${GREEN}✓ Created .env from .env.example${NC}"
  echo -e "${YELLOW}  → Edit .env with your local values before continuing${NC}"
else
  echo -e "${GREEN}✓ .env already exists${NC}"
fi

echo ""
echo -e "${BOLD}Installing dependencies...${NC}"
pnpm install
echo -e "${GREEN}✓ Dependencies installed${NC}"

echo ""
echo -e "${BOLD}Starting local infrastructure (PostgreSQL + Redis)...${NC}"
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d
echo -e "${GREEN}✓ Infrastructure started${NC}"

echo ""
echo -e "${BOLD}Waiting for PostgreSQL to be ready...${NC}"
until docker exec galaxy_postgres pg_isready -U galaxy -d galaxy_dev > /dev/null 2>&1; do
  echo "  Waiting..."
  sleep 2
done
echo -e "${GREEN}✓ PostgreSQL ready${NC}"

echo ""
echo -e "${BOLD}Building packages...${NC}"
pnpm build --filter=@galaxy/types --filter=@galaxy/config --filter=@galaxy/utils
echo -e "${GREEN}✓ Packages built${NC}"

echo ""
echo "=========================================="
echo -e "${GREEN}${BOLD}Setup complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Edit .env with your API keys (Anthropic, WhatsApp, etc.)"
echo "  2. Run migrations: pnpm --filter @galaxy/api db:migrate"
echo "  3. Start development: pnpm dev"
echo ""
echo "Services running:"
echo "  PostgreSQL: localhost:5432 (user: galaxy, password: galaxy_dev)"
echo "  Redis:      localhost:6379"
echo ""
