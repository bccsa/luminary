#!/bin/sh

echo "Starting Docker..."
sh -c "docker run -p 5984:5984 -e COUCHDB_USER=admin -e COUCHDB_PASSWORD=password -d couchdb:3.3.3"

wait_for_couchdb() {
  echo "Waiting for CouchDB..."

  while ! curl -f http://127.0.0.1:5984/ &> /dev/null
  do
    echo "."
    sleep 1
  done
}
wait_for_couchdb
