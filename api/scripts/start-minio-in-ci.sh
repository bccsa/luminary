#!/bin/sh
set -eu

# MinIO's official images were withdrawn upstream (quay.io 401, Docker Hub 404); Chainguard
# rebuilds it from source. Only :latest is free, so pin its multi-arch index digest.
MINIO_IMAGE="cgr.dev/chainguard/minio@sha256:6a1d0b45c8669726bba580ced0bfa4cb9fdeed1ed636dfabd81d1577beb6937b"
MINIO_TIMEOUT_SECONDS=60

echo "Starting MinIO Docker..."
docker run -d \
   --name minio \
   -p 9000:9000 \
   -p 9001:9001 \
   -e "MINIO_ROOT_USER=minio" \
   -e "MINIO_ROOT_PASSWORD=minio123" \
   "$MINIO_IMAGE" server /data --console-address ":9001"

echo "Waiting for MinIO..."
elapsed=0
until curl --output /dev/null --silent --fail http://127.0.0.1:9000/minio/health/live; do
    if [ "$elapsed" -ge "$MINIO_TIMEOUT_SECONDS" ]; then
        echo
        echo "MinIO did not become healthy within ${MINIO_TIMEOUT_SECONDS}s" >&2
        docker logs minio >&2 || true
        exit 1
    fi
    printf '.'
    sleep 1
    elapsed=$((elapsed + 1))
done
echo
echo "MinIO is up"
