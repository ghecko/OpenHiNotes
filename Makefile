# OpenHiNotes Makefile — web app only

WEB_DIR = apps/web

.PHONY: help dev build test lint preview clean

help:
	@echo "OpenHiNotes Make targets:"
	@echo "  make dev     - Start development server"
	@echo "  make build   - Production build"
	@echo "  make test    - Run test suite"
	@echo "  make lint    - Lint code"
	@echo "  make preview - Preview production build"
	@echo "  make clean   - Remove node_modules and build artifacts"

dev:
	cd $(WEB_DIR) && npm run dev

build:
	cd $(WEB_DIR) && npm run build

test:
	cd $(WEB_DIR) && npm test

lint:
	cd $(WEB_DIR) && npm run lint

preview:
	cd $(WEB_DIR) && npm run preview

clean:
	@echo "Removing node_modules and build artifacts..."
	@if [ -d $(WEB_DIR)/node_modules ]; then rm -rf $(WEB_DIR)/node_modules; fi
	@if [ -d $(WEB_DIR)/dist ]; then rm -rf $(WEB_DIR)/dist; fi
