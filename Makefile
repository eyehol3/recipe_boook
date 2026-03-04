REMOTE_HOST = phoneserver
REMOTE_PATH = /data/data/com.termux/files/home/serve/recipe_book
SUPERVISOR_NAME = recipe_book
SUPERVISORCTL = /data/data/com.termux/files/home/.local/bin/supervisorctl
NPM = /data/data/com.termux/files/usr/bin/npm

.PHONY: deploy

deploy:
	@echo "🚀 Syncing source to $(REMOTE_HOST)..."
	ssh $(REMOTE_HOST) "mkdir -p $(REMOTE_PATH)"
	rsync -avz --exclude 'node_modules' --exclude '.git' . $(REMOTE_HOST):$(REMOTE_PATH)/
	
	@echo "📦 Installing dependencies on remote server..."
	ssh $(REMOTE_HOST) "cd $(REMOTE_PATH) && MAKEFLAGS=\"-j1\" $(NPM) install --omit=dev"
	
	@echo "🔄 Restarting service..."
	ssh $(REMOTE_HOST) "$(SUPERVISORCTL) restart $(SUPERVISOR_NAME)"
	@echo "✅ Deployment complete!"
