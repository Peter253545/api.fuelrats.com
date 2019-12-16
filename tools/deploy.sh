#!/bin/bash

# Variables

DEPLOY_DIR="trash"
SERVICE_NAME=""

# Find deploy target and service name
case $1 in

beta)
  DEPLOY_DIR="dev.api.fuelrats.com"
  SERVICE_NAME="fr-api_dev"
  ;;


master)
  DEPLOY_DIR="api.fuelrats.com"
  SERVICE_NAME="fr-api"
  ;;


*)
  echo "Current branch is not configured for auto-deploy. skipping deployment..."
  exit 1
  ;;
esac

# Move built project files to server
rsync -r --delete-after ./ fuelrats@emmental.fuelrats.com:/var/www/$DEPLOY_DIR/

# restart service
ssh -t fuelrats@emmental.fuelrats.com "sudo systemctl restart $SERVICE_NAME.service"