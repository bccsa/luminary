#!/bin/sh

echo "Starting MinIO Docker..."
sh -c "docker run -d \
   -p 9000:9000 \
   -e \"MINIO_ACCESS_KEY=minio\" \
   -e \"MINIO_SECRET_KEY=minio123\" \
   quay.io/minio/minio server /data"

wait_for_minio() {
  echo "Waiting for MinIO..."

    until $(curl --output /dev/null --silent --head --fail http://127.0.0.1:5984); do
        printf '.'
        sleep 1
    done
}
wait_for_minio
