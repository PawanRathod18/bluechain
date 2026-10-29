.PHONY: help setup backend frontend chain contracts test dev build clean

help:
	@echo "BlueChain — common tasks"
	@echo ""
	@echo "  make setup       install backend + frontend + contract dependencies"
	@echo "  make backend     run the API on http://127.0.0.1:8000 (reload)"
	@echo "  make frontend    run the React dev server on http://127.0.0.1:5173"
	@echo "  make build       build the frontend into frontend/dist"
	@echo "  make test        run backend + contract test suites"
	@echo "  make chain       start a local Hardhat node on :8545"
	@echo "  make contracts   compile and deploy the contract to localhost"
	@echo "  make clean       remove build output and local databases"

setup:
	pip install -r backend/requirements.txt
	cd frontend && npm install
	cd contracts && npm install

backend:
	cd backend && uvicorn app.main:app --reload --port 8000

frontend:
	cd frontend && npm run dev

build:
	cd frontend && npm run build

test:
	cd backend && python -m pytest -q
	cd contracts && npx hardhat test

chain:
	cd contracts && npx hardhat node

contracts:
	cd contracts && npx hardhat compile && npx hardhat run scripts/deploy.js --network localhost

clean:
	rm -rf backend/bluechain.db backend/storage frontend/dist
	find . -name __pycache__ -type d -prune -exec rm -rf {} +
