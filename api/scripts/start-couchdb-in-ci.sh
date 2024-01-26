#!/bin/sh

echo "Starting Docker..."
sh -c "docker run -p 5984:5984 -e COUCHDB_USER=admin -e COUCHDB_PASSWORD=password -d couchdb:3.3.3"

wait_for_couchdb() {
  echo "Waiting for CouchDB..."

    until $(curl --output /dev/null --silent --head --fail http://127.0.0.1:5984); do
        printf '.'
        sleep 1
    done
}
wait_for_couchdb
