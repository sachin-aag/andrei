#!/usr/bin/env bash
set -euo pipefail

cd /workspace

docker_cmd() {
  if docker info >/dev/null 2>&1; then
    docker "$@"
  else
    sudo docker "$@"
  fi
}

if ! docker info >/dev/null 2>&1 && ! sudo docker info >/dev/null 2>&1; then
  if ! pgrep -x dockerd >/dev/null 2>&1; then
    sudo dockerd >/tmp/dockerd.log 2>&1 &
  fi
  for _ in $(seq 1 60); do
    sudo docker info >/dev/null 2>&1 && break
    sleep 1
  done
fi

docker_cmd compose up -d

for _ in $(seq 1 60); do
  pg_isready -h localhost -p 5432 -U andrei -d andrei_dev >/dev/null 2>&1 && break
  sleep 1
done

if ! pg_isready -h localhost -p 5432 -U andrei -d andrei_dev >/dev/null 2>&1; then
  echo "Postgres did not become ready on localhost:5432" >&2
  exit 1
fi

if [[ ! -f /workspace/.env.local ]]; then
  cat > /workspace/.env.local <<EOF
DATABASE_URL=postgresql://andrei:andrei@localhost:5432/andrei_dev
AUTH_SECRET=$(openssl rand -base64 32)
AUTH_TRUST_HOST=true
AUTH_URL=http://localhost:3000
ALLOW_TEST_LOGIN=true
TEST_AUTH_EMAIL=test.engineer@mjbiopharm.com
ATTACHMENT_STORAGE_BACKEND=local
ALLOW_LOCAL_ATTACHMENT_STORAGE=true
ANDREI_CUSTOMER=demo
NEXT_PUBLIC_ANDREI_CUSTOMER=demo
EOF
fi

psql "${DATABASE_URL:-postgresql://andrei:andrei@localhost:5432/andrei_dev}" \
  -c "CREATE EXTENSION IF NOT EXISTS vector;"
pnpm db:local:push

if ! pnpm set-workspace-password -- test.engineer@mjbiopharm.com 'TempPass123!' --role engineer >/dev/null 2>&1; then
  pnpm set-workspace-password -- test.engineer@mjbiopharm.com 'TempPass123!' --role engineer
fi
